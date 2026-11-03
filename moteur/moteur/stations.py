"""Stations-service de Belgique, d'après OpenStreetMap (licence ODbL : citer « © les contributeurs OpenStreetMap »).

Aucun prix : OpenStreetMap ne donne que l'emplacement, l'enseigne, l'adresse, les horaires et les carburants
déclarés. Le fichier est mis à jour une fois par mois ; si le serveur public est saturé, le fichier précédent reste.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request

SERVEURS = ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter")
REQUETE = ('[out:json][timeout:120];area["ISO3166-1"="BE"][admin_level=2]->.be;'
           'nwr["amenity"="fuel"](area.be);out center tags qt;')
ATTENTES_S = (0, 30, 60, 120, 240)  # nouvel essai après ces délais (serveur public souvent « à pleine capacité »)

# Carburants de l'app -> étiquettes OpenStreetMap (en Belgique, le 95 vendu est de l'E10 depuis 2017)
CARBURANTS = {"e10": ("fuel:e10", "fuel:octane_95"), "e98": ("fuel:octane_98",), "b7": ("fuel:diesel",)}


def _adresse(t: dict) -> str:
    rue = " ".join(x for x in (t.get("addr:street"), t.get("addr:housenumber")) if x)
    ville = " ".join(x for x in (t.get("addr:postcode"), t.get("addr:city")) if x)
    return ", ".join(x for x in (rue, ville) if x)


def _carburants(t: dict) -> dict:
    """1 = vendu, 0 = pas vendu ; carburant absent = non renseigné dans OpenStreetMap."""
    resultat = {}
    for code, etiquettes in CARBURANTS.items():
        valeurs = [t[e] for e in etiquettes if e in t]
        if "yes" in valeurs:
            resultat[code] = 1
        elif valeurs and all(v == "no" for v in valeurs):
            resultat[code] = 0
    return resultat


def compacter(elements: list[dict]) -> list[dict]:
    """Une ligne courte par station ouverte au public, triée par identifiant (fichier stable d'un mois à l'autre)."""
    stations = []
    for e in elements:
        t = e.get("tags", {})
        lat, lon = (e.get("lat"), e.get("lon")) if e["type"] == "node" else (e.get("center", {}).get("lat"), e.get("center", {}).get("lon"))
        if lat is None or lon is None or t.get("access") in ("private", "no") or t.get("disused") == "yes":
            continue
        s = {"id": f"{e['type'][0]}{e['id']}", "la": round(lat, 5), "lo": round(lon, 5),
             "m": t.get("brand") or t.get("operator") or "", "n": t.get("name") or "", "a": _adresse(t),
             "h": t.get("opening_hours") or "", "f": _carburants(t)}
        stations.append({k: v for k, v in s.items() if v not in ("", {})})
    return sorted(stations, key=lambda s: s["id"])


def telecharger(attente=time.sleep) -> tuple[list[dict], str]:
    """Éléments OpenStreetMap et date de la base. Plusieurs essais, sur deux serveurs ; lève l'erreur finale."""
    corps = urllib.parse.urlencode({"data": REQUETE}).encode()
    derniere = None
    for i, delai in enumerate(ATTENTES_S):
        attente(delai)
        url = SERVEURS[i % len(SERVEURS)]
        req = urllib.request.Request(url, data=corps, headers={"User-Agent": "fuel-predictor/1.0 (usage personnel, mensuel)"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.loads(r.read())
            return d["elements"], d.get("osm3s", {}).get("timestamp_osm_base", "")
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as e:
            derniere = e
            print(f"  essai {i + 1} ({url.split('/')[2]}) : {type(e).__name__}: {e}")
    raise RuntimeError(f"OpenStreetMap indisponible après {len(ATTENTES_S)} essais : {derniere}")


def fichier(stations: list[dict], base_osm: str, maintenant: str) -> dict:
    return {"genere_le": maintenant, "base_osm": base_osm, "source": "© les contributeurs OpenStreetMap (ODbL)",
            "nombre": len(stations), "stations": stations}
