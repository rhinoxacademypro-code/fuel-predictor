"""Tests du fichier des stations (aucun appel réseau)."""

import unittest

from moteur import stations


class TestCompacter(unittest.TestCase):
    def test_station_complete(self):
        [s] = stations.compacter([{"type": "node", "id": 1, "lat": 50.123456, "lon": 4.5, "tags": {
            "brand": "Q8", "name": "Q8 Namur", "addr:street": "Rue de Fer", "addr:housenumber": "12", "addr:postcode": "5000",
            "addr:city": "Namur", "opening_hours": "24/7", "fuel:diesel": "yes", "fuel:octane_95": "yes", "fuel:octane_98": "no"}}])
        self.assertEqual(s, {"id": "n1", "la": 50.12346, "lo": 4.5, "m": "Q8", "n": "Q8 Namur", "a": "Rue de Fer 12, 5000 Namur",
                             "h": "24/7", "f": {"e10": 1, "e98": 0, "b7": 1}})

    def test_contour_avec_centre_et_champs_absents(self):
        [s] = stations.compacter([{"type": "way", "id": 7, "center": {"lat": 50.0, "lon": 5.0}, "tags": {"operator": "DATS 24"}}])
        self.assertEqual(s, {"id": "w7", "la": 50.0, "lo": 5.0, "m": "DATS 24"})  # carburants non renseignés : rien d'inventé

    def test_stations_privees_exclues(self):
        prive = {"type": "node", "id": 2, "lat": 50.0, "lon": 4.0, "tags": {"access": "private"}}
        sans_position = {"type": "way", "id": 3, "tags": {}}
        self.assertEqual(stations.compacter([prive, sans_position]), [])


if __name__ == "__main__":
    unittest.main()
