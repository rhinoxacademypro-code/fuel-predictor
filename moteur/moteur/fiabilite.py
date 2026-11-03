"""Fiabilité du moteur, telle qu'affichée dans l'application (étape 1.5).

Trois volets :
1. historique : prévisions hors échantillon 2017-2026 (walk-forward), recalibrées avec un calibrateur
   ajusté uniquement sur les années précédentes, comparées aux références naïve et climatologique ;
2. indicateur : ce qu'aurait donné la règle « faire le plein / attendre » (mêmes seuils que
   web/src/lib/decision.ts) si on l'avait suivie ;
3. direct : prévisions réellement archivées par le moteur, comparées aux prix publiés ensuite.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import modele

SEUIL_PROBA, SEUIL_EUROS, QUANTITE = 0.6, 1.0, 50   # identiques à REGLAGES_DEFAUT (decision.ts)
MIN_DIRECT = 30                                     # en dessous, pas de verdict sur les prévisions archivées


def _brier(p: np.ndarray, classe: np.ndarray) -> float:
    onehot = (classe[:, None] == modele.CLASSES[None, :]).astype(float)
    return float(((p - onehot) ** 2).sum(1).mean())


def _recalibre_croise(oof: pd.DataFrame) -> pd.DataFrame:
    """Probabilités recalibrées année par année avec les seules années antérieures (pas de fuite)."""
    lignes = []
    for annee in sorted(oof["annee"].unique()):
        avant, cette = oof[oof["annee"] < annee], oof[oof["annee"] == annee].copy()
        if avant["annee"].nunique() < 2:
            continue
        cette[["c_baisse", "c_stable", "c_hausse"]] = np.nan
        p = modele.recalibrer(cette[["p_baisse", "p_stable", "p_hausse"]].values, modele.calibrateur(avant))
        cette[["p_baisse", "p_stable", "p_hausse"]] = p
        # référence climatologique, elle aussi apprise sur les seules années antérieures
        for n, g in avant.groupby("n_calc"):
            m = cette["n_calc"] == n
            cette.loc[m, ["c_baisse", "c_stable", "c_hausse"]] = [(g["classe"] == k).mean() for k in modele.CLASSES]
        lignes.append(cette)
    return pd.concat(lignes)


def historique(df: pd.DataFrame, h: int) -> tuple[dict, pd.DataFrame]:
    r = _recalibre_croise(modele.predictions_hors_echantillon(df, h))
    p = r[["p_baisse", "p_stable", "p_hausse"]].values
    y = r["classe"].values
    naif = np.tile([0.0, 1.0, 0.0], (len(r), 1))
    b_mod, b_naif, b_clim = _brier(p, y), _brier(naif, y), _brier(r[["c_baisse", "c_stable", "c_hausse"]].values, y)
    pred = modele.CLASSES[p.argmax(1)]
    alertes = pred != 0
    bonnes = (pred == y) & (y != 0)
    # jours « certains » : aucun calcul du SPF dans la fenêtre ; le prix a-t-il vraiment tenu ?
    periode = df[df.index >= r.index.min()]
    certains = periode[(periode[f"n_calc_{h}"] == 0) & periode[f"classe_{h}"].notna()]
    pc = p[:, 0] + p[:, 2]
    tranches = []
    for bas, haut in ((0, 0.1), (0.1, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 1.01)):
        m = (pc >= bas) & (pc < haut)
        if m.sum() >= 20:
            tranches.append({"annonce": round(float(pc[m].mean()), 3), "observe": round(float((y[m] != 0).mean()), 3), "n": int(m.sum())})
    par_annee = []
    for an, g in r.groupby("annee"):
        pg, yg = g[["p_baisse", "p_stable", "p_hausse"]].values, g["classe"].values
        bc = _brier(g[["c_baisse", "c_stable", "c_hausse"]].values, yg)
        par_annee.append({"annee": int(an), "gain_pct": round(100 * (1 - _brier(pg, yg) / bc), 1), "changements": int((yg != 0).sum())})
    return {
        "periode": [str(r.index.min().date()), str(r.index.max().date())],
        "jours_incertains": int(len(r)),
        "changements_reels": int((y != 0).sum()),
        "brier_modele": round(b_mod, 4), "brier_naif": round(b_naif, 4), "brier_climatologie": round(b_clim, 4),
        "gain_vs_climatologie_pct": round(100 * (1 - b_mod / b_clim), 1),
        "gain_vs_naif_pct": round(100 * (1 - b_mod / b_naif), 1),
        "meilleur_que_references": bool(b_mod < min(b_naif, b_clim)),
        "changements_reperes_pct": round(100 * bonnes.sum() / max((y != 0).sum(), 1), 1),
        "alertes": int(alertes.sum()),
        "alertes_justes_pct": round(100 * float(bonnes[alertes].mean()), 1) if alertes.any() else None,
        "alertes_sens_oppose_pct": round(100 * float(((pred != y) & (y != 0))[alertes].mean()), 1) if alertes.any() else None,
        "jours_certains": int(len(certains)),
        "jours_certains_dementis": int((certains[f"classe_{h}"] != 0).sum()),
        "calibration": tranches,
        "par_annee": par_annee,
    }, r


def indicateur(r1: pd.DataFrame, r2: pd.DataFrame) -> dict:
    """Rejoue la règle de décision sur l'historique (jours où J+1 et J+2 sont tous deux incertains)."""
    j = r1.index.intersection(r2.index)
    j = j[r1.loc[j, "delta"].notna().values & r2.loc[j, "delta"].notna().values]  # résultat encore inconnu : exclu
    gains, couleurs = [], []
    for t in j:
        a, b = r1.loc[t], r2.loc[t]
        hausse = a if a["p_hausse"] >= b["p_hausse"] else b
        baisse = a if a["p_baisse"] >= b["p_baisse"] else b
        perte = hausse["p_hausse"] * hausse["amplitude"] * QUANTITE
        gain = baisse["p_baisse"] * baisse["amplitude"] * QUANTITE
        if hausse["p_hausse"] >= SEUIL_PROBA and perte >= SEUIL_EUROS and hausse["p_hausse"] > baisse["p_baisse"]:
            couleurs.append("vert")
            gains.append(hausse["delta"] * QUANTITE)          # hausse évitée en faisant le plein tout de suite
        elif baisse["p_baisse"] >= SEUIL_PROBA and gain >= SEUIL_EUROS:
            couleurs.append("orange")
            gains.append(-baisse["delta"] * QUANTITE)         # baisse obtenue en attendant
        else:
            couleurs.append("gris")
            gains.append(0.0)
    g, c = np.array(gains), np.array(couleurs)
    actifs = c != "gris"
    return {
        "jours": int(len(j)),
        "verts": int((c == "vert").sum()), "oranges": int((c == "orange").sum()), "gris": int((c == "gris").sum()),
        "gain_moyen_par_recommandation_eur": round(float(g[actifs].mean()), 2) if actifs.any() else None,
        "recommandations_gagnantes_pct": round(100 * float((g[actifs] > 0).mean()), 1) if actifs.any() else None,
        "recommandations_perdantes_pct": round(100 * float((g[actifs] < 0).mean()), 1) if actifs.any() else None,
        "gain_total_eur": round(float(g.sum()), 2),
        "quantite_l": QUANTITE,
    }


def direct(previsions: pd.DataFrame, prix: pd.DataFrame) -> dict:
    """Prévisions archivées (non certaines) dont la date cible est passée."""
    if previsions.empty:
        return {"evaluees": 0, "suffisant": False}
    p = previsions[~previsions["certain"].astype(bool)].copy()
    p["date_cible"] = pd.to_datetime(p["date_cible"])
    reel = prix.rename(columns={"date_application": "date_cible", "prix_tvac": "prix_observe"})[["produit", "date_cible", "prix_observe"]]
    reel["date_cible"] = pd.to_datetime(reel["date_cible"])
    e = p.merge(reel, on=["produit", "date_cible"], how="inner")
    if e.empty:
        return {"evaluees": 0, "suffisant": False}
    v = e["prix_observe"] - e["prix_reference"]
    sens = np.sign(v.where(v.abs() > modele.TOL, 0)).astype(int)
    return {
        "evaluees": int(len(e)),
        "suffisant": bool(len(e) >= MIN_DIRECT),
        "scenario_juste_pct": round(100 * float((e["scenario"].astype(int) == sens).mean()), 1),
        "brier": round(_brier(e[["p_baisse", "p_stable", "p_hausse"]].values.astype(float), sens.values), 4),
        "brier_naif": round(_brier(np.tile([0.0, 1.0, 0.0], (len(e), 1)), sens.values), 4),
    }
