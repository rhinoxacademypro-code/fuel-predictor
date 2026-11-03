// Types et constantes partagés entre serveur et navigateur

export type CodeProduit = "e10" | "e98" | "b7";

export const PRODUITS: { code: CodeProduit; nom: string }[] = [
  { code: "e10", nom: "Essence 95 E10" },
  { code: "e98", nom: "Essence 98 E5" },
  { code: "b7", nom: "Diesel B7" },
];

export type PointPrix = { date: string; prix: number }; // date AAAA-MM-JJ, prix TVAC en €/L

export type PrixOfficiels =
  | { ok: true; series: Record<CodeProduit, PointPrix[]>; recupereLe: string; source: string; sourceUrl: string }
  | { ok: false; erreur: string };
