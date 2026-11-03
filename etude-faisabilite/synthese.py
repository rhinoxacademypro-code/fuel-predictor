"""Chiffres de synthèse pour le rapport, à partir de resultats/previsions_backtest.csv.gz."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

R = Path(__file__).parent / "resultats"
PLEIN_L = 50
res = pd.read_csv(R / "previsions_backtest.csv.gz", index_col=0, parse_dates=True)
out = {}

for prod, g0 in res.groupby("produit"):
    for h in (1, 2, 3):
        g = g0[(g0["h"] == h) & g0["incertain"]]
        naif = g[g["modele"] == "naif"]
        clim = g[g["modele"] == "climato"]
        for modele in ("logistique", "boosting", "emulateur"):
            m = g[g["modele"] == modele]
            p = m[["p_baisse", "p_stable", "p_hausse"]].values
            pred = np.array([-1, 0, 1])[p.argmax(1)]
            # prix estimé = scénario le plus probable (pas l'espérance)
            mag = np.abs(m["delta_prevu"].values) / np.maximum(np.abs(m["p_hausse"] - m["p_baisse"]).values, 1e-9)
            mode = np.where(pred == 0, 0.0, pred * mag)
            mae_mode = np.abs(m["delta"].values - mode).mean() * 100
            alerte = pred != 0
            gain = np.where(pred == -1, -m["delta"], np.where(pred == 1, m["delta"], 0)) * PLEIN_L
            forte = alerte & (p.max(1) >= 0.7)
            bs = lambda d: (((d[["p_baisse", "p_stable", "p_hausse"]].values - (d["classe"].values[:, None] == np.array([-1, 0, 1])[None, :])) ** 2).sum(1)).mean()
            out[f"{prod}|J+{h}|{modele}"] = {
                "brier": round(bs(m), 4), "brier_naif": round(bs(naif), 4), "brier_climato": round(bs(clim), 4),
                "gain_brier_vs_climato_pct": round(100 * (1 - bs(m) / bs(clim)), 1),
                "mae_mode_cents": round(mae_mode, 3), "mae_naif_cents": round(np.abs(naif["delta"]).mean() * 100, 3),
                "alertes": int(alerte.sum()), "alertes_justes_pct": round(100 * (gain[alerte] > 0).mean(), 1) if alerte.any() else None,
                "alertes_neutres_pct": round(100 * (gain[alerte] == 0).mean(), 1) if alerte.any() else None,
                "alertes_fausses_pct": round(100 * (gain[alerte] < 0).mean(), 1) if alerte.any() else None,
                "gain_par_alerte_plein_50L_eur": round(gain[alerte].mean(), 2) if alerte.any() else None,
                "alertes_fortes": int(forte.sum()),
                "alertes_fortes_justes_pct": round(100 * (gain[forte] > 0).mean(), 1) if forte.any() else None,
                "gain_par_alerte_forte_eur": round(gain[forte].mean(), 2) if forte.any() else None,
                "rappel_changements_pct": round(100 * ((pred == m["classe"].values) & (m["classe"].values != 0)).sum() / max((m["classe"] != 0).sum(), 1), 1),
            }

# calibration du modèle retenu
cal = {}
for (prod, h), g in res[(res["modele"] == "logistique") & res["incertain"]].groupby(["produit", "h"]):
    pc = g["p_baisse"] + g["p_hausse"]
    reel = (g["classe"] != 0).astype(float)
    bins = pd.cut(pc, [0, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0], include_lowest=True)
    t = pd.DataFrame({"annonce": pc, "reel": reel, "b": bins}).groupby("b", observed=True).agg(annonce=("annonce", "mean"), observe=("reel", "mean"), n=("reel", "size"))
    cal[f"{prod}|J+{h}"] = [{"tranche": str(i), "proba_annoncee_pct": round(100 * r.annonce, 1), "frequence_observee_pct": round(100 * r.observe, 1), "n": int(r.n)} for i, r in t.iterrows()]
out["calibration_logistique"] = cal

# par année, J+1 et J+3, logistique vs climato (Brier)
an = {}
for (prod, h, annee), g in res[res["incertain"] & res["h"].isin([1, 3])].groupby(["produit", "h", "annee"]):
    def bs(d):
        return (((d[["p_baisse", "p_stable", "p_hausse"]].values - (d["classe"].values[:, None] == np.array([-1, 0, 1])[None, :])) ** 2).sum(1)).mean()
    l, c = g[g["modele"] == "logistique"], g[g["modele"] == "climato"]
    an[f"{prod}|J+{h}|{annee}"] = {"gain_brier_vs_climato_pct": round(100 * (1 - bs(l) / bs(c)), 1), "changements": int((c["classe"] != 0).sum())}
out["par_annee"] = an

# calendrier : part des jours où le prix est certain (aucun calcul SPF dans la fenêtre)
g = res[(res["modele"] == "naif") & (res["produit"] == "b7")]
out["jours_certains_pct"] = {f"J+{h}": round(100 * (~g[g["h"] == h]["incertain"]).mean(), 1) for h in (1, 2, 3)}
out["jours_certains_erreurs"] = int(((~g["incertain"]) & (g["classe"] != 0)).sum())

(R / "synthese.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
for k, v in out.items():
    if "|" in k and "logistique" in k:
        print(k, v)
print(json.dumps(out["calibration_logistique"]["b7|J+1"], ensure_ascii=False))
print(json.dumps(out["calibration_logistique"]["e10|J+3"], ensure_ascii=False))
print({k: v for k, v in out["par_annee"].items() if k.startswith("b7|J+1") or k.startswith("e10|J+1")})
print(out["jours_certains_pct"], out["jours_certains_erreurs"])

# Simulation : un plein de 50 L par semaine, avec une marge de 2 jours (jour prévu D, D+1 ou D+2).
# Règle simple appliquée le matin de D : baisse annoncée à J+2 -> attendre D+2 ; sinon baisse à J+1 -> D+1 ; sinon plein à D.
pm = pd.read_csv(Path(__file__).parent / "donnees" / "prix_max.csv", index_col=0, parse_dates=True)
simu = {}
for prod in ("b7", "e10", "e98"):
    P = pm[prod]
    lg = res[(res["modele"] == "logistique") & (res["produit"] == prod)]
    pr = {h: lg[lg["h"] == h] for h in (1, 2)}
    jours = pr[1].index.intersection(pr[2].index)
    cl = lambda h: np.array([-1, 0, 1])[pr[h].loc[jours, ["p_baisse", "p_stable", "p_hausse"]].values.argmax(1)]
    c1, c2 = cl(1), cl(2)
    p0 = P.reindex(jours).values
    p1 = P.reindex(jours + pd.Timedelta(days=1)).values
    p2 = P.reindex(jours + pd.Timedelta(days=2)).values
    choix = np.where(c2 == -1, p2, np.where(c1 == -1, p1, p0))
    eco = (p0 - choix) * PLEIN_L
    oracle = (p0 - np.minimum(np.minimum(p0, p1), p2)) * PLEIN_L
    simu[prod] = {
        "economie_moyenne_par_plein_eur": round(float(np.nanmean(eco)), 3),
        "economie_annuelle_52_pleins_eur": round(float(np.nanmean(eco)) * 52, 1),
        "maximum_possible_par_plein_eur": round(float(np.nanmean(oracle)), 3),
        "maximum_possible_annuel_eur": round(float(np.nanmean(oracle)) * 52, 1),
        "pleins_perdants_pct": round(100 * float((eco < -1e-9).mean()), 1),
    }
out["simulation_plein_hebdo"] = simu
(R / "synthese.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
print(simu)
