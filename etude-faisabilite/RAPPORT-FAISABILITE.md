# Fuel Predictor : rapport de l'étude de faisabilité (étape 1.0)

Date : 2 novembre 2026. Tous les chiffres viennent de données réelles et d'un backtesting reproductible (commandes en fin de document).

---

## 1. Verdict

**Le moteur de prévision bat la référence naïve. On peut continuer, avec quatre ajustements.**

- Sur près de 10 ans de tests (2017 à 2026), le modèle retenu donne de meilleures probabilités que la référence naïve « prix inchangé » et que les simples statistiques historiques, pour les trois carburants et les trois horizons.
- **Limite principale : J+1.** Le modèle repère seulement 29 % des changements du diesel du lendemain (16 à 18 % pour l'essence). Les cotations gratuites (New York) ne reflètent pas assez fidèlement les cotations de Rotterdam utilisées par le SPF.
- **Point fort : quand il se trompe, c'est presque toujours sans conséquence.** Dans 2 à 7 % des alertes seulement, le prix part dans le sens opposé. Le reste des erreurs, ce sont des jours où le prix n'a finalement pas bougé.
- **Constat qui change les priorités : choisir le bon moment rapporte peu.** Pour un plein de 50 L par semaine, suivre le modèle aurait fait économiser environ 3 à 4 € par an en moyenne, et jusqu'à 15 € en 2026, année très agitée. Même en connaissant l'avenir, le maximum possible avec 2 jours de marge est d'environ 8 à 11 € par an (29 € en 2026). Le choix de la station pèse beaucoup plus lourd (voir point 6).

---

## 2. Données utilisées

| Donnée | Source | Période | Contrôle |
|---|---|---|---|
| Prix maximums officiels quotidiens (95 E10, 98 E5, diesel B7) | Brafco, banque de données (export annuel) | 01/01/2015 au 31/10/2026 | Identiques à be.STAT (Statbel) sur 362 jours communs, sauf 2 jours en mars 2026 pour l'E10 |
| EUR/USD | BCE | 2014 à 2026 | Officiel |
| Cotations : diesel/fioul New York, essence RBOB, Brent | Yahoo Finance (contrats à terme, non officiel) | 2014 à 2026 | Pas de source gratuite pour Rotterdam (testé : aucun contrat ICE Gasoil disponible sur Yahoo) |

Le **calendrier de calcul du SPF** (jours ouvrables hors jours fériés légaux, prix appliqué le lendemain) a été vérifié sur 1 358 changements de prix : seuls 3 ne le respectent pas.

---

## 3. Méthode (sans fuite de données)

- Chaque prévision est faite « comme le matin à 6 h 30 » : seuls les prix officiels déjà publiés et les cotations des séances déjà clôturées sont utilisés.
- Vérification préalable : le SPF utilise bien les cotations **de la séance précédant le jour de calcul**. C'est ce décalage qui explique le mieux les changements observés (le diesel varie dans le même sens que la cotation dans 92 % des cas).
- **Walk-forward** : chaque année de 2017 à 2026 est prédite par des modèles entraînés uniquement sur les années précédentes.
- Les jours où le prix est **certain** (aucun calcul du SPF possible avant la date visée : week-end, jour férié) sont mis à part. Ils représentent 31 % des prévisions à J+1, 15 % à J+2 et 1 % à J+3. Les scores ci-dessous portent uniquement sur les jours **incertains**, pour ne pas gonfler les résultats.

Cinq méthodes comparées :

| Méthode | Principe |
|---|---|
| Naïf | Le prix ne bouge pas (référence imposée par le cahier des charges) |
| Climatologie | Fréquence historique des hausses et des baisses selon le calendrier |
| Émulateur | Imitation du mécanisme belge : écart des cotations depuis le dernier changement comparé à un seuil estimé |
| **Régression logistique** | Probabilités calculées à partir des cotations, du taux de change et du calendrier |
| Gradient boosting | Même chose avec un algorithme plus complexe |

**Méthode retenue : la régression logistique.** Elle obtient le meilleur score de probabilité (ou fait jeu égal) dans les 9 cas, et le boosting ne fait jamais mieux. Pour un même résultat, la méthode la plus simple est la plus robuste.

---

## 4. Résultats du modèle retenu (jours incertains, 2017 à 2026)

### 4.1 Qualité des probabilités (score de Brier, plus bas = meilleur)

| Carburant | Horizon | Modèle | Naïf | Climatologie | Amélioration / climatologie |
|---|---|---|---|---|---|
| Diesel B7 | J+1 | 0,256 | 0,351 | 0,306 | **16 %** |
| Diesel B7 | J+2 | 0,344 | 0,564 | 0,441 | **22 %** |
| Diesel B7 | J+3 | 0,379 | 0,704 | 0,503 | **25 %** |
| Essence 95 E10 | J+1 | 0,235 | 0,284 | 0,254 | **8 %** |
| Essence 95 E10 | J+2 | 0,323 | 0,459 | 0,375 | **14 %** |
| Essence 95 E10 | J+3 | 0,369 | 0,575 | 0,437 | **16 %** |
| Essence 98 E5 | J+1 | 0,233 | 0,282 | 0,253 | **8 %** |
| Essence 98 E5 | J+2 | 0,322 | 0,458 | 0,375 | **14 %** |
| Essence 98 E5 | J+3 | 0,370 | 0,576 | 0,438 | **16 %** |

Le modèle fait mieux que les deux références dans les 9 cas. Il fonctionne mieux pour le diesel (la cotation diesel de New York suit mieux Rotterdam que l'essence RBOB américaine).

### 4.2 Les alertes (le modèle annonce une hausse ou une baisse)

| Carburant | Horizon | Changements repérés | Alertes justes | Prix finalement stable | Sens opposé | Gain moyen par alerte (plein 50 L) |
|---|---|---|---|---|---|---|
| Diesel B7 | J+1 | 29 % | 52 % | 46 % | **2 %** | 1,26 € |
| Diesel B7 | J+2 | 41 % | 61 % | 36 % | **2 %** | 1,41 € |
| Diesel B7 | J+3 | 47 % | 67 % | 29 % | **4 %** | 1,41 € |
| Essence 95 E10 | J+1 | 16 % | 42 % | 53 % | **5 %** | 1,08 € |
| Essence 95 E10 | J+2 | 26 % | 53 % | 42 % | **6 %** | 1,20 € |
| Essence 95 E10 | J+3 | 32 % | 57 % | 37 % | **7 %** | 1,20 € |

À lire ainsi : à J+3 pour le diesel, quand le modèle annonce un mouvement, il a raison 2 fois sur 3. Quand il a tort, c'est presque toujours parce que rien n'a bougé, donc sans perte pour toi.

### 4.3 Prix estimé en €/L

En erreur moyenne au centime près, le modèle **ne fait pas mieux que le naïf à J+1** (0,68 contre 0,65 centime pour le diesel). Il fait légèrement mieux à J+2 et J+3 pour le diesel (1,13 contre 1,31 centime à J+3). Conséquence pour l'interface : afficher le prix actuel, le **scénario le plus probable** et les probabilités, plutôt qu'un faux prix précis au millième.

### 4.4 Fiabilité des probabilités (calibration)

| Diesel J+1 : probabilité de changement annoncée | Fréquence réellement observée |
|---|---|
| 5 % | 7 % |
| 25 % | 27 % |
| 40 % | 38 % |
| 59 % | 44 % |
| **87 %** | **62 %** |

Les probabilités faibles et moyennes sont fiables. **Les probabilités élevées sont trop optimistes** (même constat à J+3 et pour l'essence). À corriger avant affichage par un recalibrage, technique standard ajoutée en phase 1.3.

### 4.5 Stabilité selon les conditions de marché

Le modèle bat la climatologie **chaque année** de 2017 à 2026 pour le diesel à J+1 (de +7 % en 2017 à +29 % en 2018), y compris en 2020 (Covid), 2022 (crise énergétique) et 2026. Seule exception : l'essence E10 en 2017 (−56 %), première année d'existence de ce carburant avec très peu d'historique pour apprendre.

### 4.6 Le Brent seul ne suffit pas (confirmé)

Avec le Brent comme seule cotation, le diesel à J+1 passe d'un score de 0,256 à 0,275, et l'émulateur ne détecte plus aucun changement à J+1. Les cotations des produits raffinés sont indispensables.

---

## 5. Pourquoi J+1 reste difficile

1. **Cotations inexactes** : le SPF utilise les cotations Argus de Rotterdam, payantes. Le modèle utilise New York, qui n'évolue pas exactement pareil d'un jour à l'autre. Or la décision du SPF se joue souvent à un millième près autour du seuil.
2. **Seuils inconnus** : sans l'annexe technique (demandée au SPF par l'e-mail préparé), l'émulateur doit deviner le seuil. Il a donné de mauvais résultats seul (très peu d'alertes à J+1 pour le diesel, aucune pour l'essence), mais il sert d'ingrédient au modèle retenu.
3. **Ce qui pourrait améliorer J+1 à 0 €** : l'annexe technique du SPF, puis tester les prévisions publiées par carbu.com si Fuel Media Service les inclut dans une offre gratuite (peu probable).

---

## 6. Ce que ça change pour le projet

**Combien rapporte le bon moment ?** Simulation : un plein de 50 L par semaine, avec la possibilité de le décaler de 1 ou 2 jours selon l'avis du modèle.

| Carburant | Économie avec le modèle | Maximum possible (avenir connu) | Pleins où suivre le modèle a coûté |
|---|---|---|---|
| Diesel B7 | 4,4 € / an (14,6 € en 2026) | 11,0 € / an (29,0 € en 2026) | 0,2 % |
| Essence 95 E10 | 3,2 € / an (5,6 € en 2026) | 8,2 € / an (13,5 € en 2026) | 0,3 % |
| Essence 98 E5 | 3,6 € / an | 9,6 € / an | 0,3 % |

**Comparaison (calcul illustratif, pas une donnée mesurée)** : une station qui vend 5 centimes sous le prix maximum, sur 50 L par semaine, fait économiser 130 € par an.

Conclusion honnête : le prix maximum belge est très encadré, il bouge peu et par petits pas. **Le « quand » vaut quelques euros par an, le « où » en vaut beaucoup plus.** L'indicateur « faire le plein ou attendre » reste utile, surtout en période agitée comme 2026, mais il ne doit pas être vendu comme une source d'économies importantes. Pour le « où », la saisie personnelle des prix vus en station (0 €) prend plus de valeur.

---

## 7. Recommandation pour la suite de la phase 1

**Continuer**, avec ces ajustements intégrés au plan :

1. **Modèle** : régression logistique sur plusieurs cotations (diesel New York, essence RBOB, Brent, EUR/USD) et calendrier, réentraînée régulièrement.
2. **Recalibrage des probabilités** avant affichage (correction de l'excès de confiance au-dessus de 60 %).
3. **Affichage honnête** : jours « prix certain » mis en avant (31 % des cas à J+1), probabilités plutôt qu'un faux prix précis, et avertissement clair sur la faiblesse de J+1.
4. **Indicateur de décision** : recommandation seulement si la probabilité recalibrée est élevée et le gain attendu supérieur à environ 1 € sur le plein. Sinon : « pas de différence significative ».

---

## 8. Limites de cette étude

- Cotations Yahoo non officielles. Les contrats à terme changent d'échéance chaque mois, ce qui crée de petits sauts artificiels dans les séries.
- Les changements purement administratifs (accises, marges au 1er avril et au 1er octobre, cotisation ASEVA trimestrielle) sont comptés comme des changements à prévoir. Le modèle ne peut pas les anticiper, ce qui pénalise un peu ses scores.
- Les seuils exacts du mécanisme belge restent inconnus (annexe technique non publiée en ligne).
- La simulation d'économies suppose un plein décalable de 2 jours maximum et ne compte pas les pleins avancés pour éviter une hausse. Le gain réel pourrait être un peu plus élevé, mais du même ordre de grandeur.

---

## 9. Reproduire l'étude

Depuis ce dossier :

```bash
.venv/bin/python collecte.py
```

```bash
.venv/bin/python etude.py
```

```bash
.venv/bin/python synthese.py
```

Les fichiers Brafco (`donnees/brut/brafco/daily-AAAA.xlsx`) se téléchargent via le formulaire de https://www.brafco.be/fr/prix-produits/banque-de-donnees. Résultats détaillés : `resultats/metriques.csv`, `resultats/synthese.json`, `resultats/par_annee_j1.csv`.
