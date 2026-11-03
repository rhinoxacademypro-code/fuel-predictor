import { lireFichierMoteur } from "@/lib/fichiers-moteur";
import { PRODUITS, type CodeProduit, type PointPrix, type PrixOfficiels } from "@/lib/produits";

// Prix maximums officiels collectés par le moteur (moteur/depot/prix_officiels.csv) : be.STAT pour les
// derniers mois, historique Brafco avant. Seuls les 120 derniers jours servent à l'affichage.
const JOURS_AFFICHES = 120;
const SOURCES = {
  bestat: "SPF Économie, via Statbel (be.STAT)",
  brafco: "SPF Économie, via la base de données Brafco",
} as Record<string, string>;

export async function chargerPrixOfficiels(): Promise<PrixOfficiels> {
  try {
    const [entete, ...lignes] = (await lireFichierMoteur("depot/prix_officiels.csv")).trim().split("\n");
    const col = Object.fromEntries(entete.split(",").map((c, i) => [c, i]));
    const series = { e10: [], e98: [], b7: [] } as Record<CodeProduit, PointPrix[]>;
    let recupereLe = "";
    for (const ligne of lignes) {
      // aucune virgule dans les champs lus ici (l'explication des prévisions n'est pas dans ce fichier)
      const champs = ligne.split(",");
      const code = champs[col.produit] as CodeProduit;
      const prix = Number(champs[col.prix_tvac]);
      if (!(code in series) || !Number.isFinite(prix)) continue;
      series[code].push({ date: champs[col.date_application], prix });
      if (champs[col.recupere_le] > recupereLe) recupereLe = champs[col.recupere_le];
    }
    const limite = new Date(Date.now() - JOURS_AFFICHES * 86_400_000).toISOString().slice(0, 10);
    for (const { code } of PRODUITS) {
      series[code] = series[code].sort((a, b) => a.date.localeCompare(b.date)).filter((p) => p.date >= limite);
      if (series[code].length === 0) throw new Error(`aucun prix récent pour ${code}`);
    }
    // source de la ligne la plus récente du diesel
    const derniere = lignes.filter((l) => l.startsWith("b7,")).sort().at(-1)?.split(",") ?? [];
    return {
      ok: true,
      series,
      recupereLe,
      source: SOURCES[derniere[col.source_id]] ?? "SPF Économie",
      sourceUrl: "https://economie.fgov.be/fr/themes/energie/prix-de-lenergie/prix-maximum-des-produits/tarif-officiel-des-produits",
    };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : "erreur inconnue" };
  }
}
