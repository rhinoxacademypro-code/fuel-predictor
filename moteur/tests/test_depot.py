"""Tests du dépôt CSV (dossier temporaire, aucun appel réseau).

Lancement : .venv/bin/python -m unittest discover -s tests -t .
"""

import tempfile
import unittest

import pandas as pd

from moteur.depot import DepotLocal

PRIORITE = ["bestat", "spf", "brafco"]


def prix(date, valeur, source):
    return {"produit": "b7", "date_application": date, "prix_tvac": valeur, "prix_htva": None, "unite": "EUR/L",
            "source_id": source, "recupere_le": "2026-11-02T07:00:00+00:00", "statut": "reel"}


class TestDepotLocal(unittest.TestCase):
    def setUp(self):
        self.dossier = tempfile.TemporaryDirectory()
        self.depot = DepotLocal(self.dossier.name)

    def tearDown(self):
        self.dossier.cleanup()

    def lignes(self):
        return {r["date_application"].strftime("%Y-%m-%d"): r for r in self.depot.lire("prix_officiels").to_dict("records")}

    def test_table_absente_vide(self):
        self.assertTrue(self.depot.lire("cotations").empty)

    def test_priorite_source_brafco_n_ecrase_pas_bestat(self):
        self.depot.ecrire("prix_officiels", pd.DataFrame([prix("2026-10-31", 2.452, "bestat")]), priorite_source=PRIORITE)
        self.depot.ecrire("prix_officiels", pd.DataFrame([prix("2026-10-31", 2.450, "brafco"), prix("2026-10-30", 2.486, "brafco")]),
                          priorite_source=PRIORITE)
        lignes = self.lignes()
        self.assertEqual(lignes["2026-10-31"]["prix_tvac"], 2.452)
        self.assertEqual(lignes["2026-10-30"]["prix_tvac"], 2.486)

    def test_bestat_remplace_bestat(self):
        self.depot.ecrire("prix_officiels", pd.DataFrame([prix("2026-11-03", 2.452, "bestat")]), priorite_source=PRIORITE)
        self.depot.ecrire("prix_officiels", pd.DataFrame([prix("2026-11-03", 2.430, "bestat")]), priorite_source=PRIORITE)
        self.assertEqual(self.lignes()["2026-11-03"]["prix_tvac"], 2.430)
        self.assertEqual(len(self.lignes()), 1)

    def test_previsions_archivees_sans_ecrasement(self):
        base = {"produit": "b7", "horizon": 1, "date_cible": "2026-11-04", "modele_version": "v", "p_stable": 1.0}
        self.depot.ecrire("previsions", pd.DataFrame([{**base, "emise_le": "2026-11-03T03:20:00+00:00"}]))
        self.depot.ecrire("previsions", pd.DataFrame([{**base, "emise_le": "2026-11-03T14:40:00+00:00", "p_stable": 0.5}]))
        self.assertEqual(len(self.depot.lire("previsions")), 2)


if __name__ == "__main__":
    unittest.main()
