import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Fichiers écrits par le moteur (moteur/depot et moteur/sorties), lus pendant la construction du site.
// La construction peut être lancée depuis web/ (GitHub Actions) ou depuis la racine de l'espace de travail (Mac).
const RACINES = [path.join(process.cwd(), "..", "moteur"), path.join(process.cwd(), "tools", "fuel-predictor", "moteur")];

export async function lireFichierMoteur(chemin: string): Promise<string> {
  for (const racine of RACINES) {
    try {
      return await readFile(path.join(racine, chemin), "utf8");
    } catch {
      // essai de la racine suivante
    }
  }
  throw new Error(`fichier du moteur introuvable : ${chemin}`);
}

export async function listerDossierMoteur(dossier: string): Promise<string[]> {
  for (const racine of RACINES) {
    try {
      return await readdir(path.join(racine, dossier));
    } catch {
      // essai de la racine suivante
    }
  }
  throw new Error(`dossier du moteur introuvable : ${dossier}`);
}
