"""Calendrier de calcul du SPF Économie.

Le SPF calcule le prix maximum chaque jour ouvrable ; le nouveau prix s'applique le lendemain.
Jours sans calcul retenus (vérifiés sur l'historique 2015-2026, voir README) :
- samedis, dimanches et les 10 jours fériés légaux belges ;
- 15 novembre (Fête du Roi) et 26 décembre : jamais de changement le lendemain (16 cas sur 16) ;
- jours de remplacement d'un férié tombé un dimanche (lundi suivant) : aucun changement observé
  (2020-11-02 et 2021-08-16), donc « fermeture probable » ;
- fermetures annoncées par le SPF (liste FERMETURES_CONNUES).
"""

from __future__ import annotations

import datetime as dt
from functools import lru_cache

FERMETURES_CONNUES = {
    dt.date(2026, 11, 2): "fermeture annoncée sur le site du SPF",
}


def paques(y: int) -> dt.date:
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    return dt.date(y, (h + l - 7 * m + 114) // 31, (h + l - 7 * m + 114) % 31 + 1)


@lru_cache(maxsize=None)
def feries_legaux(y: int) -> dict:
    p = paques(y)
    return {
        dt.date(y, 1, 1): "Nouvel An",
        p + dt.timedelta(1): "lundi de Pâques",
        dt.date(y, 5, 1): "fête du Travail",
        p + dt.timedelta(39): "Ascension",
        p + dt.timedelta(50): "lundi de Pentecôte",
        dt.date(y, 7, 21): "fête nationale",
        dt.date(y, 8, 15): "Assomption",
        dt.date(y, 11, 1): "Toussaint",
        dt.date(y, 11, 11): "Armistice",
        dt.date(y, 12, 25): "Noël",
    }


@lru_cache(maxsize=None)
def motif_sans_calcul(jour: dt.date) -> str | None:
    """Raison pour laquelle le SPF ne calcule pas ce jour-là, ou None si c'est un jour de calcul."""
    if jour.weekday() == 5:
        return "samedi"
    if jour.weekday() == 6:
        return "dimanche"
    feries = feries_legaux(jour.year)
    if jour in feries:
        return feries[jour]
    if jour in FERMETURES_CONNUES:
        return FERMETURES_CONNUES[jour]
    if (jour.month, jour.day) == (11, 15):
        return "Fête du Roi (administration fédérale fermée)"
    if (jour.month, jour.day) == (12, 26):
        return "26 décembre (administration fédérale fermée)"
    veille = jour - dt.timedelta(1)
    if jour.weekday() == 0 and veille in feries:
        return f"remplacement de {feries[veille]} (fermeture probable)"
    return None


def jour_de_calcul(jour: dt.date) -> bool:
    return motif_sans_calcul(jour) is None
