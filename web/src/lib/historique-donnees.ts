import { lireFichierMoteur } from "@/lib/fichiers-moteur";
import {
  changements, DEBUT_STATS, exclureAberrations, parJourDeSemaine, parMois, parSemaine, type HistoriqueProduit, type PointPrix,
} from "@/lib/historique";
import { PRODUITS, type CodeProduit } from "@/lib/produits";

// Historique complet des prix maximums (moteur/depot/prix_officiels.csv, depuis 2015), résumé à la construction du site.

const MOIS = 24;

const reculer = (iso: string, ans: number) => `${Number(iso.slice(0, 4)) - ans}${iso.slice(4)}`;

export async function chargerHistorique(): Promise<Partial<Record<CodeProduit, HistoriqueProduit>>> {
  let texte: string;
  try {
    texte = await lireFichierMoteur("depot/prix_officiels.csv");
  } catch {
    return {};
  }
  const [entete, ...lignes] = texte.trim().split("\n");
  const col = Object.fromEntries(entete.split(",").map((c, i) => [c, i]));
  const brut: Record<string, PointPrix[]> = {};
  for (const l of lignes) {
    const c = l.split(",");
    const prix = Number(c[col.prix_tvac]);
    if (Number.isFinite(prix)) (brut[c[col.produit]] ??= []).push({ date: c[col.date_application], prix });
  }

  const resultat: Partial<Record<CodeProduit, HistoriqueProduit>> = {};
  for (const { code } of PRODUITS) {
    const tri = (brut[code] ?? []).sort((a, b) => a.date.localeCompare(b.date));
    if (tri.length < 2) continue;
    const { points, exclus } = exclureAberrations(tri);
    const dernier = points.at(-1)!.date;
    const ch = changements(points, DEBUT_STATS);
    resultat[code] = {
      premierJour: points[0].date,
      dernierJour: dernier,
      unAn: points.filter((p) => p.date >= reculer(dernier, 1)),
      cinqAns: parSemaine(points.filter((p) => p.date >= reculer(dernier, 5))),
      dixAns: parSemaine(points.filter((p) => p.date >= reculer(dernier, 10))),
      jours: parJourDeSemaine(ch),
      mois: parMois(ch, dernier, MOIS),
      exceptions: ch.filter((x) => [0, 6].includes((new Date(`${x.date}T12:00:00Z`).getUTCDay() + 6) % 7)),
      exclus,
    };
  }
  return resultat;
}
