"""Étude de faisabilité du moteur de prévision (étape 1.0).

Question : peut-on prévoir le prix maximum belge à J+1, J+2, J+3 mieux que
la référence naïve « le prix ne bouge pas » ?

Règles anti-fuite :
- une prévision émise le jour T à 6 h 30 n'utilise que les prix officiels jusqu'à T
  et les cotations des séances strictement antérieures à T ;
- backtesting « walk-forward » : chaque année de test est prédite par des modèles
  entraînés uniquement sur les années précédentes (cibles comprises).

Modèles comparés :
- naif        : prix inchangé (référence imposée par le cahier des charges)
- climato     : fréquences historiques de hausse/baisse selon le calendrier
- emulateur   : imitation du mécanisme belge (écart des cotations depuis le dernier
                changement comparé à un seuil, calibré sur l'historique)
- logistique  : régression logistique multinomiale (variables de marché + calendrier)
- boosting    : gradient boosting sur les mêmes variables
"""

import datetime as dt
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

ICI = Path(__file__).parent
DONNEES = ICI / "donnees"
RESULTATS = ICI / "resultats"

GALLON_L = 3.78541
BARIL_L = 158.987
TVA = 1.21
TOL = 0.0005  # en dessous, on considère le prix stable (€/L)
CLASSES = np.array([-1, 0, 1])  # baisse, stable, hausse
HORIZONS = (1, 2, 3)
ANNEES_TEST = range(2017, 2027)
PLEIN_L = 50

# Proxy de cotation par produit : diesel <- fioul/diesel New York, essences <- RBOB
PROXY = {"b7": "ho_usd_gal", "e10": "rbob_usd_gal", "e98": "rbob_usd_gal"}
NOMS = {"e10": "Essence 95 E10", "e98": "Essence 98 E5", "b7": "Diesel B7"}


# --------------------------------------------------------------------------- calendrier

def paques(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mois = (h + l - 7 * m + 114) // 31
    jour = (h + l - 7 * m + 114) % 31 + 1
    return dt.date(y, mois, jour)


def feries_legaux(annees):
    """Les 10 jours fériés légaux belges."""
    f = set()
    for y in annees:
        p = paques(y)
        f |= {dt.date(y, 1, 1), p + dt.timedelta(1), dt.date(y, 5, 1), p + dt.timedelta(39),
              p + dt.timedelta(50), dt.date(y, 7, 21), dt.date(y, 8, 15), dt.date(y, 11, 1),
              dt.date(y, 11, 11), dt.date(y, 12, 25)}
    return f


# --------------------------------------------------------------------------- données

def charger(proxy_force=None):
    pm = pd.read_csv(DONNEES / "prix_max.csv", index_col=0, parse_dates=True)
    co = pd.read_csv(DONNEES / "cotations.csv", index_col=0, parse_dates=True)
    fx = pd.read_csv(DONNEES / "eurusd.csv", index_col=0, parse_dates=True)["eurusd"]
    co = co.join(fx, how="left")
    co["eurusd"] = co["eurusd"].ffill()
    co = co.dropna()
    co = co[(co[["brent_usd_bbl", "ho_usd_gal", "rbob_usd_gal"]] > 0).all(axis=1)]
    eur_l = pd.DataFrame({
        "ho_usd_gal": co["ho_usd_gal"] / GALLON_L / co["eurusd"],
        "rbob_usd_gal": co["rbob_usd_gal"] / GALLON_L / co["eurusd"],
        "brent_usd_bbl": co["brent_usd_bbl"] / BARIL_L / co["eurusd"],
    })
    feries = feries_legaux(range(2014, 2028))
    jours = pd.date_range(pm.index.min(), pm.index.max(), freq="D")
    calcul = pd.Series([d.weekday() < 5 and d.date() not in feries for d in jours], index=jours)
    return pm, eur_l, calcul


def construire(produit, pm, eur_l, calcul, proxy_force=None):
    """Une ligne par jour d'émission T et par horizon h, avec les variables connues à T."""
    P = pm[produit].dropna()
    jours = P.index
    x_bourse = eur_l[proxy_force or PROXY[produit]]

    def vue_calendrier(s):
        # valeur de la dernière séance STRICTEMENT antérieure à chaque jour calendaire
        return s.reindex(s.index.union(jours)).ffill().shift(1).reindex(jours)

    xq = vue_calendrier(x_bourse)
    ma7 = vue_calendrier(x_bourse.rolling(7).mean())
    vol20 = vue_calendrier(x_bourse.diff().rolling(20).std())
    ret1 = vue_calendrier(x_bourse.diff())

    chg = P.diff().abs() > 1e-6
    # référence = cotation connue lors du calcul ayant produit le dernier changement
    ref = pd.Series(np.nan, index=jours)
    ref[chg] = xq.shift(1)[chg]
    ref = ref.ffill()

    cal = calcul.reindex(jours).fillna(False).astype(int)
    # nombre de jours de calcul depuis le dernier changement (jusqu'à T inclus)
    groupe = chg.cumsum()
    k = cal.groupby(groupe).cumsum()

    # Brent en variable secondaire : sa dérive depuis le même changement de référence
    xb = vue_calendrier(eur_l["brent_usd_bbl"])
    ref_b = pd.Series(np.nan, index=jours)
    ref_b[chg] = xb.shift(1)[chg]
    ref_b = ref_b.ffill()

    base = pd.DataFrame({
        "P": P, "x": xq, "D": xq - ref, "MA": ma7 - ref, "k": k.clip(upper=15),
        "vol": vol20, "ret1": ret1, "cal": cal,
        "D_rel": (xq - ref) / ref, "D_brent": xb - ref_b,
    })
    lignes = []
    for h in HORIZONS:
        b = base.copy()
        b["h"] = h
        b["n_calc"] = sum(cal.shift(-i) for i in range(h)).clip(upper=3)
        b["delta"] = P.shift(-h) - P
        debut_trim = pd.Series([d.day == 1 and d.month in (1, 4, 7, 10) for d in jours], index=jours)
        b["admin"] = sum(debut_trim.shift(-i) for i in range(1, h + 1)).fillna(0).clip(upper=1)
        lignes.append(b)
    df = pd.concat(lignes)
    df = df.dropna(subset=["delta", "D", "MA", "vol", "ret1", "n_calc"])
    df = df[df.index >= "2015-03-01"]
    df["classe"] = np.sign(df["delta"].where(df["delta"].abs() > TOL, 0)).astype(int)
    df["annee"] = df.index.year
    return df


# --------------------------------------------------------------------------- modèles

def proba_constante(n, cl=0):
    p = np.zeros((n, 3))
    p[:, list(CLASSES).index(cl)] = 1.0
    return p


def frequences(y, lissage=1.0):
    c = np.array([(y == k).sum() for k in CLASSES], float) + lissage
    return c / c.sum()


def seuil(k, theta, gamma):
    return theta * (1 + gamma * np.clip(7 - k, 0, None) / 7)


def signal_emulateur(df, theta, gamma):
    s = seuil(df["k"].values, theta, gamma)
    ok = (np.abs(df["D"].values) >= s) & (np.abs(df["MA"].values) >= s) & (np.sign(df["D"]) == np.sign(df["MA"])).values
    return np.where(ok, np.sign(df["D"].values), 0).astype(int)


def caler_emulateur(train):
    """Grille sur le seuil : maximise le F1 des changements de sens correct à J+1."""
    t = train[(train["h"] == 1) & (train["n_calc"] > 0)]
    y = t["classe"].values
    meilleur = (-1, 0.02, 0.0)
    for theta in np.arange(0.004, 0.045, 0.002):
        for gamma in (0.0, 0.5, 1.0, 2.0):
            s = signal_emulateur(t, theta, gamma)
            tp = ((s == y) & (y != 0)).sum()
            pred, reel = (s != 0).sum(), (y != 0).sum()
            if pred == 0 or reel == 0:
                continue
            f1 = 2 * tp / (pred + reel)
            if f1 > meilleur[0]:
                meilleur = (f1, theta, gamma)
    return meilleur[1], meilleur[2]


def variables(df, theta, gamma):
    s = seuil(df["k"].values, theta, gamma)
    return np.column_stack([
        df["D"], df["MA"], np.abs(df["D"]), df["D"] / s, df["MA"] / s, df["k"], df["n_calc"],
        df["vol"], df["ret1"], df["D"] * df["n_calc"], signal_emulateur(df, theta, gamma), df["admin"],
        df["D_rel"], df["D_brent"], df["D_brent"] * df["n_calc"],
    ])


def amplitude(train):
    """|Δ| moyen d'un changement en fonction de |D| (régression linéaire simple)."""
    t = train[(train["classe"] != 0)]
    if len(t) < 10:
        return 0.03, 0.0
    a, b = np.polyfit(np.abs(t["D"].values), np.abs(t["delta"].values), 1)
    return max(a, 0.0), b


def prevoir(train, test):
    """Renvoie {modèle: (probas[n,3], delta_prevu[n])} pour les lignes de test."""
    out = {}
    theta, gamma = caler_emulateur(train)
    a_amp, b_amp = amplitude(train)
    n = len(test)
    incertain_te = test["n_calc"].values > 0

    out["naif"] = (proba_constante(n), np.zeros(n))

    # climatologie : fréquences par (horizon, nb de jours de calcul dans la fenêtre)
    p = proba_constante(n)
    for h in HORIZONS:
        for nc in (1, 2, 3):
            m_te = (test["h"].values == h) & (test["n_calc"].values == nc)
            t = train[(train["h"] == h) & (train["n_calc"] == nc)]
            if m_te.any() and len(t):
                p[m_te] = frequences(t["classe"].values)
    out["climato"] = (p, np.zeros(n))

    # émulateur probabilisé : fréquences observées par signal à l'entraînement
    s_tr = signal_emulateur(train, theta, gamma)
    s_te = signal_emulateur(test, theta, gamma)
    p = proba_constante(n)
    for h in HORIZONS:
        for sig in (-1, 0, 1):
            m_te = (test["h"].values == h) & (s_te == sig) & incertain_te
            m_tr = (train["h"].values == h) & (s_tr == sig) & (train["n_calc"].values > 0)
            if m_te.any():
                p[m_te] = frequences(train["classe"].values[m_tr])
    mag = a_amp * np.abs(test["D"].values) + b_amp
    out["emulateur"] = (p, (p[:, 2] - p[:, 0]) * mag)

    # modèles statistiques, un par horizon, entraînés sur les jours incertains
    for nom, fabrique in (
        ("logistique", lambda: make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000))),
        ("boosting", lambda: HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=200,
                                                            l2_regularization=1.0, random_state=0)),
    ):
        p = proba_constante(n)
        for h in HORIZONS:
            m_tr = (train["h"].values == h) & (train["n_calc"].values > 0)
            m_te = (test["h"].values == h) & incertain_te
            if not m_te.any():
                continue
            X_tr = variables(train[m_tr], theta, gamma)
            y_tr = train["classe"].values[m_tr]
            mod = fabrique().fit(X_tr, y_tr)
            pr = mod.predict_proba(variables(test[m_te], theta, gamma))
            full = np.zeros((m_te.sum(), 3))
            for j, c in enumerate(mod.classes_):
                full[:, list(CLASSES).index(c)] = pr[:, j]
            p[m_te] = full
        out[nom] = (p, (p[:, 2] - p[:, 0]) * mag)
    return out, {"theta": round(float(theta), 4), "gamma": gamma, "amp_a": round(float(a_amp), 3), "amp_b": round(float(b_amp), 4)}


# --------------------------------------------------------------------------- évaluation

def metriques(y, p, delta_prevu, delta):
    pred = CLASSES[p.argmax(1)]
    onehot = (y[:, None] == CLASSES[None, :]).astype(float)
    reels = y != 0
    annonces = pred != 0
    bons = (pred == y) & reels
    gain = np.where(pred == -1, -delta, np.where(pred == 1, delta, 0.0)) * PLEIN_L
    return {
        "n": int(len(y)),
        "changements_reels": int(reels.sum()),
        "exactitude": float((pred == y).mean()),
        "rappel_changements": float(bons.sum() / max(reels.sum(), 1)),
        "precision_alertes": float(bons.sum() / max(annonces.sum(), 1)) if annonces.any() else float("nan"),
        "alertes": int(annonces.sum()),
        "brier": float(((p - onehot) ** 2).sum(1).mean()),
        "mae_cents": float(np.abs(delta - delta_prevu).mean() * 100),
        "gain_moyen_plein_eur": float(gain.mean()),
        "gain_max_plein_eur": float(np.abs(delta).mean() * PLEIN_L),
    }


def calibration(y, p, nb=5):
    pc = p[:, 0] + p[:, 2]
    reel = (y != 0).astype(float)
    bornes = np.quantile(pc, np.linspace(0, 1, nb + 1))
    lignes = []
    for i in range(nb):
        m = (pc >= bornes[i]) & (pc <= bornes[i + 1]) if i == nb - 1 else (pc >= bornes[i]) & (pc < bornes[i + 1])
        if m.sum():
            lignes.append({"proba_annoncee": float(pc[m].mean()), "frequence_observee": float(reel[m].mean()), "n": int(m.sum())})
    return lignes


def backtest(produit, pm, eur_l, calcul, proxy_force=None):
    df = construire(produit, pm, eur_l, calcul, proxy_force)
    morceaux, params = [], {}
    for an in ANNEES_TEST:
        debut = pd.Timestamp(f"{an}-01-01")
        test = df[df["annee"] == an]
        # cible connue avant le début du test : T + h < début
        train = df[(df.index + pd.to_timedelta(df["h"], unit="D")) < debut]
        if test.empty:
            continue
        prev, params[an] = prevoir(train, test)
        for nom, (p, dp) in prev.items():
            morceaux.append(pd.DataFrame({
                "modele": nom, "h": test["h"].values, "annee": an, "classe": test["classe"].values,
                "delta": test["delta"].values, "delta_prevu": dp, "incertain": test["n_calc"].values > 0,
                "p_baisse": p[:, 0], "p_stable": p[:, 1], "p_hausse": p[:, 2],
            }, index=test.index))
    return pd.concat(morceaux), params


def resumer(res, filtre=None):
    lignes = []
    r = res if filtre is None else res[filtre(res)]
    for (modele, h), g in r.groupby(["modele", "h"]):
        p = g[["p_baisse", "p_stable", "p_hausse"]].values
        m = metriques(g["classe"].values, p, g["delta_prevu"].values, g["delta"].values)
        lignes.append({"modele": modele, "h": h, **m})
    return pd.DataFrame(lignes)


def main():
    RESULTATS.mkdir(exist_ok=True)
    pm, eur_l, calcul = charger()
    tout, params_tout, resume = [], {}, {}
    for produit in ("e10", "e98", "b7"):
        res, params = backtest(produit, pm, eur_l, calcul)
        res["produit"] = produit
        tout.append(res)
        params_tout[produit] = params
        # Variante : Brent seul comme cotation (pour vérifier « le Brent ne suffit pas »)
        res_b, _ = backtest(produit, pm, eur_l, calcul, proxy_force="brent_usd_bbl")
        res_b = res_b[res_b["modele"].isin(["emulateur", "logistique"])].copy()
        res_b["modele"] = res_b["modele"] + "_brent"
        res_b["produit"] = produit
        tout.append(res_b)
    res = pd.concat(tout)
    res.to_csv(RESULTATS / "previsions_backtest.csv.gz", compression="gzip")

    lignes = []
    for produit, g in res.groupby("produit"):
        for portee, filtre in (("tous_les_jours", None), ("jours_incertains", lambda r: r["incertain"])):
            t = resumer(g, filtre)
            t.insert(0, "portee", portee)
            t.insert(0, "produit", produit)
            lignes.append(t)
    met = pd.concat(lignes)
    met.to_csv(RESULTATS / "metriques.csv", index=False, float_format="%.4f")

    # par année (jours incertains, J+1) pour voir les conditions de marché
    an = []
    for (produit, annee), g in res[res["incertain"] & (res["h"] == 1)].groupby(["produit", "annee"]):
        t = resumer(g)
        t.insert(0, "annee", annee)
        t.insert(0, "produit", produit)
        an.append(t)
    pd.concat(an).to_csv(RESULTATS / "par_annee_j1.csv", index=False, float_format="%.4f")

    cal = {}
    for (produit, modele, h), g in res[res["incertain"]].groupby(["produit", "modele", "h"]):
        cal[f"{produit}|{modele}|J+{h}"] = calibration(g["classe"].values, g[["p_baisse", "p_stable", "p_hausse"]].values)
    resume["calibration"] = cal
    resume["parametres_emulateur"] = params_tout
    resume["periode_test"] = [str(res.index.min().date()), str(res.index.max().date())]
    (RESULTATS / "resume.json").write_text(json.dumps(resume, indent=1, ensure_ascii=False))

    pd.set_option("display.width", 220)
    pd.set_option("display.max_columns", 20)
    cols = ["produit", "modele", "h", "n", "changements_reels", "exactitude", "rappel_changements",
            "precision_alertes", "alertes", "brier", "mae_cents", "gain_moyen_plein_eur", "gain_max_plein_eur"]
    print(met[met["portee"] == "jours_incertains"][cols].round(3).to_string(index=False))


if __name__ == "__main__":
    main()
