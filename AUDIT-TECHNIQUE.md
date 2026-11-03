# Fuel Predictor : audit technique (étape 1)

Date de l'audit : 2 novembre 2026. Aucun code applicatif n'a été écrit.

Légende des statuts :
- **TESTÉ** : j'ai réellement appelé la source le 02/11/2026 et obtenu des données.
- **DOC LUE** : j'ai lu la documentation ou la page officielle, sans appel API réel.
- **NON VÉRIFIÉ** : information de seconde main ou impossible à tester sans compte payant.

---

## 1. En bref

1. **Prix maximums officiels belges : excellente nouvelle.** Le SPF Économie publie un PDF quotidien et Statbel expose une API gratuite (be.STAT) qui renvoie l'historique jour par jour au format CSV. Testé, ça fonctionne.
2. **Prévisions : faisables et plus solides que prévu, grâce au mécanisme belge.** Le prix maximum ne bouge pas librement : il change seulement quand un indice de cotations dépasse un seuil. C'est une règle, donc on peut l'imiter. Limite majeure : les cotations exactes utilisées (Argus, Rotterdam) sont payantes. Il faudra travailler avec des cotations proches (proxies) gratuites.
3. **Prix réels des stations : c'est le vrai mur.** La Belgique n'a **aucune obligation légale de publication des prix par station** (contrairement à la France, l'Espagne, l'Italie, l'Allemagne ou le Royaume-Uni). Les deux sources sérieuses sont payantes et sur devis : Fuel Media Service (la société qui édite carbu.com) et TomTom (réservé au secteur automobile). Sans contrat, le Station Finder ne peut pas afficher de prix réels honnêtes.
4. **Notification à 6 h 30 : faisable de façon fiable**, à condition d'avoir un vrai backend planifié. Sur iPhone, une web app doit être installée sur l'écran d'accueil pour recevoir des notifications. Un bot Telegram est une alternative plus simple et très fiable.
5. **Coût mensuel réaliste pour un usage personnel : 0 à 30 € par mois**, hors données des stations (sur devis).

**Ma recommandation :** lancer les phases 1 et 2 (prix officiels, prévisions, indicateur, Morning Brief) qui reposent sur des sources gratuites et vérifiées. Demander en parallèle un devis à Fuel Media Service avant de toucher à la phase 3.

---

## 2. Prix maximums officiels belges

### 2.1 Sources testées

| Source | Statut | Ce qu'on obtient | Coût |
|---|---|---|---|
| SPF Économie, PDF « Tarif officiel » (`economie.fgov.be/.../Tarifs-officiels-produits-petroliers.pdf`) | **TESTÉ** | Liste n° 2026/211 valable à partir du 31/10/2026. Prix HTVA, TVA, TVAC et variation, pour tous les produits | Gratuit |
| Statbel be.STAT, API CSV/JSON (`bestat.economie.fgov.be/bestat/api/views/{id}/result/CSV`) | **TESTÉ** | 4 vues standard : dernière mise à jour, 30 dernières, 365 dernières, moyennes mensuelles 24 mois, moyennes annuelles 8 ans | Gratuit, licence CC BY 4.0 selon fuel-prices.eu (NON VÉRIFIÉ chez Statbel) |
| Page SPF (marges de distribution, cotisations ASEVA, prix moyens mensuels) | **TESTÉ** | PDF des composantes du prix | Gratuit |

Valeurs réellement lues dans le PDF du SPF (liste 2026/211, valable à partir du 31/10/2026, TVAC) :
- Essence 95 E10 : 1,988 €/L
- Essence 98 E5 : 2,149 €/L
- Diesel B7 : 2,452 €/L (−0,034)

### 2.2 Ce que l'historique d'un an révèle (be.STAT, 365 jours, analysé le 02/11/2026)

| Carburant | Nombre de changements en 1 an | Variation moyenne par changement | Plus forte variation |
|---|---|---|---|
| Essence 95 E10 | 48 | 4,4 c/L | −11,8 c/L (29/05/2026) |
| Essence 98 E5 | 48 | 4,9 c/L | −10,7 c/L (29/05/2026) |
| Diesel B7 | 68 | 6,5 c/L | −30,9 c/L (10/04/2026) |

Observations utiles pour le moteur de prévision :
- **Aucun changement n'entre en vigueur un lundi** sur toute l'année. Le calcul se fait les jours ouvrables et s'applique le lendemain : un calcul du vendredi s'applique le samedi, puis rien jusqu'au mardi. Un prix connu le vendredi soir est donc garanti pour samedi, dimanche et lundi.
- Le marché 2026 est très volatil (Brent à 123 $ le 27/10/2026 selon l'EIA, carbu.com affiche un bandeau « Conflit iranien »). C'est précisément quand l'outil a le plus de valeur, mais aussi quand les prévisions sont les plus difficiles.
- **Le piège statistique** : comme le prix ne change que 1 jour sur 5 à 7, prédire « pas de changement » est correct environ 85 % du temps. Un taux de réussite élevé ne prouve donc rien. Le backtesting devra mesurer la performance **sur les jours où le prix change** et la qualité des probabilités (score de Brier), pas seulement le taux de réussite global.

### 2.3 Le mécanisme belge (ce qu'il faut modéliser)

- Le prix maximum est fixé par le **contrat-programme** entre l'État et le secteur pétrolier.
- Composantes : prix produit ex-raffinerie (cotations **Argus** des produits finis à Rotterdam, en dollars, converties en euros) + marge brute maximale de distribution (montant fixe, indexée le 1er avril et le 1er octobre) + cotisation ASEVA (indexée chaque trimestre) + accises (montant fixe par litre) + TVA 21 % sur le tout. Source : Energia.
- Accises + TVA = environ 55 % du prix de l'essence 95 E10 et 53 % du diesel (Energia, données du 31/12/2025). Conséquence : une hausse de 10 % du pétrole ne fait pas +10 % à la pompe.
- Le SPF calcule chaque jour ouvrable, sur les cotations du jour de bourse précédent. Si le résultat atteint un **seuil qui se resserre pendant 7 jours** après un changement, et si la **moyenne mobile sur 7 jours** dépasse aussi ce seuil, le prix change le lendemain (description de carbu.com, cohérente avec Energia et Brafco).
- **Inconnue à lever** : je n'ai pas trouvé le texte de l'annexe technique avec les valeurs exactes des seuils. À demander au SPF (adresse officielle : petrol.prices@economie.fgov.be). Sans ce texte, le modèle devra estimer les seuils à partir de l'historique.
- **Jours fériés** : le SPF était fermé le lundi 2 novembre 2026 (jour de fermeture administrative, pas un jour férié légal). L'API Nager.Date (testée) liste aussi des jours qui ne sont pas fériés légaux en Belgique (Vendredi saint, 26 décembre). Il faudra un calendrier belge maison, vérifié, plutôt qu'une API tierce prise telle quelle.

### 2.4 Concurrent à connaître

**carbu.com publie déjà des prévisions** du prix maximum belge, basées sur ce calcul de seuils. Fuel Predictor ne sera donc pas le premier. Sa valeur ajoutée possible : probabilités chiffrées, backtesting transparent, recommandation personnalisée selon le véhicule, brief matinal.

---

## 3. Marché pétrolier et devises

| Source | Statut | Données | Fraîcheur constatée | Coût et conditions |
|---|---|---|---|---|
| **BCE**, API SDMX (`data-api.ecb.europa.eu`) | **TESTÉ** | EUR/USD de référence | 30/10/2026 = 1,1172 (publié vers 16 h chaque jour ouvré) | Gratuit, officiel |
| **EIA**, API v2 (clé gratuite) | **TESTÉ** avec la clé de démonstration | Brent, WTI, essence et diesel New York Harbor, prix spot | Dernière valeur au 27/10/2026, soit **3 à 4 jours de retard** | Gratuit, inscription requise |
| **FRED** (Réserve fédérale de St. Louis), CSV | **TESTÉ** | Mêmes séries que l'EIA (Brent 123,10 $ le 27/10) | Même retard que l'EIA | Gratuit |
| **Yahoo Finance**, endpoint non officiel | **TESTÉ** | Contrats à terme Brent (110,02 $), essence RBOB, fioul NY, quasi temps réel (02/11/2026 06:40 UTC) | Excellente | Gratuit mais **non officiel, sans licence**, peut casser du jour au lendemain. Acceptable pour un usage personnel, pas pour un produit commercial |
| Alpha Vantage (connecteur déjà présent dans ton Claude) | DOC LUE | Brent, WTI, change | Ses séries pétrole viennent de FRED, donc même retard | Gratuit limité à 25 requêtes par jour |
| **Argus** (la référence exacte du mécanisme belge) | NON VÉRIFIÉ | Cotations Rotterdam essence et diesel | Quotidienne | Abonnement professionnel sur devis, très probablement hors budget pour un usage personnel |
| Gasoil ICE et Eurobob (meilleurs proxies européens) | NON VÉRIFIÉ | Contrats à terme européens | Temps réel | Pas de source gratuite fiable trouvée. Fournisseurs payants à chiffrer si besoin |

Points importants :
- **Le Brent seul ne suffit pas**, tu avais raison. Le 27/10/2026, le Brent valait 123 $ alors que le diesel New York valait 4,69 $ par gallon : la marge de raffinage du diesel était énorme. Le modèle doit suivre les produits raffinés, pas seulement le brut.
- Les cotations américaines (New York) sont des proxies imparfaits de Rotterdam. Le moteur devra mesurer leur corrélation avec les changements belges sur l'historique avant de s'y fier.
- Pour une prévision J+1 à 6 h 30, les données EIA et FRED arrivent trop tard. Il faut une source quotidienne fraîche (Yahoo en prototype, ou une source payante si le projet devient sérieux).

---

## 4. Actualités économiques et géopolitiques

| Source | Statut | Remarque |
|---|---|---|
| Google News RSS (requête en français, Belgique) | **TESTÉ** | Fonctionne, articles du jour (Le Soir, Zonebourse...). Conditions d'utilisation floues pour un usage automatisé |
| EIA « Today in Energy » RSS | **TESTÉ** | Fonctionne, source officielle, mais peu fréquente (pas tous les jours) |
| GDELT (base mondiale d'actualités) | **TESTÉ** | Fonctionne mais limite stricte d'une requête toutes les 5 secondes |
| OPEP, flux RSS | **TESTÉ** | Bloqué (erreur 403). Il faudra suivre l'OPEP+ via la presse |
| Analyse par IA (Claude Haiku) | DOC LUE | Pour trier, résumer et noter l'impact des 3 actualités. Coût estimé : quelques centimes par jour (à confirmer au chiffrage) |

Règle de conception : **les actualités ne pilotent pas la prévision chiffrée**. Elles servent à expliquer et à signaler un risque (ex. « décision OPEP+ ce week-end, incertitude élevée »). La prévision vient du modèle statistique. C'est exactement ce que tu demandes dans le cahier des charges.

---

## 5. Prix réels des stations-service (Station Finder)

C'est le point le plus important de cet audit.

| Option | Statut | Couverture Belgique | Coût | Verdict |
|---|---|---|---|---|
| **Données publiques officielles** | Recherche | **N'existe pas.** Aucune obligation de publication par station en Belgique (fuel-prices.eu et alertfuel.io le confirment, je n'ai trouvé aucune source contraire) | - | Impossible |
| **Fuel Media Service** (Louvain-la-Neuve, éditeur de carbu.com et mazout.com) | DOC LUE | Annonce des données en temps réel sur 15 000 stations en France, Belgique et Luxembourg (16 289 stations référencées) | **Sur devis** | Meilleure option. Source belge, la plus complète |
| **TomTom Fuel Prices API** | DOC LUE | Belgique cochée dans la page de couverture officielle | Page tarifs : **« Automotive only, Contact Sales »** | Probablement inaccessible pour un particulier |
| Google Places API (champ `fuelOptions`) | NON VÉRIFIÉ | Inconnue pour la Belgique | Quota gratuit mensuel puis payant | À tester avec une clé (coût de test : nul ou très faible) |
| Scraping de carbu.com (ex. acteur Apify) | Recherche | Bonne | Faible | **Déconseillé** : contraire aux intérêts de l'éditeur, fragile, risque juridique. Autant demander la licence à FMS |
| Revendeurs de données (Zyla Labs, Actowiz) | NON VÉRIFIÉ | Inconnue | Variable | Origine des données inconnue, probablement du scraping. Non fiable |
| **OpenStreetMap** (liste des stations, sans prix) | **TESTÉ** | 3 031 stations en Belgique, enseignes renseignées (TotalEnergies 391, Q8 288, Esso 232, Lukoil 171, DATS 24 140...), adresse pour 1 771 | Gratuit (licence ODbL, attribution) | Utile pour la carte et la liste des stations, **jamais pour les prix** |

**Conséquence directe** : sans contrat avec Fuel Media Service (ou un résultat positif du test Google), la phase 3 se limitera à une carte des stations **sans prix réels**, avec mention claire « prix non disponibles ». Le calculateur « détour rentable ou pas » dépend entièrement de ces données.

Questions à poser à Fuel Media Service dans la demande de devis :
1. Tarif pour un usage personnel ou une petite application (1 à 100 utilisateurs) ?
2. Fréquence d'actualisation et origine des prix (stations, utilisateurs, enseignes) ?
3. Historique disponible (pour les évolutions 7 et 30 jours par enseigne) ?
4. Accès aux prévisions et seuils qu'ils calculent ?
5. Droits d'affichage dans une application mobile ?

---

## 6. Notifications à 6 h 30

| Option | Fiabilité | iPhone | Android | Coût | Complexité |
|---|---|---|---|---|---|
| Web Push (application web installée, PWA) | Bonne | Oui depuis iOS 16.4, **uniquement si l'app est ajoutée à l'écran d'accueil** | Oui | Gratuit | Moyenne |
| Firebase Cloud Messaging | Bonne | Via Web Push ou app native | Oui | Gratuit | Moyenne |
| **Bot Telegram** | Très bonne | Oui | Oui | Gratuit | Faible |
| Application native (App Store) | Excellente | Oui | Oui | 99 $/an (compte développeur Apple) | Élevée |

Point technique à respecter : les planificateurs (pg_cron, Cloudflare) tournent en heure UTC. Pour 6 h 30 heure de Bruxelles toute l'année, il faut déclencher à 4 h 30 et 5 h 30 UTC et ne laisser partir que l'envoi qui tombe à 6 h 30 locales. C'est simple, mais à prévoir dès le départ.

**À éviter** : GitHub Actions pour l'envoi, car ses tâches planifiées peuvent partir avec 15 à 60 minutes de retard (DOC LUE). Il reste très bien pour les calculs de nuit (backtesting), où l'heure exacte importe peu.

---

## 7. Architecture recommandée

```
            SOURCES                          BACKEND (Supabase)                     UTILISATEUR
 ┌───────────────────────────┐     ┌──────────────────────────────────┐     ┌────────────────────┐
 │ SPF / be.STAT (prix max)  │────▶│ Tâches planifiées (pg_cron)      │     │ App web Next.js    │
 │ BCE (EUR/USD)             │────▶│  · collecte des données          │     │ installable (PWA)  │
 │ EIA / FRED (pétrole)      │────▶│  · calcul des prévisions 05:45   │────▶│ thème sombre       │
 │ Cotations récentes        │────▶│  · génération du brief           │     │ graphiques, carte  │
 │ Actualités (RSS, GDELT)   │────▶│  · envoi notification 06:30      │     └────────────────────┘
 │ [FMS stations, si contrat]│────▶│ PostgreSQL : chaque donnée avec  │────▶ Notification push
 └───────────────────────────┘     │ source, date, heure, statut      │      ou Telegram
                                   │ Clés API dans le coffre (Vault)  │
                                   └──────────────┬───────────────────┘
                                                  │
                                   ┌──────────────▼───────────────────┐
                                   │ Calculs lourds de nuit (Python)  │
                                   │ entraînement + backtesting       │
                                   │ (GitHub Actions, gratuit)        │
                                   └──────────────────────────────────┘
```

| Brique | Choix | Pourquoi |
|---|---|---|
| Interface | Next.js en PWA, hébergée sur Vercel | Installable sur smartphone, notifications web, gratuit en usage personnel (le plan gratuit Vercel est réservé au non commercial) |
| Base de données | PostgreSQL via Supabase | Base solide, tâches planifiées intégrées, coffre pour les clés |
| Planification | pg_cron + Edge Functions Supabase | Tourne même application fermée, heure précise |
| Modèle de prévision | Python (statistiques), exécuté la nuit | Les bons outils statistiques sont en Python |
| Graphiques | Apache ECharts ou Recharts | Interactifs, rapides sur mobile, thème sombre facile |
| Carte | MapLibre ou Leaflet + fond de carte (offre gratuite type MapTiler) | Gratuit à petit volume, la politique d'usage des tuiles OSM interdit l'usage intensif direct |
| IA (actualités) | Claude Haiku via API, clé côté serveur uniquement | Tri et résumé, jamais de prix inventé |

Sécurité : toutes les clés restent dans le backend, l'application téléphone n'en voit aucune. Chaque donnée stockée porte sa source, sa date, son heure de récupération, son unité et son statut (réel, estimé, prévisionnel), comme demandé.

---

## 8. Méthode de prévision proposée

Trois modèles comparés, le meilleur retenu sur un backtesting sans fuite de données (on ne prédit le jour J qu'avec ce qui était connu à J−1) :

1. **Référence naïve** : demain = prix d'aujourd'hui. Obligatoire, c'est la barre à battre.
2. **Émulateur du mécanisme belge** : on reconstitue le coût produit implicite à partir des prix officiels (prix HTVA moins accises, marge et ASEVA), on suit son évolution avec les cotations proxies converties en euros, et on applique la règle seuil plus moyenne 7 jours. C'est le modèle le plus prometteur à J+1.
3. **Modèle statistique de probabilités** (régression logistique ou gradient boosting) : variables = écart cumulé depuis le dernier changement, jours depuis le dernier changement, variations récentes des cotations et de l'EUR/USD, jour de la semaine, veille de jour férié.

Logique des horizons :
- **J+1** : les cotations utilisées par le SPF sont celles de la veille, donc déjà connues à 6 h 30. Prévision potentiellement précise si les proxies suivent bien Rotterdam.
- **J+2 et J+3** : dépendent de cotations pas encore connues. Prévision forcément probabiliste, avec intervalle large.
- Week-ends et jours fériés : pas de nouveau calcul, le prix est figé. L'outil peut alors afficher une **certitude** (« prix inchangé jusqu'à mardi ») au lieu d'une prévision.

Limite à vérifier en phase 1 : les vues be.STAT standard donnent environ 1 an de prix quotidiens. Un historique quotidien plus long (2 à 5 ans) serait préférable pour un backtesting couvrant plusieurs conditions de marché. Je ne l'ai pas encore cherché via les requêtes personnalisées de be.STAT.

---

## 9. Coûts mensuels estimés (usage personnel)

| Poste | Option économique | Option robuste |
|---|---|---|
| Données officielles (SPF, Statbel, BCE, EIA, FRED) | 0 € | 0 € |
| Cotations récentes | 0 € (Yahoo, non officiel) | À chiffrer (fournisseur payant) |
| Hébergement interface (Vercel) | 0 € | 0 € à 20 $ |
| Backend Supabase | 0 € (le plan gratuit met en pause un projet inactif, à surveiller) | 25 $ (plan Pro) |
| Notifications | 0 € | 0 € |
| IA actualités | Quelques centimes par jour | Idem |
| Fond de carte | 0 € (offre gratuite) | 0 € |
| **Total hors stations** | **≈ 0 à 5 €** | **≈ 25 à 50 €** |
| Prix des stations (Fuel Media Service) | Sur devis | Sur devis |

Les tarifs Supabase et Vercel sont ceux que je connais, à reconfirmer au moment de créer les comptes.

---

## 10. Plan de développement proposé (étape 2, pour validation)

| Phase | Contenu | Dépend de |
|---|---|---|
| **1** | Collecte SPF et be.STAT, historique, dashboard prix actuels, prévisions J+1 à J+3, indicateur « faire le plein ou attendre », backtesting de base contre la référence naïve | Rien, tout est gratuit et testé |
| **2** | Morning Brief, notification 6 h 30, actualités triées par IA, historique des briefs, alertes exceptionnelles | Choix iPhone ou Android, PWA ou Telegram |
| **3** | Station Finder, comparateur des enseignes, carte, géolocalisation | **Devis Fuel Media Service** (ou test Google concluant) |
| **4** | Calculateur d'économies, backtesting avancé, statistiques, optimisation du modèle | Phases 1 à 3 |

Je démarrerais la phase 1 par une **étude de faisabilité du modèle** (1 an d'historique, émulateur contre référence naïve). Si le modèle ne bat pas la référence naïve, on le saura avant d'avoir construit toute l'interface.

---

## 11. Décisions à prendre par Florian

1. **Ton téléphone : iPhone ou Android ?** Et préfères-tu une app web installée sur l'écran d'accueil ou un bot Telegram pour la notification ?
2. **Budget mensuel accepté** : 0 €, environ 25 €, ou plus si les données de stations le justifient ?
3. **Usage strictement personnel, ou projet à commercialiser un jour ?** Cela change les licences possibles (Yahoo, Vercel gratuit, conditions de Fuel Media Service).
4. **Demande de devis à Fuel Media Service** et **demande de l'annexe technique au SPF** : je peux rédiger les deux e-mails, c'est toi qui les envoies.

---

## Sources

Testées directement :
- SPF Économie, tarif officiel : https://economie.fgov.be/fr/themes/energie/prix-de-lenergie/prix-maximum-des-produits/tarif-officiel-des-produits
- Statbel, prix du pétrole et be.STAT : https://statbel.fgov.be/fr/themes/energie/prix-du-petrole
- BCE, API de données : https://data-api.ecb.europa.eu/
- EIA, API v2 et RSS : https://api.eia.gov/ , https://www.eia.gov/rss/todayinenergy.xml
- FRED : https://fred.stlouisfed.org/
- Overpass (OpenStreetMap) : https://overpass-api.de/
- Nager.Date : https://date.nager.at/
- GDELT : https://api.gdeltproject.org/

Lues :
- Energia, informations complémentaires sur les prix maximums : https://www.energiafed.be/fr/prix-maximums/informations-complementaires
- Brafco, informations complémentaires : https://www.brafco.be/fr/prix-produits/informations-complementaires
- carbu.com, méthode de prévision : https://carbu.com/belgique/previsions
- Fuel Media Service : https://fuelmediaservice.com/
- TomTom, couverture du Fuel Prices API : https://docs.tomtom.com/fuel-prices-api/documentation/product-information/market-coverage
- TomTom, tarifs : https://developer.tomtom.com/pricing
- fuel-prices.eu, sources et licences : https://www.fuel-prices.eu/sources/
- Alertfuel, Belgique : https://alertfuel.io/prix-pays/belgique
- Google Places API, FuelOptions : https://docs.cloud.google.com/nodejs/docs/reference/places/latest/places/protos.google.maps.places.v1.ifueloptions
- CREG, étude F745 : https://www.creg.be/sites/default/files/assets/Publications/Studies/F745FR.pdf
