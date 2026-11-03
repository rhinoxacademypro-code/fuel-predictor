"""Commandes du moteur Fuel Predictor.

  python -m moteur initialiser   chargement de l'historique (Brafco, be.STAT 365 j, BCE, cotations depuis 2014)
  python -m moteur collecter     mise à jour quotidienne (be.STAT 30 j, BCE et cotations des 15 derniers jours)
  python -m moteur prevoir       prévisions J+1 à J+3 du jour (option --date AAAA-MM-JJ)
  python -m moteur evaluer       fiabilité hors échantillon et effet du recalibrage
  python -m moteur brief         brief du matin (une fois par jour, à partir de 6 h à Bruxelles ; option --force)

Dépôt de données : dossier FUEL_DEPOT (par défaut moteur/depot, enregistré dans le dépôt GitHub).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import traceback
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from . import brief as brief_matin
from . import fiabilite, modele, sources
from .depot import DepotLocal, maintenant

ICI = Path(__file__).resolve().parent.parent
PRIORITE_PRIX = ["bestat", "spf", "brafco"]  # be.STAT (officiel) l'emporte sur l'historique Brafco


def depot():
    return DepotLocal(Path(os.environ.get("FUEL_DEPOT", ICI / "depot")))


def aujourdhui_bruxelles() -> dt.date:
    return dt.datetime.now(ZoneInfo("Europe/Brussels")).date()


def _tache(d, nom: str, fonction, table: str, **kw) -> bool:
    debut = maintenant()
    try:
        lignes = fonction()
        n = d.ecrire(table, lignes, **kw)
        d.journaliser(nom, debut, True, n)
        print(f"  ok   {nom:<20} {n} lignes")
        return True
    except Exception as e:  # une source en panne ne bloque pas les autres
        d.journaliser(nom, debut, False, 0, f"{type(e).__name__}: {e}")
        print(f"  ÉCHEC {nom:<19} {type(e).__name__}: {e}")
        return False


def initialiser(_):
    d = depot()
    debut = dt.date(2014, 6, 1)
    ok = [
        _tache(d, "historique_brafco", lambda: sources.prix_brafco(ICI / "donnees_initiales" / "brafco"), "prix_officiels",
               priorite_source=PRIORITE_PRIX),
        _tache(d, "bestat_365", lambda: sources.prix_bestat(sources.VUE_365_JOURS), "prix_officiels", priorite_source=PRIORITE_PRIX),
        _tache(d, "bce_eurusd", lambda: sources.eurusd(debut), "taux_change"),
        _tache(d, "cotations_yahoo", lambda: sources.cotations_yahoo(debut), "cotations"),
    ]
    return 0 if all(ok) else 1


def collecter(_):
    d = depot()
    debut = aujourdhui_bruxelles() - dt.timedelta(days=15)
    ok = [
        _tache(d, "bestat_30", sources.prix_bestat, "prix_officiels", priorite_source=PRIORITE_PRIX),
        _tache(d, "bce_eurusd", lambda: sources.eurusd(debut), "taux_change"),
        _tache(d, "cotations_yahoo", lambda: sources.cotations_yahoo(debut), "cotations"),
    ]
    return 0 if all(ok) else 1


def _charger(d):
    prix = d.lire("prix_officiels")
    x_eur = modele.cotations_eur_litre(d.lire("cotations"), d.lire("taux_change"))
    return prix, x_eur


def prevoir(args):
    d = depot()
    emission = dt.date.fromisoformat(args.date) if args.date else aujourdhui_bruxelles()
    # Une date passée = simulation rétrospective : rien n'est archivé (les prévisions archivées
    # doivent l'être avant que le résultat soit connu) et seuls les prix connus à ce jour-là sont utilisés.
    retro = emission < aujourdhui_bruxelles()
    prix, x_eur = _charger(d)
    emise_le = maintenant()
    resultats = []
    for produit in ("e10", "e98", "b7"):
        serie = prix[prix["produit"] == produit].set_index("date_application")["prix_tvac"].sort_index()
        connus = serie[serie.index <= pd.Timestamp(emission)]     # rien du futur pour les variables
        df = modele.variables(connus, x_eur, produit)
        modeles, _ = modele.entrainer(df)
        for p in modele.prevoir(df, modeles, produit, emission, connus if retro else serie):
            resultats.append({"emise_le": emise_le, **p})
    sortie = ICI / "sorties"
    sortie.mkdir(exist_ok=True)
    nom = f"previsions-{emission.isoformat()}{'-retro' if retro else ''}.json"
    (sortie / nom).write_text(json.dumps(resultats, indent=1, ensure_ascii=False))
    if retro:
        print(f"Simulation rétrospective du {emission} : non archivée.")
    else:
        d.ecrire("previsions", pd.DataFrame(resultats))
    for r in resultats:
        tag = "certain" if r["certain"] else f"conf. {r['confiance']:.0%}"
        print(f"{modele.NOMS[r['produit']]:<15} J+{r['horizon']} ({r['date_cible']})  "
              f"baisse {r['p_baisse']:>4.0%}  stable {r['p_stable']:>4.0%}  hausse {r['p_hausse']:>4.0%}  "
              f"scénario {r['variation_estimee']:+.3f} €/L  [{r['intervalle_bas']:+.3f} ; {r['intervalle_haut']:+.3f}]  {tag}")
        print(f"    {r['explication']}")
    return 0


def evaluer(_):
    d = depot()
    prix, x_eur = _charger(d)
    rapport = {"genere_le": maintenant(), "modele_version": modele.VERSION, "produits": {},
               "direct": fiabilite.direct(d.lire("previsions"), prix)}
    for produit in ("e10", "e98", "b7"):
        serie = prix[prix["produit"] == produit].set_index("date_application")["prix_tvac"].sort_index()
        df = modele.variables(serie, x_eur, produit)
        horizons, rejoues = {}, {}
        for h in modele.HORIZONS:
            horizons[h], rejoues[h] = fiabilite.historique(df, h)
            hh = horizons[h]
            print(f"{modele.NOMS[produit]:<15} J+{h}  gain vs climatologie {hh['gain_vs_climatologie_pct']:+.1f} %  "
                  f"vs naïf {hh['gain_vs_naif_pct']:+.1f} %  changements repérés {hh['changements_reperes_pct']} %  "
                  f"jours certains démentis {hh['jours_certains_dementis']}/{hh['jours_certains']}")
        ind = fiabilite.indicateur(rejoues[1], rejoues[2])
        print(f"{'':<15} indicateur : {ind}")
        rapport["produits"][produit] = {"nom": modele.NOMS[produit], "horizons": horizons, "indicateur": ind}
    print("prévisions archivées :", rapport["direct"])
    sortie = ICI / "sorties"
    sortie.mkdir(exist_ok=True)
    (sortie / "fiabilite.json").write_text(json.dumps(rapport, indent=1, ensure_ascii=False, allow_nan=False))
    return 0


def brief(args):
    d = depot()
    maintenant = dt.datetime.now(dt.timezone.utc)
    dossier = ICI / "sorties" / "briefs"
    fichier = dossier / f"{brief_matin.heure_bruxelles(maintenant).date().isoformat()}.json"
    publier, raison = brief_matin.publication(maintenant, fichier.exists(), args.force)
    if not publier:
        print(f"Brief non publié : {raison}.")
        return 0
    try:
        articles, erreur = brief_matin.telecharger_actualites(), ""
    except Exception as e:  # sans actualités, le brief reste utile (prix, prévisions, marché)
        articles, erreur = None, f"{type(e).__name__}: {e}"
        print(f"  ÉCHEC actualités : {erreur}")
    fichiers = sorted((ICI / "sorties").glob("previsions-????-??-??.json"))
    previsions = json.loads(fichiers[-1].read_text()) if fichiers else []
    contenu = brief_matin.construire(d.lire("prix_officiels"), d.lire("cotations"), d.lire("taux_change"), previsions,
                                     articles, maintenant, raison, "actualités indisponibles" if erreur else "")
    dossier.mkdir(parents=True, exist_ok=True)
    fichier.write_text(json.dumps(contenu, indent=1, ensure_ascii=False, allow_nan=False))
    print(f"Brief du {contenu['date']} publié ({raison}) : {len(contenu['actualites'])} actualités, "
          f"{len(contenu['marche'])} cotations, {len(previsions)} prévisions.")
    for a in contenu["actualites"]:
        print(f"  - {a['publie_le'][:16]} {a['media']} : {a['titre']}")
    return 0


def main():
    ap = argparse.ArgumentParser(prog="moteur")
    sous = ap.add_subparsers(dest="commande", required=True)
    sous.add_parser("initialiser").set_defaults(f=initialiser)
    sous.add_parser("collecter").set_defaults(f=collecter)
    p = sous.add_parser("prevoir")
    p.add_argument("--date")
    p.set_defaults(f=prevoir)
    sous.add_parser("evaluer").set_defaults(f=evaluer)
    b = sous.add_parser("brief")
    b.add_argument("--force", action="store_true", help="publier même hors fenêtre ou si déjà publié")
    b.set_defaults(f=brief)
    args = ap.parse_args()
    try:
        sys.exit(args.f(args))
    except Exception:
        traceback.print_exc()
        sys.exit(2)


if __name__ == "__main__":
    main()
