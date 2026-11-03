import type { Prevision } from "@/lib/decision";
import { lireFichierMoteur, listerDossierMoteur } from "@/lib/fichiers-moteur";
import type { CodeProduit } from "@/lib/produits";

// Briefs du matin écrits par `python -m moteur brief` dans moteur/sorties/briefs/AAAA-MM-JJ.json

export type PrixBrief = { nom: string; prix: number; depuis: string; prochain: { date: string; prix: number } | null };

export type Cotation = {
  serie: "brent" | "ho" | "rbob" | "eurusd";
  nom: string;
  unite: string;
  valeur: number;
  date: string;
  precedent: number;
  date_precedent: string;
  variation_pct: number;
};

export type Actualite = { titre: string; media: string; lien: string; publie_le: string; mots_cles: string[] };

export type Brief = {
  date: string;
  genere_le: string;
  en_retard: boolean;
  prix: Partial<Record<CodeProduit, PrixBrief>>;
  previsions: Prevision[];
  marche: Cotation[];
  actualites: Actualite[];
  actualites_erreur: string;
  actualites_source: string;
};

const HISTORIQUE = 30;

export async function chargerBriefs(): Promise<Brief[]> {
  try {
    const fichiers = (await listerDossierMoteur("sorties/briefs")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
    return Promise.all(fichiers.slice(0, HISTORIQUE).map(async (f) => JSON.parse(await lireFichierMoteur(`sorties/briefs/${f}`)) as Brief));
  } catch {
    return []; // aucun brief publié pour l'instant
  }
}
