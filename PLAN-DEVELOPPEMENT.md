# Fuel Predictor : plan de développement (étape 2)

Date : 2 novembre 2026. Base : [AUDIT-TECHNIQUE.md](AUDIT-TECHNIQUE.md).

## Cadre validé par Florian

| Décision | Choix | Conséquence |
|---|---|---|
| Téléphone | iPhone | Notification via app web installée sur l'écran d'accueil, ou bot Telegram (voir plus bas) |
| Budget | **0 €** | Uniquement des offres gratuites. Aucune carte bancaire enregistrée nulle part |
| Usage | Personnel, gratuit | Les sources « usage personnel uniquement » (Yahoo) sont acceptables |
| Hébergement (03/11/2026) | Tout sur GitHub, dépôt public | Plus de Supabase (limite de projets gratuits atteinte) ni de Vercel |

---

## Architecture à 0 €

| Brique | Service gratuit | Limite à surveiller |
|---|---|---|
| Interface (app web installable) | GitHub Pages, site statique reconstruit après chaque calcul | Dépôt public obligatoire. Données à jour au dernier calcul, pas en direct |
| Données | Fichiers CSV et JSON dans le dépôt (`moteur/depot`, `moteur/sorties`) | Commit automatique à chaque calcul. Quelques Mo par an |
| Calculs et tâches planifiées | GitHub Actions | Horaires imprécis (retards possibles) : réservé aux calculs de nuit, jamais à l'envoi de 6 h 30. Tâches planifiées mises en pause après 60 jours sans activité (les commits automatiques devraient l'éviter) |
| Données marché | SPF, be.STAT, BCE, EIA (clé gratuite), Yahoo (non officiel) | Yahoo peut changer sans prévenir : prévoir une alerte si la collecte échoue |
| Notification | Web Push (gratuit) ou Telegram (gratuit) | Voir ci-dessous |
| Carte | Leaflet + fond de carte gratuit | Petit volume uniquement |

### Ce que le budget 0 € change

1. **Station Finder** : le devis Fuel Media Service sera très probablement payant. Sans lui, pas de prix réels par station. Alternative gratuite et honnête : une **saisie personnelle** des prix que tu vois en station (source affichée : « relevé personnel du JJ/MM à HHhMM »). Avec le temps, tu obtiens ton propre historique de tes stations habituelles. Google Places reste à tester, mais demande d'enregistrer une carte bancaire même pour l'offre gratuite.
2. **Analyse des actualités par IA** : l'API Claude est payante (quelques centimes par jour). Pour la v1 à 0 € : sélection par règles (sources reconnues, mots-clés OPEP+, Brent, raffinerie, sanctions, scoring de pertinence) et résumé issu du texte de l'article. Option IA à décider en phase 2.

### Notification sur iPhone : deux options

| | App web installée (Web Push) | Bot Telegram |
|---|---|---|
| Pour | Tout dans une seule app, un tap ouvre directement le brief | Très fiable, configuration simple, fonctionne quel que soit le réglage de Safari |
| Contre | Il faut ajouter l'app à l'écran d'accueil et l'ouvrir depuis l'icône. Certaines sources signalent des restrictions dans l'UE, information contradictoire à tester sur ton iPhone | Il faut installer Telegram. Le brief s'ouvre dans le navigateur via un lien |
| Coût | 0 € | 0 € |

Ma recommandation : construire le Web Push (c'est ce que tu décris dans le cahier des charges) et **le tester sur ton iPhone dès le début de la phase 2**. Si ce n'est pas fiable, Telegram prend le relais. La décision n'est pas nécessaire avant la phase 2.

---

## Phase 1 : prix officiels, prévisions, indicateur

Chaque étape se termine par une vérification et un compte rendu avant de passer à la suivante.

| Étape | Contenu | Vérification | Comptes nécessaires |
|---|---|---|---|
| **1.0 Étude de faisabilité du modèle** | Script local : 1 an de prix officiels (be.STAT), cotations proxies (Yahoo), EUR/USD (BCE). Reconstitution du coût produit, émulateur du mécanisme belge, comparaison avec la référence naïve « prix inchangé » | Rapport chiffré : le modèle bat-il la référence naïve, à J+1, J+2, J+3 ? Décision de continuer ou d'ajuster | **Aucun** |
| 1.1 Mise en place | Squelette de l'app, données en fichiers dans le dépôt | L'app s'affiche sur ton iPhone | GitHub uniquement (Actions + Pages) |
| 1.2 Collecte automatique | SPF, be.STAT, BCE, EIA, Yahoo. Chaque donnée stockée avec source, date, heure, unité, statut | 3 jours de collecte sans trou, valeurs identiques au PDF du SPF | - |
| 1.3 Moteur de prévision | Prévisions J+1 à J+3 avec probabilités hausse, stable, baisse, intervalle et confiance. Chaque prévision est archivée avant d'être connue | Les prévisions sont enregistrées tous les matins, comparées le lendemain au prix réel | - |
| 1.4 Dashboard | Prix actuels, prévisions, indicateur « faire le plein / attendre / pas de différence », thème sombre, mobile d'abord | Test sur iPhone, lecture de la situation en moins de 10 secondes | - |
| 1.5 Fiabilité visible | Page de performance : modèle contre référence naïve, alerte affichée si le modèle est mauvais | Les chiffres affichés correspondent au rapport de backtesting | - |

**Critère de passage de l'étape 1.0 (provisoire, à affiner avec les données)** : à J+1, le modèle doit annoncer correctement le sens d'une majorité des changements réels, sans fausses alertes en excès, et obtenir un meilleur score de probabilité (score de Brier) que la référence naïve. Si ce n'est pas le cas, je te le dis et on ajuste avant de construire l'interface.

## Phases suivantes (aperçu)

| Phase | Contenu | Point bloquant |
|---|---|---|
| 2 | Morning Brief, notification 6 h 30 (heure belge été et hiver), actualités, historique des briefs, alertes exceptionnelles | Test du Web Push sur ton iPhone. Choix IA ou règles pour les actualités |
| 3 | Carte des stations (OpenStreetMap), filtres, géolocalisation, recherche par code postal, saisie personnelle des prix | Réponse de Fuel Media Service |
| 4 | Calculateur d'économies, backtesting avancé, statistiques, amélioration du modèle | - |

## Ce que tu devras faire toi-même

- Publier le dépôt et activer GitHub Pages ([guide](GUIDE-MISE-EN-LIGNE.md)).
- Envoyer les deux e-mails de [EMAILS-DEMANDES.md](EMAILS-DEMANDES.md).
- Installer l'app sur ton écran d'accueil pour les tests.

---

## Suivi d'avancement

| Étape | État au 03/11/2026 |
|---|---|
| 1.0 Étude de faisabilité | Terminée : [rapport](etude-faisabilite/RAPPORT-FAISABILITE.md) |
| 1.1 Mise en place | Passage au « tout sur GitHub » fait et testé en local (site statique). Publication à faire par Florian ([guide](GUIDE-MISE-EN-LIGNE.md)) |
| 1.2 Collecte automatique | Code prêt et testé en local ([moteur](moteur/README.md)). Tâche « Quotidien » écrite, pas encore lancée sur GitHub |
| 1.3 Moteur de prévision | Code prêt et testé en local, probabilités recalibrées. Archivage dans `moteur/depot/previsions.csv` |
| 1.4 Dashboard | Indicateur, prévisions et réglages faits et testés en local (10 tests de la règle de décision), lus depuis les fichiers du moteur |
| 1.5 Fiabilité visible | Page Fiabilité et alerte « moteur pas meilleur » faites et testées en local. Le suivi en direct démarrera avec les prévisions quotidiennes |
| 2 Morning Brief | Fait le 03/11/2026 et testé en local : onglet Brief publié entre 6 h et 7 h (4 créneaux GitHub), actualités par mots-clés, marché de la veille, historique 30 jours. **Sans notification** (choix de Florian) |
| Onglet Marchés | Fait le 03/11/2026 (avance sur la phase 4) : prix maximum belge, Brent, gasoil et essence New York, euro-dollar sur 7 jours, 1 mois, 1 an ; décalage et transmission mesurés (calcul de nuit). Informatif, sans conseil d'investissement (refusé) |
| 3 Stations | Fait le 03/11/2026 et testé en local : 3 014 stations OpenStreetMap (mise à jour mensuelle), carte (tuiles OSM), position ou commune, rayon 5/10/20 km, enseigne, favoris, itinéraire Plans, plafond légal du jour, relevés de prix personnels avec historique (stockés dans Safari). Aucun prix de station sans source réelle |
