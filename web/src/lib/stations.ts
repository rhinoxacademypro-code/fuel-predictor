import type { CodeProduit } from "@/lib/produits";

// Stations d'OpenStreetMap (fichier écrit par `python -m moteur stations`) et relevés de prix personnels.
// Fonctions pures, sans navigateur : testées par node --test (stations.test.ts).

export type Station = {
  id: string;
  la: number;
  lo: number;
  m?: string; // enseigne
  n?: string; // nom
  a?: string; // adresse
  h?: string; // horaires (format OpenStreetMap)
  f?: Partial<Record<CodeProduit, 0 | 1>>; // carburant vendu (1), pas vendu (0), absent = non renseigné
};

export type FichierStations = { genere_le: string; base_osm: string; source: string; nombre: number; stations: Station[] };

export type Position = { la: number; lo: number };

export type Releve = { station: string; carburant: CodeProduit; prix: number; le: string };

export const JOURS_RELEVE_RECENT = 7;

export function distanceKm(a: Position, b: Position): number {
  const rad = Math.PI / 180;
  const dLa = (b.la - a.la) * rad;
  const dLo = (b.lo - a.lo) * rad;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.la * rad) * Math.cos(b.la * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function autour(stations: Station[], centre: Position, rayonKm: number): { station: Station; km: number }[] {
  return stations
    .map((station) => ({ station, km: distanceKm(centre, station) }))
    .filter((s) => s.km <= rayonKm)
    .sort((a, b) => a.km - b.km);
}

export const nomStation = (s: Station) => s.n || s.m || "Station sans nom";

export const estRecent = (r: Releve, maintenant: Date) =>
  maintenant.getTime() - new Date(r.le).getTime() <= JOURS_RELEVE_RECENT * 86_400_000;

/** Relevés d'une station pour un carburant, du plus récent au plus ancien. */
export function historique(releves: Releve[], station: string, carburant: CodeProduit): Releve[] {
  return releves.filter((r) => r.station === station && r.carburant === carburant).sort((a, b) => b.le.localeCompare(a.le));
}

/** Relevé récent le moins cher parmi les stations données (dernier relevé de chaque station seulement). */
export function moinsCher(releves: Releve[], stations: string[], carburant: CodeProduit, maintenant: Date): Releve | null {
  let meilleur: Releve | null = null;
  for (const id of stations) {
    const dernier = historique(releves, id, carburant)[0];
    if (dernier && estRecent(dernier, maintenant) && (!meilleur || dernier.prix < meilleur.prix)) meilleur = dernier;
  }
  return meilleur;
}

/** Contrôle d'un prix saisi (en €/L) : refus si invraisemblable, avertissement s'il dépasse le maximum légal. */
export function verifierPrix(prix: number, plafond: number | null): { ok: boolean; message: string } {
  if (!Number.isFinite(prix) || prix < 0.8 || prix > 4) return { ok: false, message: "Prix invraisemblable : entre 0,800 et 4,000 €/L." };
  if (plafond !== null && prix > plafond + 0.0005)
    return { ok: true, message: "Au-dessus du prix maximum légal du jour : vérifie le chiffre (ou signale-le au SPF Économie)." };
  return { ok: true, message: "" };
}

/** « 1,859 » ou « 1.859 » -> 1.859 */
export const lirePrix = (saisie: string) => Number(saisie.trim().replace(",", "."));
