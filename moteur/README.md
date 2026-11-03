# Moteur Fuel Predictor (étapes 1.2 et 1.3)

Collecte des données et prévisions J+1 à J+3 du prix maximum belge. Les tables sont des fichiers CSV
dans `depot/`, enregistrés dans le dépôt GitHub ; prévisions et fiabilité vont dans `sorties/`, que le site lit
à sa construction. Tâche planifiée : `.github/workflows/quotidien.yml` (moteur, commit des données, publication du site).

## Commandes

Depuis ce dossier, après `python3 -m venv .venv` et `.venv/bin/pip install -r requirements.txt` :

```bash
.venv/bin/python -m moteur initialiser
```

```bash
.venv/bin/python -m moteur collecter
```

```bash
.venv/bin/python -m moteur prevoir
```

```bash
.venv/bin/python -m moteur evaluer
```

- `initialiser` : historique complet (Brafco 2015-2026 depuis `donnees_initiales/`, be.STAT 365 jours, BCE et cotations depuis 2014).
  Déjà fait : l'historique est dans `depot/`. Les fichiers Brafco d'origine restent sur le Mac (non publiés).
- `collecter` : mise à jour quotidienne. Une source en panne n'arrête pas les autres ; tout est noté dans `journal_collectes`.
- `prevoir` : prévisions du jour, archivées dans `previsions`. Avec `--date AAAA-MM-JJ` dans le passé : simulation rétrospective, **jamais archivée**, avec uniquement les prix connus ce jour-là.
- `brief` : brief du matin dans `sorties/briefs/AAAA-MM-JJ.json` : prix du jour et prochain prix publié, prévisions,
  cotations de la veille, 5 actualités au plus. Publié une seule fois par jour, à partir de 6 h à Bruxelles (« en retard »
  après 7 h) ; `--force` pour republier. Actualités : Google News (Belgique, français), titres contenant un mot-clé
  (carburant, diesel, Brent, OPEP…), moins de 36 h, un seul article par sujet ; aucun résumé rédigé.
- `evaluer` : fiabilité affichée dans l'app (`sorties/fiabilite.json`) : historique 2019-2026 recalibré sans fuite, références naïve et climatologique, indicateur rejoué, suivi des prévisions archivées.

## Règles appliquées

- **Aucune fuite de données** : une prévision du jour T utilise les prix officiels jusqu'à T et les cotations des séances terminées avant T.
- **Provenance** : chaque ligne porte `source_id`, `recupere_le`, `unite`, `statut` (réel, estimé, prévisionnel), dans chaque fichier de `depot/`.
- **Priorité des sources** : be.STAT (officiel) l'emporte sur l'historique Brafco en cas d'écart.
- **Prix certain** : si aucun jour de calcul du SPF n'existe avant la date visée, la prévision est marquée certaine avec la raison (week-end, férié, fermeture du SPF).
- **Ligne be.STAT pour demain** : considérée comme officielle seulement si elle annonce un changement (be.STAT peut reconduire le prix du jour avant la publication).
- **Probabilités** : régression logistique, puis recalibrage isotonique de la probabilité de changement, plafonnée à 90 %.

## Calendrier du SPF (`moteur/calendrier.py`)

Jours sans calcul : week-ends, 10 jours fériés légaux, 15 novembre et 26 décembre (aucun changement le
lendemain sur 16 cas observés entre 2016 et 2025), lundi de remplacement d'un férié tombé un dimanche
(fermeture probable), fermetures annoncées (ex. 2 novembre 2026). Le 2 janvier est un jour de calcul.

## Fiabilité mesurée (hors échantillon, 2019-2026, jours incertains)

| Recalibrage | Score de Brier moyen (9 cas) |
|---|---|
| Aucun (modèle brut) | 0,3253 |
| **Isotonique (retenu)** | **0,3236** |
| Platt (testé, écarté) | 0,3286 |

Le recalibrage corrige surtout le diesel. Exemple, diesel J+3, probabilités annoncées au-dessus de 70 % :
brut 90 % annoncé pour 77 % observé, recalibré 84 % pour 80 %. **Limite restante : à J+1, les fortes
probabilités restent trop optimistes** (diesel : 88 % annoncé pour 59 % observé). L'interface devra le signaler.

Deux vérifications rétrospectives sur des cas réels récents :
- 27/10/2026, diesel J+1 : hausse annoncée à 40 %, hausse réelle de 6,6 c le 28/10 (signal partiel).
- 30/10/2026, diesel J+1 : baisse annoncée à 4 %, baisse réelle de 3,4 c le 31/10 (manquée).

## Tests

```bash
.venv/bin/python -m unittest discover -s tests -t .
```

Dépôt CSV testé dans un dossier temporaire : priorité des sources (be.STAT l'emporte sur Brafco),
remplacement d'une ligne be.STAT, archivage des prévisions sans écrasement.
