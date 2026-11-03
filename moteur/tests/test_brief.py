"""Tests du brief du matin (aucun appel réseau).

Lancement : .venv/bin/python -m unittest discover -s tests -t .
"""

import datetime as dt
import unittest

import pandas as pd

from moteur import brief

UTC = dt.timezone.utc
MAINTENANT = dt.datetime(2026, 11, 3, 5, 10, tzinfo=UTC)  # 6 h 10 à Bruxelles (heure d'hiver)

FLUX = """<rss><channel>
<item><title>La Belgique libère 260.000 barils de diesel - RTBF</title><link>https://exemple/1</link>
<pubDate>Tue, 03 Nov 2026 04:18:00 GMT</pubDate><source url="https://rtbf.be">RTBF</source></item>
<item><title>Belgique : 260.000 barils de diesel stratégique mobilisés - Infomédiaire</title><link>https://exemple/2</link>
<pubDate>Tue, 03 Nov 2026 03:48:00 GMT</pubDate><source url="https://x">Infomédiaire</source></item>
<item><title>Bonne nouvelle à la pompe en Belgique: l'essence baisse fortement - L'Avenir</title><link>https://exemple/3</link>
<pubDate>Mon, 02 Nov 2026 20:12:00 GMT</pubDate><source url="https://lavenir.net">L'Avenir</source></item>
<item><title>Le prix de l'huile d'olive s'envole - Le Soir</title><link>https://exemple/4</link>
<pubDate>Tue, 03 Nov 2026 04:00:00 GMT</pubDate><source url="https://lesoir.be">Le Soir</source></item>
<item><title>L'OPEP maintient sa production - Reuters</title><link>https://exemple/5</link>
<pubDate>Fri, 30 Oct 2026 10:00:00 GMT</pubDate><source url="https://reuters.com">Reuters</source></item>
</channel></rss>"""


class TestPublication(unittest.TestCase):
    def test_trop_tot(self):
        ok, raison = brief.publication(dt.datetime(2026, 11, 3, 4, 59, tzinfo=UTC), False)  # 5 h 59 à Bruxelles
        self.assertFalse(ok)
        self.assertIn("trop tôt", raison)

    def test_dans_la_fenetre_hiver_et_ete(self):
        self.assertEqual(brief.publication(MAINTENANT, False), (True, "à l'heure"))
        self.assertEqual(brief.publication(dt.datetime(2026, 7, 1, 4, 10, tzinfo=UTC), False), (True, "à l'heure"))

    def test_une_seule_fois_par_jour(self):
        self.assertFalse(brief.publication(MAINTENANT, True)[0])

    def test_en_retard_apres_7_h(self):
        self.assertEqual(brief.publication(dt.datetime(2026, 11, 3, 14, 30, tzinfo=UTC), False), (True, "en retard"))


class TestActualites(unittest.TestCase):
    def setUp(self):
        self.articles = brief.lire_flux(FLUX)

    def test_lecture_du_flux(self):
        self.assertEqual(len(self.articles), 5)
        self.assertEqual(self.articles[0]["titre"], "La Belgique libère 260.000 barils de diesel")
        self.assertEqual(self.articles[0]["media"], "RTBF")
        self.assertEqual(self.articles[0]["publie_le"], "2026-11-03T04:18+00:00")

    def test_selection(self):
        titres = [a["titre"] for a in brief.selectionner(self.articles, MAINTENANT)]
        self.assertNotIn("Le prix de l'huile d'olive s'envole", titres)       # aucun mot-clé
        self.assertNotIn("L'OPEP maintient sa production", titres)            # plus de 36 h
        self.assertEqual(len([t for t in titres if "260.000" in t]), 1)       # même sujet : un seul article
        self.assertTrue(any("essence baisse" in t for t in titres))           # autre sujet : gardé

    def test_meme_sujet(self):
        self.assertTrue(brief.meme_sujet("La Belgique a puisé dans son stock stratégique de diesel",
                                         "Belgique : 260.000 barils de diesel stratégique mobilisés"))
        self.assertFalse(brief.meme_sujet("Bonne nouvelle à la pompe en Belgique : l'essence baisse",
                                          "260.000 barils de diesel mobilisés, sans baisse garantie à la pompe en Belgique"))


class TestPrix(unittest.TestCase):
    def prix(self, lignes):
        return pd.DataFrame([{"produit": p, "date_application": pd.Timestamp(d), "prix_tvac": v} for p, d, v in lignes])

    def test_prochain_prix_seulement_s_il_change(self):
        df = self.prix([("e10", "2026-10-27", 2.002), ("e10", "2026-10-28", 1.988), ("e10", "2026-11-03", 1.988),
                        ("e10", "2026-11-04", 1.905), ("b7", "2026-11-03", 2.452), ("b7", "2026-11-04", 2.452)])
        r = brief.prix_du_jour(df, dt.date(2026, 11, 3))
        self.assertEqual(r["e10"]["depuis"], "2026-10-28")
        self.assertEqual(r["e10"]["prochain"], {"date": "2026-11-04", "prix": 1.905})
        self.assertIsNone(r["b7"]["prochain"])   # ligne de demain = prix reconduit, pas une annonce


if __name__ == "__main__":
    unittest.main()
