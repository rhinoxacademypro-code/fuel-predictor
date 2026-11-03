"""Stockage des données : une table = un fichier CSV dans moteur/depot/.

Ce dossier fait partie du dépôt GitHub : la tâche quotidienne y écrit, puis enregistre les
changements (commit). L'historique git garde ainsi la trace de chaque collecte.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pandas as pd

CLES = {
    "prix_officiels": ["produit", "date_application"],
    "cotations": ["serie", "date_seance"],
    "taux_change": ["paire", "date_cotation"],
    "previsions": ["produit", "horizon", "date_cible", "modele_version", "emise_le"],
    "journal_collectes": ["tache", "debut"],
}
DATES = {
    "prix_officiels": ["date_application"],
    "cotations": ["date_seance"],
    "taux_change": ["date_cotation"],
    "previsions": ["date_cible"],
}

def maintenant() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def fusionner(table: str, actuel: pd.DataFrame, lignes: pd.DataFrame, priorite_source: list[str] | None) -> pd.DataFrame:
    """Table après écriture (clé primaire), colonne `_nouveau` = ligne venant de `lignes`. Avec
    priorite_source, une ligne existante d'une source plus prioritaire n'est jamais écrasée."""
    lignes = lignes.assign(_nouveau=True)
    tout = pd.concat([actuel.assign(_nouveau=False), lignes], ignore_index=True) if len(actuel) else lignes.copy()
    for c in DATES.get(table, []):
        tout[c] = pd.to_datetime(tout[c]).dt.normalize()
    if priorite_source:
        rang = {s: i for i, s in enumerate(priorite_source)}
        tout["_rang"] = tout["source_id"].map(rang).fillna(len(rang))
        tout = tout.sort_values("_rang", ascending=False, kind="stable").drop(columns="_rang")
    tout = tout.drop_duplicates(CLES[table], keep="last").sort_values(CLES[table])
    for c in DATES.get(table, []):
        tout[c] = tout[c].dt.strftime("%Y-%m-%d")
    return tout


class DepotLocal:
    def __init__(self, dossier: Path):
        self.dossier = Path(dossier)
        self.dossier.mkdir(parents=True, exist_ok=True)

    def _chemin(self, table: str) -> Path:
        return self.dossier / f"{table}.csv"

    def lire(self, table: str) -> pd.DataFrame:
        f = self._chemin(table)
        if not f.exists():
            return pd.DataFrame(columns=CLES[table])
        return pd.read_csv(f, parse_dates=DATES.get(table, []))

    def ecrire(self, table: str, lignes: pd.DataFrame, priorite_source: list[str] | None = None) -> int:
        if lignes.empty:
            return 0
        tout = fusionner(table, self.lire(table), lignes, priorite_source)
        tout.drop(columns="_nouveau").to_csv(self._chemin(table), index=False)
        return len(lignes)

    def journaliser(self, tache: str, debut: str, succes: bool, lignes: int, message: str = "") -> None:
        self.ecrire("journal_collectes", pd.DataFrame([{
            "tache": tache, "debut": debut, "fin": maintenant(), "succes": succes, "lignes": lignes, "message": message,
        }]))
