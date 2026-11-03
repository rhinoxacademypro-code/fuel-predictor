"""Test de la mesure du lien entre cotations et prix belge (données synthétiques)."""

import unittest

import numpy as np
import pandas as pd

from moteur import fiabilite


class TestLienMarche(unittest.TestCase):
    def test_decalage_et_transmission_retrouves(self):
        jours = pd.date_range("2019-01-01", "2021-12-31", freq="D")
        alea = np.random.default_rng(0)
        cotation = pd.Series(1 + np.cumsum(alea.normal(0, 0.01, len(jours))), index=jours)
        x_eur = pd.DataFrame({"ho": cotation, "rbob": cotation, "brent": cotation})
        belge = cotation.shift(3).bfill() + 1  # le prix belge reprend tout le mouvement, 3 jours plus tard
        prix = pd.concat([pd.DataFrame({"produit": p, "date_application": jours, "prix_tvac": belge.values})
                          for p in ("e10", "e98", "b7")])
        r = fiabilite.lien_marche(prix, x_eur)["b7"]
        self.assertEqual(r["decalage_jours"], 3)
        self.assertGreater(r["transmission_30j"]["part_pct"], 85)


if __name__ == "__main__":
    unittest.main()
