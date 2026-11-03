# Fuel Predictor : mise en ligne (tout sur GitHub)

Durée : 15 minutes. Coût : 0 €. Il te faut seulement ton compte GitHub et GitHub Desktop.

**Aucune clé, aucun mot de passe à copier.** Les données et le site vivent dans le dépôt GitHub :

| Brique | Où | Rôle |
|---|---|---|
| Moteur | GitHub Actions, tâche « Quotidien » | Collecte les prix et cotations, calcule les prévisions, 3 fois par jour |
| Données | Dossiers `moteur/depot` et `moteur/sorties` du dépôt | Enregistrées par la tâche après chaque calcul (commit automatique) |
| Site | GitHub Pages | Page reconstruite après chaque calcul, à ouvrir dans Safari |

**À savoir** : le dépôt est **public**, car GitHub Pages gratuit l'exige. N'importe qui peut voir le code et les prix calculés, qui ne contiennent rien de personnel. Tes réglages (carburant, quantité, seuils) restent sur ton iPhone. Les fichiers Brafco d'origine et les brouillons d'e-mails ne sont pas publiés.

---

## Étape 1 : publier le dépôt

1. Ouvre **GitHub Desktop**, menu **File**, puis **Add Local Repository…**
2. Choisis le dossier `jarvis-starter-kit/tools/fuel-predictor`, puis **Add Repository**.
3. En bas à gauche, dans **Summary**, écris `Version initiale`, puis clique sur **Commit to main**.
4. Clique sur **Publish repository** en haut.
   - Name : `fuel-predictor`.
   - **Décoche la case « Keep this code private »**.
   - Clique sur **Publish Repository**.

GitHub lance tout de suite une première tâche qui va **échouer** : c'est normal, le site n'est pas encore activé (étape 2). Tu recevras peut-être un e-mail d'échec : ignore-le.

## Étape 2 : activer le site (GitHub Pages)

1. Sur github.com, ouvre ton dépôt `fuel-predictor`.
2. Onglet **Settings** (roue dentée, en haut à droite du dépôt).
3. Dans le menu de gauche, clique sur **Pages**.
4. Sous **Build and deployment**, champ **Source** : choisis **GitHub Actions**.

Rien d'autre à remplir sur cette page.

## Étape 3 : lancer la tâche une première fois

1. Onglet **Actions** du dépôt.
2. À gauche, clique sur **Quotidien**.
3. À droite, bouton **Run workflow**, puis le bouton vert **Run workflow**.
4. Attends 5 à 8 minutes, puis recharge la page.
   - Deux coches vertes (`moteur` et `site`) : réussi.
   - Une croix rouge : clique dessus, ouvre l'étape en rouge et copie-moi les dernières lignes.

## Étape 4 : ouvrir l'app sur ton iPhone

1. L'adresse est de la forme `https://TON-NOM-GITHUB.github.io/fuel-predictor/`. Tu la retrouves dans **Settings**, puis **Pages**, en haut (« Your site is live at… »).
2. Ouvre-la dans **Safari**.
3. Bouton **Partager**, puis **Sur l'écran d'accueil**, puis **Ajouter**.
4. Ouvre l'app depuis l'icône (goutte verte).

---

## Ensuite, tout est automatique

- Chaque nuit vers 4 h-5 h (heure belge) : prévisions du jour et fiabilité.
- En semaine vers 15 h 30 et 17 h 30 : détection d'un nouveau prix officiel pour le lendemain.
- GitHub peut retarder ces tâches de quelques minutes à une heure.

Si une tâche échoue (par exemple une source indisponible), GitHub t'envoie un e-mail et le site garde les dernières données. L'app affiche l'heure de la dernière mise à jour, et un avertissement si elle date de plus de 36 heures.

GitHub peut mettre en pause les tâches planifiées d'un dépôt public sans activité pendant 60 jours. Les commits automatiques devraient l'éviter. Si tu reçois un e-mail à ce sujet, il suffit de cliquer sur le bouton pour les réactiver.

## Envoie-moi ensuite

- L'adresse du site (elle n'est pas secrète) : je la vérifierai de mon côté.
- Le résultat de la tâche **Quotidien** (coches vertes, ou les lignes d'erreur).
- Ta version d'iOS (pour les notifications de la phase 2).
