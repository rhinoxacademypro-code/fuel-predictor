import { lireFichierMoteur } from "@/lib/fichiers-moteur";
import type { CodeProduit } from "@/lib/produits";

// Séries de l'onglet Marchés, lues dans les fichiers du moteur à la construction du site (365 derniers jours).

export type Point = { date: string; valeur: number };

export type Serie = {
  code: "e10" | "e98" | "b7" | "brent" | "ho" | "rbob" | "eurusd";
  nom: string;
  unite: string;
  decimales: number;
  source: string;
  points: Point[];
};

export type LienMarche = {
  cotation: "ho" | "rbob";
  periode: [string, string];
  decalage_jours: number;
  decalages_lies: number[];
  transmission_7j: { part_pct: number; correlation: number };
  transmission_30j: { part_pct: number; correlation: number };
};

const JOURS = 365;

async function lireCsv(chemin: string): Promise<Record<string, string>[]> {
  const [entete, ...lignes] = (await lireFichierMoteur(chemin)).trim().split("\n");
  const cols = entete.split(",");
  // champs sans virgule dans ces fichiers (pas de texte libre)
  return lignes.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
}

const COTATIONS = [
  { code: "brent", nom: "Brent (baril)", unite: "$", decimales: 2 },
  { code: "ho", nom: "Gasoil New York", unite: "$/gal", decimales: 3 },
  { code: "rbob", nom: "Essence New York", unite: "$/gal", decimales: 3 },
] as const;

const PRIX = [
  { code: "e10", nom: "Essence 95 E10" },
  { code: "e98", nom: "Essence 98 E5" },
  { code: "b7", nom: "Diesel B7" },
] as const;

export async function chargerMarches(): Promise<{ series: Serie[]; lien: Partial<Record<CodeProduit, LienMarche>> }> {
  const limite = new Date(Date.now() - JOURS * 86_400_000).toISOString().slice(0, 10);
  const recents = (pts: Point[]) => pts.filter((p) => p.date >= limite && Number.isFinite(p.valeur)).sort((a, b) => a.date.localeCompare(b.date));
  const series: Serie[] = [];

  try {
    const prix = await lireCsv("depot/prix_officiels.csv");
    for (const p of PRIX)
      series.push({
        ...p, unite: "€/L", decimales: 3, source: "SPF Économie (be.STAT), prix maximum TVAC",
        points: recents(prix.filter((r) => r.produit === p.code).map((r) => ({ date: r.date_application, valeur: Number(r.prix_tvac) }))),
      });
  } catch {
    // prix indisponibles : la carte correspondante n'est pas affichée
  }
  try {
    const cot = await lireCsv("depot/cotations.csv");
    for (const c of COTATIONS)
      series.push({
        ...c, source: "Yahoo Finance (contrats à terme, source non officielle), clôtures quotidiennes",
        points: recents(cot.filter((r) => r.serie === c.code).map((r) => ({ date: r.date_seance, valeur: Number(r.valeur) }))),
      });
  } catch {
    // idem
  }
  try {
    const fx = await lireCsv("depot/taux_change.csv");
    series.push({
      code: "eurusd", nom: "Euro en dollars", unite: "$", decimales: 4, source: "Banque centrale européenne, taux de référence",
      points: recents(fx.filter((r) => r.paire === "EUR/USD").map((r) => ({ date: r.date_cotation, valeur: Number(r.valeur) }))),
    });
  } catch {
    // idem
  }

  let lien = {};
  try {
    lien = JSON.parse(await lireFichierMoteur("sorties/fiabilite.json")).lien_marche ?? {};
  } catch {
    // mesure pas encore calculée
  }
  return { series: series.filter((s) => s.points.length > 1), lien };
}
