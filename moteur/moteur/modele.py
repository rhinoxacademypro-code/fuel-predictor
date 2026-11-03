"""Moteur de prévision du prix maximum belge (J+1, J+2, J+3).

Méthode retenue par l'étude de faisabilité (etude-faisabilite/RAPPORT-FAISABILITE.md) :
régression logistique multinomiale (baisse / stable / hausse) sur l'écart des cotations depuis le
dernier changement de prix, le calendrier du SPF et la volatilité, puis recalibrage isotonique de la
probabilité de changement (le modèle brut est trop confiant au-dessus de 60 %).

Règle anti-fuite : une prévision émise le jour T n'utilise que les prix officiels jusqu'à T et les
cotations des séances strictement antérieures à T.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from math import erf, sqrt

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .calendrier import jour_de_calcul, motif_sans_calcul

VERSION = "logit-iso-1.0"
HORIZONS = (1, 2, 3)
CLASSES = np.array([-1, 0, 1])
TOL = 0.0005
GALLON_L, BARIL_L = 3.78541, 158.987
PROXY = {"b7": "ho", "e10": "rbob", "e98": "rbob"}
NOM_PROXY = {"ho": "diesel/fioul New York", "rbob": "essence RBOB New York"}
NOMS = {"e10": "Essence 95 E10", "e98": "Essence 98 E5", "b7": "Diesel B7"}
DEBUT = pd.Timestamp("2015-03-01")
DEBUT_OOF = 2017
P_MAX = 0.90


# --------------------------------------------------------------------------- variables

def cotations_eur_litre(cotations: pd.DataFrame, change: pd.DataFrame) -> pd.DataFrame:
    """Séries de séance converties en €/L (dollars convertis au taux BCE du même jour)."""
    large = cotations.pivot(index="date_seance", columns="serie", values="valeur").sort_index()
    fx = change.set_index("date_cotation")["valeur"].sort_index()
    fx = fx.reindex(large.index.union(fx.index)).ffill().reindex(large.index)
    out = pd.DataFrame(index=large.index)
    out["ho"] = large["ho"] / GALLON_L / fx
    out["rbob"] = large["rbob"] / GALLON_L / fx
    out["brent"] = large["brent"] / BARIL_L / fx
    return out.dropna()


def variables(P: pd.Series, x_eur: pd.DataFrame, produit: str) -> pd.DataFrame:
    """Une ligne par jour d'émission T (jusqu'au dernier prix connu), cibles à J+1..J+3 si connues."""
    P = P.sort_index()
    jours = pd.date_range(P.index.min(), P.index.max(), freq="D")
    P = P.reindex(jours).ffill()

    def vue(s: pd.Series) -> pd.Series:
        # valeur de la dernière séance STRICTEMENT antérieure à chaque jour
        return s.reindex(s.index.union(jours)).ffill().shift(1).reindex(jours)

    x = x_eur[PROXY[produit]]
    xq, ma7 = vue(x), vue(x.rolling(7).mean())
    vol, ret1 = vue(x.diff().rolling(20).std()), vue(x.diff())
    xb = vue(x_eur["brent"])

    chg = P.diff().abs() > 1e-6
    ref = pd.Series(np.nan, index=jours)
    ref[chg] = xq.shift(1)[chg]          # cotation connue lors du calcul qui a produit le changement
    ref = ref.ffill()
    ref_b = pd.Series(np.nan, index=jours)
    ref_b[chg] = xb.shift(1)[chg]
    ref_b = ref_b.ffill()

    cal = pd.Series([int(jour_de_calcul(d.date())) for d in jours], index=jours)
    k = cal.groupby(chg.cumsum()).cumsum().clip(upper=15)
    dernier_chg = pd.Series(np.where(chg, jours, pd.NaT), index=jours).ffill()

    df = pd.DataFrame({
        "P": P, "D": xq - ref, "MA": ma7 - ref, "k": k, "vol": vol, "ret1": ret1,
        "D_rel": (xq - ref) / ref, "D_brent": xb - ref_b, "dernier_changement": dernier_chg,
    })
    for h in HORIZONS:
        fenetre = [[jour_de_calcul((d + dt.timedelta(i)).date()) for i in range(h)] for d in jours]
        df[f"n_calc_{h}"] = [min(sum(f), 3) for f in fenetre]
        df[f"admin_{h}"] = [int(any((d + dt.timedelta(i)).day == 1 and (d + dt.timedelta(i)).month in (1, 4, 7, 10)
                                    for i in range(1, h + 1))) for d in jours]
        delta = P.shift(-h) - P
        df[f"delta_{h}"] = delta
        df[f"classe_{h}"] = np.sign(delta.where(delta.abs() > TOL, 0))
    df = df[df.index >= DEBUT].dropna(subset=["D", "MA", "vol", "ret1", "D_brent"])
    return df


def matrice(df: pd.DataFrame, h: int) -> np.ndarray:
    n = df[f"n_calc_{h}"]
    return np.column_stack([
        df["D"], df["MA"], np.abs(df["D"]), df["k"], n, df["vol"], df["ret1"], df["D"] * n,
        df[f"admin_{h}"], df["D_rel"], df["D_brent"], df["D_brent"] * n,
    ])


# --------------------------------------------------------------------------- modèle

def _logistique():
    return make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000))


def _probas(modele, X: np.ndarray) -> np.ndarray:
    p = np.zeros((len(X), 3))
    brut = modele.predict_proba(X)
    for j, c in enumerate(modele.classes_):
        p[:, list(CLASSES).index(int(c))] = brut[:, j]
    return p


def recalibrer(p: np.ndarray, iso: IsotonicRegression | None) -> np.ndarray:
    """Recalibre la probabilité de changement, puis répartit hausse/baisse dans le même rapport."""
    if iso is None:
        return p
    pc = p[:, 0] + p[:, 2]
    # plafond : une prévision incertaine n'annonce jamais plus de 90 % (l'isotonique sur-ajuste aux extrêmes)
    pc_cal = np.clip(iso.predict(pc), 0.0, P_MAX)
    part_hausse = np.divide(p[:, 2], pc, out=np.full(len(p), 0.5), where=pc > 1e-12)
    return np.column_stack([pc_cal * (1 - part_hausse), 1 - pc_cal, pc_cal * part_hausse])


@dataclass
class ModeleHorizon:
    h: int
    logistique: object
    iso: IsotonicRegression | None
    amp_a: float      # |Δ| ≈ amp_a·|D| + amp_b quand le prix change
    amp_b: float
    amp_sigma: float


def _incertain(df: pd.DataFrame, h: int) -> pd.Series:
    return (df[f"n_calc_{h}"] > 0) & df[f"classe_{h}"].notna()


def _ajuster(df: pd.DataFrame, h: int, iso: IsotonicRegression | None) -> ModeleHorizon:
    t = df[_incertain(df, h)]
    modele = _logistique().fit(matrice(t, h), t[f"classe_{h}"].astype(int))
    c = t[t[f"classe_{h}"] != 0]
    a, b = np.polyfit(np.abs(c["D"]), np.abs(c[f"delta_{h}"]), 1)
    a, b = max(a, 0.0), max(b, 0.0)
    sigma = float(np.std(np.abs(c[f"delta_{h}"]) - (a * np.abs(c["D"]) + b)))
    return ModeleHorizon(h, modele, iso, float(a), float(b), sigma)


def predictions_hors_echantillon(df: pd.DataFrame, h: int) -> pd.DataFrame:
    """Walk-forward annuel : chaque année est prédite par un modèle entraîné sur les années d'avant."""
    morceaux = []
    for annee in range(DEBUT_OOF, df.index.max().year + 1):
        debut = pd.Timestamp(f"{annee}-01-01")
        train = df[df.index + pd.Timedelta(days=h) < debut]
        test = df[(df.index.year == annee) & _incertain(df, h)]
        if test.empty or train.empty:
            continue
        m = _ajuster(train, h, None)
        p = _probas(m.logistique, matrice(test, h))
        morceaux.append(pd.DataFrame({"p_baisse": p[:, 0], "p_stable": p[:, 1], "p_hausse": p[:, 2],
                                      "classe": test[f"classe_{h}"].astype(int), "annee": annee,
                                      "delta": test[f"delta_{h}"], "amplitude": m.amp_a * np.abs(test["D"]) + m.amp_b,
                                      "n_calc": test[f"n_calc_{h}"]},
                                     index=test.index))
    return pd.concat(morceaux)


def calibrateur(oof: pd.DataFrame) -> IsotonicRegression:
    iso = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip")
    iso.fit(oof["p_baisse"] + oof["p_hausse"], (oof["classe"] != 0).astype(float))
    return iso


def entrainer(df: pd.DataFrame) -> tuple[dict, dict]:
    """Modèles finaux (toutes les données) + calibrateurs ajustés sur les prédictions hors échantillon."""
    modeles, oofs = {}, {}
    for h in HORIZONS:
        oofs[h] = predictions_hors_echantillon(df, h)
        modeles[h] = _ajuster(df, h, calibrateur(oofs[h]))
    return modeles, oofs


# --------------------------------------------------------------------------- prévision

_erf = np.vectorize(erf)

def _intervalle(p: np.ndarray, mag: float, sigma: float) -> tuple[float, float]:
    """Intervalle à 80 % de la variation : mélange stable / baisse / hausse."""
    grille = np.linspace(-0.4, 0.4, 8001)
    cdf = p[1] * (grille >= 0)
    for poids, signe in ((p[0], -1), (p[2], 1)):
        cdf = cdf + poids * 0.5 * (1 + _erf((grille - signe * mag) / (max(sigma, 1e-4) * sqrt(2))))
    bas = grille[np.searchsorted(cdf, 0.10)]
    haut = grille[min(np.searchsorted(cdf, 0.90), len(grille) - 1)]
    return float(bas), float(haut)


def _euros(x: float) -> str:
    return f"{x:.3f}".replace(".", ",")


def _pct(x: float) -> str:
    return f"{x * 100:.0f}\u00a0%"


def _cents(x: float) -> str:
    return f"{x * 100:+.1f}".replace(".", ",").replace("-", "−")


def _date_fr(d: dt.date) -> str:
    jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    return f"{jours[d.weekday()]} {d.day} {mois[d.month - 1]}"


def prevoir(df: pd.DataFrame, modeles: dict, produit: str, emission: dt.date, prix_connus: pd.Series) -> list[dict]:
    """Prévisions émises le matin du jour `emission`. `prix_connus` peut contenir un prix déjà publié
    pour une date future : il est alors affiché comme officiel, pas comme prévision."""
    T = pd.Timestamp(emission)
    if T not in df.index:
        raise ValueError(f"Pas de variables pour le {emission} (prix ou cotations manquants)")
    ligne = df.loc[[T]]
    prix = float(ligne["P"].iloc[0])
    D = float(ligne["D"].iloc[0])
    depuis = pd.Timestamp(ligne["dernier_changement"].iloc[0]).date()
    out = []
    for h in HORIZONS:
        cible = emission + dt.timedelta(h)
        jours_fenetre = [emission + dt.timedelta(i) for i in range(h)]
        calculs = [j for j in jours_fenetre if jour_de_calcul(j)]
        base = {"produit": produit, "horizon": h, "date_cible": cible.isoformat(), "prix_reference": round(prix, 4),
                "modele_version": VERSION}
        if not calculs:
            raisons = " ; ".join(f"{_date_fr(j)} : {motif_sans_calcul(j)}" for j in jours_fenetre)
            out.append({**base, "certain": True, "statut": "previsionnel", "p_baisse": 0.0, "p_stable": 1.0, "p_hausse": 0.0,
                        "scenario": 0, "variation_estimee": 0.0, "amplitude": 0.0, "intervalle_bas": 0.0, "intervalle_haut": 0.0,
                        "confiance": 1.0,
                        "explication": f"Aucun calcul du SPF possible avant cette date ({raisons}). Le prix restera "
                                       f"{_euros(prix)} €/L."})
            continue
        # be.STAT peut lister la date de demain avant la publication du SPF (valeur reconduite) :
        # on ne considère comme officielle qu'une ligne future qui annonce un vrai changement.
        publie = prix_connus.get(pd.Timestamp(cible))
        if publie is not None and not np.isnan(publie) and abs(float(publie) - prix) > TOL:
            v = float(publie) - prix
            cl = int(np.sign(v))
            out.append({**base, "certain": True, "statut": "reel", "p_baisse": float(cl == -1), "p_stable": 0.0,
                        "p_hausse": float(cl == 1), "scenario": cl, "variation_estimee": round(v, 4),
                        "amplitude": round(abs(v), 4), "intervalle_bas": round(v, 4), "intervalle_haut": round(v, 4), "confiance": 1.0,
                        "explication": f"Prix officiel déjà publié par le SPF : {_euros(float(publie))} €/L "
                                       f"({_cents(v)} c/L)."})
            continue
        m = modeles[h]
        p = recalibrer(_probas(m.logistique, matrice(ligne, h)), m.iso)[0]
        scenario = int(CLASSES[p.argmax()])
        mag = m.amp_a * abs(D) + m.amp_b
        bas, haut = _intervalle(p, mag, m.amp_sigma)
        sens = "hausse" if D > 0 else "baisse"
        texte = (f"Depuis le dernier changement ({_date_fr(depuis)}), la cotation {NOM_PROXY[PROXY[produit]]} convertie en "
                 f"euros a varié de {_cents(D)} c/L. ")
        if scenario == 0:
            texte += (f"L'écart reste sous le seuil qui déclenche un ajustement : le plus probable est un prix inchangé "
                      f"({_pct(p[1])}). Risque de {sens} : {_pct(p[2] if D > 0 else p[0])}.")
        else:
            texte += (f"Le SPF ajuste le prix quand cet écart dépasse un seuil : une {('hausse' if scenario > 0 else 'baisse')} "
                      f"est le scénario le plus probable ({_pct(p.max())}).")
        if int(ligne[f"admin_{h}"].iloc[0]):
            texte += " Attention : adaptation trimestrielle possible (marges, cotisations), non prévisible par le modèle."
        out.append({**base, "certain": False, "statut": "previsionnel", "p_baisse": round(float(p[0]), 4),
                    "p_stable": round(float(p[1]), 4), "p_hausse": round(float(p[2]), 4), "scenario": scenario,
                    "variation_estimee": round(scenario * mag, 4) if scenario else 0.0,
                    "intervalle_bas": round(bas, 4) + 0.0, "intervalle_haut": round(haut, 4) + 0.0,
                    "amplitude": round(mag, 4), "confiance": round(float(p.max()), 4), "explication": texte})
    return out


# --------------------------------------------------------------------------- évaluation de la calibration

def evaluer_calibration(oof: pd.DataFrame) -> dict:
    """Effet du recalibrage, sans fuite : pour chaque année, calibrateur ajusté sur les années d'avant."""
    lignes = []
    for annee in sorted(oof["annee"].unique()):
        avant, cette = oof[oof["annee"] < annee], oof[oof["annee"] == annee]
        if avant["annee"].nunique() < 2:
            continue
        brut = cette[["p_baisse", "p_stable", "p_hausse"]].values
        cal = recalibrer(brut, calibrateur(avant))
        lignes.append(pd.DataFrame({"brut": brut[:, 0] + brut[:, 2], "cal": cal[:, 0] + cal[:, 2],
                                    "reel": (cette["classe"] != 0).astype(float).values,
                                    "classe": cette["classe"].values, "pb_brut": [b for b in brut], "pb_cal": [c for c in cal]}))
    e = pd.concat(lignes)
    onehot = (e["classe"].values[:, None] == CLASSES[None, :]).astype(float)
    brier = lambda col: float(((np.stack(e[col].values) - onehot) ** 2).sum(1).mean())
    tranches = []
    for bas, haut in ((0.5, 0.7), (0.7, 1.01)):
        for col in ("brut", "cal"):
            m = (e[col] >= bas) & (e[col] < haut)
            if m.any():
                tranches.append({"version": col, "tranche": f"{bas:.0%}-{min(haut, 1):.0%}", "annonce": round(float(e[col][m].mean()), 3),
                                 "observe": round(float(e["reel"][m].mean()), 3), "n": int(m.sum())})
    return {"brier_brut": round(brier("pb_brut"), 4), "brier_recalibre": round(brier("pb_cal"), 4), "tranches_hautes": tranches}
