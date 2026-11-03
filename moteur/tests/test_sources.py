"""Tests du nettoyage des données sources (aucun appel réseau)."""

import unittest

import pandas as pd

from moteur.sources import pics_aberrants


def serie(valeurs):
    return pd.Series({pd.Timestamp(d): v for d, v in valeurs})


class TestPicsAberrants(unittest.TestCase):
    def test_pic_brafco_2020_detecte(self):
        c = serie([("2020-07-15", 1.449), ("2020-07-20", 2.167), ("2020-07-23", 1.426), ("2020-07-28", 1.43)])
        self.assertEqual(pics_aberrants(c), [(pd.Timestamp("2020-07-20"), pd.Timestamp("2020-07-22"))])

    def test_crise_de_mars_2022_conservee(self):
        # diesel : +20 c puis −21 c en quelques jours, réel
        c = serie([("2022-03-10", 1.9), ("2022-03-11", 2.102), ("2022-03-15", 1.895)])
        self.assertEqual(pics_aberrants(c), [])

    def test_saut_durable_conserve(self):
        c = serie([("2020-01-01", 1.5), ("2020-01-02", 2.0), ("2020-02-01", 2.01)])  # pas de retour dans les 7 jours
        self.assertEqual(pics_aberrants(c), [])


if __name__ == "__main__":
    unittest.main()
