"""Récupération des données. Chaque fonction renvoie des lignes au format des tables du dépôt,
avec source, heure de récupération, unité et statut."""

from __future__ import annotations

import datetime as dt
import io
import json
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

import openpyxl
import pandas as pd

from .depot import maintenant

UA = {"User-Agent": "FuelPredictor/0.1 (usage personnel)"}
BESTAT = "https://bestat.statbel.fgov.be/bestat/api/views/{vue}/result/CSV"
VUE_30_JOURS = "cee4903e-c302-45be-9e43-e4b724ffb592"
VUE_365_JOURS = "939c67bb-39fa-4f49-9d05-c446187bef1d"

PRODUITS_BESTAT = {"Essence 95 RON E10 (€/L)": "e10", "Essence 98 RON E5 (€/L)": "e98", "Diesel B7 (€/L)": "b7"}
PRODUITS_BRAFCO = {"Benzine 95 RON E10": "e10", "Benzine 98 RON E5": "e98", "Diesel B7": "b7"}
YAHOO = {
    "brent": ("BZ=F", "USD/bbl"),
    "wti": ("CL=F", "USD/bbl"),
    "ho": ("HO=F", "USD/gal"),     # fioul / diesel New York (proxy du diesel)
    "rbob": ("RB=F", "USD/gal"),   # essence RBOB New York (proxy de l'essence)
}


def _lire(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def prix_bestat(vue: str = VUE_30_JOURS) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(_lire(BESTAT.format(vue=vue))))
    df = df[df["Produit"].isin(PRODUITS_BESTAT)]
    if df.empty:
        raise ValueError("be.STAT : aucun produit reconnu dans la réponse")
    return pd.DataFrame({
        "produit": df["Produit"].map(PRODUITS_BESTAT).values,
        "date_application": pd.to_datetime(df["Jour"], format="%d%b%y").values,
        "prix_tvac": df["Prix TVA incl."].astype(float).values,
        "prix_htva": None,
        "unite": "EUR/L",
        "source_id": "bestat",
        "recupere_le": maintenant(),
        "statut": "reel",
    })


SAUT_ABERRANT = 0.40  # €/L en un jour : jamais observé dans les prix officiels (record réel : 0,31 €/L)


def pics_aberrants(changements: pd.Series) -> list[tuple[pd.Timestamp, pd.Timestamp]]:
    """Périodes d'un prix manifestement faux dans une série de changements (index = date) : saut d'au moins
    40 c/L annulé à au moins 80 % dans les 7 jours. Exemple : 98 E5 à 2,167 €/L du 20 au 22 juillet 2020
    dans les fichiers Brafco, entre 1,449 et 1,426 €/L."""
    c = changements.sort_index()
    periodes = []
    for i in range(1, len(c) - 1):
        saut, retour = c.iloc[i] - c.iloc[i - 1], c.iloc[i + 1] - c.iloc[i]
        if (abs(saut) >= SAUT_ABERRANT and saut * retour < 0 and abs(retour) >= 0.8 * abs(saut)
                and c.index[i + 1] - c.index[i] <= pd.Timedelta(days=7)):
            periodes.append((c.index[i], c.index[i + 1] - pd.Timedelta(days=1)))
    return periodes


def prix_brafco(dossier: Path) -> pd.DataFrame:
    """Historique Brafco (fichiers annuels téléchargés à la main). Le fichier ne liste que les
    changements : on propage chaque prix jusqu'au changement suivant. Les pics manifestement faux
    (voir pics_aberrants) sont retirés plutôt que corrigés : aucune valeur n'est inventée."""
    lignes = []
    for f in sorted(Path(dossier).glob("daily-*.xlsx")):
        it = openpyxl.load_workbook(f, read_only=True).worksheets[0].iter_rows(values_only=True)
        entete = next(it)
        idx = {PRODUITS_BRAFCO[c]: i for i, c in enumerate(entete) if c in PRODUITS_BRAFCO}
        for r in it:
            if not r[0]:
                continue
            jour = dt.datetime.strptime(r[0], "%d/%m/%Y")
            lignes += [(jour, code, float(r[i])) for code, i in idx.items() if r[i] is not None]
    chg = pd.DataFrame(lignes, columns=["date", "produit", "prix"]).drop_duplicates(["date", "produit"], keep="last")
    large = chg.pivot(index="date", columns="produit", values="prix")
    aberrants = {p: pics_aberrants(large[p].dropna()) for p in large.columns}
    large = large.reindex(pd.date_range(large.index.min(), large.index.max(), freq="D")).ffill()
    for produit, periodes in aberrants.items():  # prix faux retirés : ces jours restent sans valeur
        for debut, fin in periodes:
            large.loc[debut:fin, produit] = float("nan")
            print(f"  prix Brafco aberrant ignoré : {produit} du {debut.date()} au {fin.date()}")
    long = large.rename_axis("date_application").reset_index().melt("date_application", var_name="produit", value_name="prix_tvac")
    long = long.dropna()
    long["prix_htva"] = None
    long["unite"] = "EUR/L"
    long["source_id"] = "brafco"
    long["recupere_le"] = maintenant()
    long["statut"] = "reel"
    return long


def eurusd(depuis: dt.date) -> pd.DataFrame:
    url = ("https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A"
           f"?format=csvdata&startPeriod={depuis.isoformat()}")
    df = pd.read_csv(io.BytesIO(_lire(url)))
    return pd.DataFrame({
        "paire": "EUR/USD",
        "date_cotation": pd.to_datetime(df["TIME_PERIOD"]).values,
        "valeur": df["OBS_VALUE"].astype(float).values,
        "source_id": "bce",
        "recupere_le": maintenant(),
        "statut": "reel",
    })


def cotations_yahoo(depuis: dt.date) -> pd.DataFrame:
    """Clôtures quotidiennes. La séance du jour (encore ouverte) est exclue."""
    p1 = int(dt.datetime(depuis.year, depuis.month, depuis.day, tzinfo=dt.timezone.utc).timestamp())
    p2 = int(dt.datetime.now(dt.timezone.utc).timestamp())
    morceaux = []
    for serie, (symbole, unite) in YAHOO.items():
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbole}?period1={p1}&period2={p2}&interval=1d"
        r = json.loads(_lire(url))["chart"]["result"][0]
        fuseau = r["meta"]["exchangeTimezoneName"]
        jours = pd.to_datetime(r["timestamp"], unit="s", utc=True).tz_convert(fuseau).normalize().tz_localize(None)
        aujourdhui = pd.Timestamp(dt.datetime.now(ZoneInfo(fuseau)).date())
        df = pd.DataFrame({"date_seance": jours, "valeur": r["indicators"]["quote"][0]["close"]})
        df = df[(df["date_seance"] < aujourdhui) & df["valeur"].notna() & (df["valeur"] > 0)]
        df = df.drop_duplicates("date_seance", keep="last")
        df["serie"], df["unite"] = serie, unite
        morceaux.append(df)
    out = pd.concat(morceaux, ignore_index=True)
    out["source_id"] = "yahoo"
    out["recupere_le"] = maintenant()
    out["statut"] = "reel"
    return out
