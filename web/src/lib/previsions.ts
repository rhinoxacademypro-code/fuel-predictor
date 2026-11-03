import type { Prevision } from "@/lib/decision";
import { lireFichierMoteur, listerDossierMoteur } from "@/lib/fichiers-moteur";

// Prévisions et fiabilité écrites par le moteur dans moteur/sorties/, lues à la construction du site.

export type ResultatPrevisions = { ok: true; previsions: Prevision[] } | { ok: false; erreur: string };

export async function chargerPrevisions(): Promise<ResultatPrevisions> {
  try {
    const fichiers = (await listerDossierMoteur("sorties")).filter((f) => /^previsions-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    const dernier = fichiers.at(-1);
    if (!dernier) return { ok: false, erreur: "aucune prévision produite par le moteur" };
    return { ok: true, previsions: JSON.parse(await lireFichierMoteur(`sorties/${dernier}`)) as Prevision[] };
  } catch {
    return { ok: false, erreur: "prévisions du moteur introuvables" };
  }
}

// Fiabilité calculée par `python -m moteur evaluer` (moteur/sorties/fiabilite.json)
export type FiabiliteHorizon = {
  periode: [string, string];
  jours_incertains: number;
  changements_reels: number;
  brier_modele: number;
  brier_naif: number;
  brier_climatologie: number;
  gain_vs_climatologie_pct: number;
  gain_vs_naif_pct: number;
  meilleur_que_references: boolean;
  changements_reperes_pct: number;
  alertes: number;
  alertes_justes_pct: number | null;
  alertes_sens_oppose_pct: number | null;
  jours_certains: number;
  jours_certains_dementis: number;
  calibration: { annonce: number; observe: number; n: number }[];
  par_annee: { annee: number; gain_pct: number; changements: number }[];
};

export type FiabiliteIndicateur = {
  jours: number;
  verts: number;
  oranges: number;
  gris: number;
  gain_moyen_par_recommandation_eur: number | null;
  recommandations_gagnantes_pct: number | null;
  recommandations_perdantes_pct: number | null;
  gain_total_eur: number;
  quantite_l: number;
};

export type Fiabilite = {
  genere_le: string;
  modele_version: string;
  produits: Record<"e10" | "e98" | "b7", { nom: string; horizons: Record<"1" | "2" | "3", FiabiliteHorizon>; indicateur: FiabiliteIndicateur }>;
  direct: { evaluees: number; suffisant: boolean; scenario_juste_pct?: number; brier?: number; brier_naif?: number };
};

export async function chargerFiabilite(): Promise<{ ok: true; fiabilite: Fiabilite } | { ok: false; erreur: string }> {
  try {
    return { ok: true, fiabilite: JSON.parse(await lireFichierMoteur("sorties/fiabilite.json")) as Fiabilite };
  } catch {
    return { ok: false, erreur: "évaluation non disponible" };
  }
}
