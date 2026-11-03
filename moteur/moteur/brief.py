"""Brief du matin : prix officiels, prévisions et marché du jour, plus une sélection d'actualités.

Publié une fois par jour, entre 6 h et 7 h à Bruxelles, par la tâche quotidienne (au-delà de 7 h, il est
marqué « en retard »). Aucune IA : les actualités sont choisies par mots-clés et sources reconnues, et
seuls le titre, le média, l'heure et le lien sont repris. Rien n'est rédigé ni résumé.
"""

from __future__ import annotations

import datetime as dt
import re
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

import pandas as pd

from . import modele

BRUXELLES = ZoneInfo("Europe/Brussels")
HEURE_DEBUT, HEURE_FIN = 6, 7  # fenêtre de publication, heure de Bruxelles

# Google News, édition Belgique en français : agrège les médias belges et internationaux, articles datés
URL_ACTUALITES = ("https://news.google.com/rss/search?q=p%C3%A9trole+OR+Brent+OR+OPEP+OR+carburant+OR+diesel"
                  "+OR+raffinerie&hl=fr&gl=BE&ceid=BE:fr")
FRAICHEUR_H = 36
NB_ACTUALITES = 5

# Mots-clés cherchés dans le titre (sans accents, en minuscules) et leur poids
MOTS_CLES = {
    "prix maximum": 3, "spf economie": 3, "accise": 3, "carburant": 3, "diesel": 3, "gasoil": 3,
    "station-service": 3, "stations-service": 3, "a la pompe": 3,
    "brent": 2, "opep": 2, "opec": 2, "baril": 2, "raffiner": 2, "petrole": 2, "petrolier": 2, "wti": 2,
    "essence": 1, "sanction": 1, "or noir": 1,
}
SOURCES_RECONNUES = (
    "lesoir", "le soir", "lalibre", "la libre", "rtbf", "7sur7", "lecho", "l'echo", "dhnet", "sudinfo",
    "belga", "rtl", "lavenir", "l'avenir", "le monde", "les echos", "le figaro", "reuters", "afp",
    "zonebourse", "boursorama", "bfm", "france 24", "tf1info", "l'usine nouvelle", "la tribune", "investir",
)


def sans_accents(texte: str) -> str:
    return unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode().lower()


def heure_bruxelles(maintenant: dt.datetime) -> dt.datetime:
    return maintenant.astimezone(BRUXELLES)


def publication(maintenant: dt.datetime, deja_publie: bool, force: bool = False) -> tuple[bool, str]:
    """Faut-il publier le brief maintenant ? (oui/non, raison)"""
    local = heure_bruxelles(maintenant)
    if deja_publie and not force:
        return False, f"brief du {local.date()} déjà publié"
    if local.hour < HEURE_DEBUT and not force:
        return False, f"trop tôt ({local:%H:%M} à Bruxelles, publication à partir de {HEURE_DEBUT} h)"
    return True, "en retard" if local.hour >= HEURE_FIN else "à l'heure"


# --- Actualités -----------------------------------------------------------------------------------

def lire_flux(xml: str) -> list[dict]:
    """Articles d'un flux RSS Google News : titre (sans le média), média, lien, date de publication (UTC)."""
    articles = []
    for item in ET.fromstring(xml).iter("item"):
        titre = (item.findtext("title") or "").strip()
        media = (item.findtext("source") or "").strip()
        if media and titre.endswith(f" - {media}"):
            titre = titre[: -len(media) - 3].strip()
        try:
            publie = parsedate_to_datetime(item.findtext("pubDate") or "").astimezone(dt.timezone.utc)
        except (TypeError, ValueError):
            continue
        lien = (item.findtext("link") or "").strip()
        if titre and lien:
            articles.append({"titre": titre, "media": media or "source inconnue", "lien": lien,
                             "publie_le": publie.isoformat(timespec="minutes")})
    return articles


def _score(article: dict) -> tuple[int, list[str]]:
    titre = sans_accents(article["titre"])
    mots = [m for m in MOTS_CLES if m in titre]
    score = sum(MOTS_CLES[m] for m in mots)
    if score and "belg" in titre:
        score += 2
    if score and any(s in sans_accents(article["media"]) for s in SOURCES_RECONNUES):
        score += 1
    return score, mots


# Mots trop courants dans les titres pour indiquer un même sujet
MOTS_VIDES = {"bonne", "nouvelle", "litre", "centime", "moin", "plu", "prix", "pour", "avec", "dans", "sans", "jusqu",
              "apre", "selon", "comment", "pourquoi", "cette", "leur", "sont", "tout", "fortement", "encore", "deja"}


def _mots(titre: str) -> set[str]:
    """Mots significatifs du titre, au singulier approximatif (« barils » = « baril »)."""
    titre = re.sub(r"(\d)[ .](\d{3})", r"\1\2", sans_accents(titre))  # « 260.000 » = « 260000 »
    return {m.rstrip("sx") for m in re.findall(r"[a-z0-9]+", titre) if len(m) > 3} - MOTS_VIDES


# Mots du domaine présents dans presque tous les titres : ils ne suffisent pas à dire « même sujet »
MOTS_DU_DOMAINE = {"belgique", "belge", "pompe", "baisse", "hausse", "carburant", "petrole", "petrolier", "essence",
                   "diesel", "gasoil", "baril", "brent", "opep", "marche", "dollar"}


def meme_sujet(a: str, b: str) -> bool:
    """Même sujet : 2 mots distinctifs en commun, ou 1 distinctif parmi 3 mots communs, ou la moitié des mots."""
    ma, mb = _mots(a), _mots(b)
    commun = ma & mb
    distinctifs = commun - MOTS_DU_DOMAINE
    return (len(distinctifs) >= 2 or (len(distinctifs) == 1 and len(commun) >= 3)
            or len(commun) / max(1, len(ma | mb)) >= 0.5)


def selectionner(articles: list[dict], maintenant: dt.datetime, n: int = NB_ACTUALITES) -> list[dict]:
    """Articles récents dont le titre contient au moins un mot-clé, classés par pertinence puis fraîcheur,
    un seul article par sujet (le plus pertinent)."""
    limite = maintenant - dt.timedelta(hours=FRAICHEUR_H)
    candidats = []
    for a in articles:
        publie = dt.datetime.fromisoformat(a["publie_le"])
        score, mots = _score(a)
        if score and limite <= publie <= maintenant + dt.timedelta(minutes=5):
            candidats.append({**a, "mots_cles": mots, "_score": score})
    candidats.sort(key=lambda a: (a["_score"], a["publie_le"]), reverse=True)
    retenus: list[dict] = []
    for a in candidats:
        if any(meme_sujet(a["titre"], r["titre"]) for r in retenus):
            continue
        retenus.append(a)
        if len(retenus) == n:
            break
    retenus.sort(key=lambda a: a["publie_le"], reverse=True)
    return [{k: v for k, v in a.items() if k != "_score"} for a in retenus]


def telecharger_actualites() -> list[dict]:
    req = urllib.request.Request(URL_ACTUALITES, headers={"User-Agent": "Mozilla/5.0 (fuel-predictor)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return lire_flux(r.read().decode("utf-8"))


# --- Prix et marché ----------------------------------------------------------------------------------

def prix_du_jour(prix: pd.DataFrame, jour: dt.date) -> dict:
    """Pour chaque carburant : prix en vigueur, depuis quand, et prochain prix déjà publié s'il change
    (une ligne be.STAT future qui reconduit le prix du jour n'est pas une annonce officielle)."""
    resultat = {}
    for produit in ("e10", "e98", "b7"):
        serie = prix[prix["produit"] == produit].set_index("date_application")["prix_tvac"].sort_index()
        passe = serie[serie.index <= pd.Timestamp(jour)]
        if passe.empty:
            continue
        actuel = float(passe.iloc[-1])
        changements = passe[(passe - actuel).abs() >= 1e-9]
        depuis = passe[passe.index > changements.index[-1]].index[0] if len(changements) else passe.index[0]
        futur = serie[(serie.index > pd.Timestamp(jour)) & ((serie - actuel).abs() >= 1e-9)]
        resultat[produit] = {
            "nom": modele.NOMS[produit], "prix": actuel, "depuis": depuis.date().isoformat(),
            "prochain": None if futur.empty else {"date": futur.index[0].date().isoformat(), "prix": float(futur.iloc[0])},
        }
    return resultat


def _variation(serie: pd.Series, nom: str, unite: str) -> dict | None:
    serie = serie.dropna().sort_index()
    if len(serie) < 2:
        return None
    return {"nom": nom, "unite": unite, "valeur": round(float(serie.iloc[-1]), 4), "date": serie.index[-1].date().isoformat(),
            "precedent": round(float(serie.iloc[-2]), 4), "date_precedent": serie.index[-2].date().isoformat(),
            "variation_pct": round(100 * (float(serie.iloc[-1]) / float(serie.iloc[-2]) - 1), 2)}


def marche(cotations: pd.DataFrame, taux: pd.DataFrame) -> list[dict]:
    """Dernière clôture connue et variation par rapport à la séance précédente, dates comprises."""
    lignes = []
    for serie, nom in (("brent", "Brent (baril)"), ("ho", "Gasoil New York"), ("rbob", "Essence New York")):
        c = cotations[cotations["serie"] == serie]
        if len(c):
            v = _variation(c.set_index("date_seance")["valeur"], nom, c["unite"].iloc[-1])
            if v:
                lignes.append({"serie": serie, **v})
    t = taux[taux["paire"] == "EUR/USD"]
    v = _variation(t.set_index("date_cotation")["valeur"], "Euro en dollars", "USD")
    if v:
        lignes.append({"serie": "eurusd", **v})
    return lignes


def construire(prix: pd.DataFrame, cotations: pd.DataFrame, taux: pd.DataFrame, previsions: list[dict],
               articles: list[dict] | None, maintenant: dt.datetime, statut: str, erreur_actualites: str = "") -> dict:
    jour = heure_bruxelles(maintenant).date()
    return {
        "date": jour.isoformat(),
        "genere_le": maintenant.astimezone(dt.timezone.utc).isoformat(timespec="seconds"),
        "en_retard": statut == "en retard",
        "prix": prix_du_jour(prix, jour),
        "previsions": previsions,
        "marche": marche(cotations, taux),
        "actualites": selectionner(articles, maintenant) if articles else [],
        "actualites_erreur": erreur_actualites,
        "actualites_source": "Google News (édition Belgique, français), sélection automatique par mots-clés",
    }
