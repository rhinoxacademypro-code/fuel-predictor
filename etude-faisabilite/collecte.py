"""Collecte des données de l'étude de faisabilité (étape 1.0).

Sorties dans donnees/ :
- prix_max.csv   : prix maximums officiels TVAC par jour d'application (Brafco 2015-2026)
- bestat_365.csv : 365 dernières mises à jour be.STAT (contrôle croisé)
- eurusd.csv     : taux de référence BCE
- cotations.csv  : contrats à terme Yahoo (Brent, fioul/diesel NY, essence RBOB), clôtures quotidiennes

Les fichiers Brafco (daily-AAAA.xlsx) sont téléchargés à la main via le formulaire
https://www.brafco.be/fr/prix-produits/banque-de-donnees et placés dans donnees/brut/brafco/.
"""

import datetime as dt
import io
import json
import urllib.request
from pathlib import Path

import openpyxl
import pandas as pd

ICI = Path(__file__).parent
DONNEES = ICI / "donnees"
UA = {"User-Agent": "Mozilla/5.0 (FuelPredictor etude)"}

# Colonnes Brafco (en néerlandais) -> code interne
PRODUITS = {
    "Benzine 95 RON E10": "e10",
    "Benzine 98 RON E5": "e98",
    "Diesel B7": "b7",
}
BESTAT_PRODUITS = {
    "Essence 95 RON E10 (€/L)": "e10",
    "Essence 98 RON E5 (€/L)": "e98",
    "Diesel B7 (€/L)": "b7",
}
YAHOO = {"BZ=F": "brent_usd_bbl", "HO=F": "ho_usd_gal", "RB=F": "rbob_usd_gal"}
DEBUT = dt.date(2014, 6, 1)


def lire(url, data=None):
    req = urllib.request.Request(url, headers=UA, data=data)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def prix_brafco():
    """Le fichier Brafco liste les changements : une valeur vide = prix inchangé."""
    lignes = []
    for f in sorted((DONNEES / "brut" / "brafco").glob("daily-*.xlsx")):
        ws = openpyxl.load_workbook(f, read_only=True).worksheets[0]
        it = ws.iter_rows(values_only=True)
        entete = next(it)
        idx = {PRODUITS[c]: i for i, c in enumerate(entete) if c in PRODUITS}
        for r in it:
            if not r[0]:
                continue
            jour = dt.datetime.strptime(r[0], "%d/%m/%Y").date()
            for code, i in idx.items():
                if r[i] is not None:
                    lignes.append((jour, code, float(r[i])))
    chg = pd.DataFrame(lignes, columns=["date", "produit", "prix"])
    chg = chg.drop_duplicates(["date", "produit"], keep="last")
    # Série quotidienne : on propage le dernier prix connu jusqu'au prochain changement
    jours = pd.date_range(chg["date"].min(), chg["date"].max(), freq="D")
    large = chg.pivot(index="date", columns="produit", values="prix")
    large.index = pd.to_datetime(large.index)
    large = large.reindex(jours).ffill()
    large.index.name = "date"
    large.to_csv(DONNEES / "prix_max.csv", float_format="%.4f")
    return large


def bestat():
    url = "https://bestat.economie.fgov.be/bestat/api/views/939c67bb-39fa-4f49-9d05-c446187bef1d/result/CSV"
    df = pd.read_csv(io.BytesIO(lire(url)))
    df = df[df["Produit"].isin(BESTAT_PRODUITS)]
    df["date"] = pd.to_datetime(df["Jour"], format="%d%b%y")
    df["produit"] = df["Produit"].map(BESTAT_PRODUITS)
    large = df.pivot(index="date", columns="produit", values="Prix TVA incl.").sort_index()
    large.to_csv(DONNEES / "bestat_365.csv")
    return large


def eurusd():
    url = ("https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A"
           f"?format=csvdata&startPeriod={DEBUT.isoformat()}")
    df = pd.read_csv(io.BytesIO(lire(url)))
    s = df.set_index(pd.to_datetime(df["TIME_PERIOD"]))["OBS_VALUE"].rename("eurusd")
    s.index.name = "date"
    s.to_csv(DONNEES / "eurusd.csv")
    return s


def yahoo():
    p1 = int(dt.datetime(DEBUT.year, DEBUT.month, DEBUT.day).timestamp())
    p2 = int(dt.datetime.now().timestamp())
    series = {}
    for sym, nom in YAHOO.items():
        url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
               f"?period1={p1}&period2={p2}&interval=1d")
        r = json.loads(lire(url))["chart"]["result"][0]
        tz = r["meta"]["exchangeTimezoneName"]
        # Date de séance dans le fuseau de la bourse (New York) : évite de décaler d'un jour
        jours = pd.to_datetime(r["timestamp"], unit="s", utc=True).tz_convert(tz).normalize().tz_localize(None)
        series[nom] = pd.Series(r["indicators"]["quote"][0]["close"], index=jours)
    df = pd.DataFrame(series).sort_index()
    df = df[~df.index.duplicated(keep="last")]
    df.index.name = "date"
    df.to_csv(DONNEES / "cotations.csv", float_format="%.4f")
    return df


if __name__ == "__main__":
    pm = prix_brafco()
    print("prix_max   :", pm.index.min().date(), "->", pm.index.max().date(), pm.shape)
    bs = bestat()
    print("bestat_365 :", bs.index.min().date(), "->", bs.index.max().date(), bs.shape)
    ex = eurusd()
    print("eurusd     :", ex.index.min().date(), "->", ex.index.max().date(), len(ex))
    co = yahoo()
    print("cotations  :", co.index.min().date(), "->", co.index.max().date(), co.shape)
    print(co.isna().sum().to_dict())
