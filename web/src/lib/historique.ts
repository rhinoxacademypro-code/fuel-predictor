// Statistiques sur l'historique des prix maximums officiels (fonctions pures, testées par historique.test.ts).

export type PointPrix = { date: string; prix: number }; // AAAA-MM-JJ, €/L, une ligne par jour

export type Exclusion = { debut: string; fin: string; prix: number };

const SEUIL_ABERRANT = 0.4; // €/L en un jour : jamais observé dans les données officielles (record réel : 0,31)
const TOLERANCE = 0.0005;

/** Retire les pics isolés manifestement faux (saut de plus de 40 c/L annulé dans les 7 jours). */
export function exclureAberrations(points: PointPrix[]): { points: PointPrix[]; exclus: Exclusion[] } {
  const exclus: Exclusion[] = [];
  const retires = new Set<number>();
  for (let i = 1; i < points.length; i++) {
    const saut = points[i].prix - points[i - 1].prix;
    if (Math.abs(saut) < SEUIL_ABERRANT) continue;
    for (let j = i + 1; j < points.length && j <= i + 7; j++) {
      const retour = points[j].prix - points[j - 1].prix;
      if (retour * saut < 0 && Math.abs(retour) >= 0.8 * Math.abs(saut)) {
        for (let k = i; k < j; k++) retires.add(k);
        exclus.push({ debut: points[i].date, fin: points[j - 1].date, prix: points[i].prix });
        break;
      }
    }
  }
  return { points: points.filter((_, i) => !retires.has(i)), exclus };
}

export type Changement = { date: string; variation: number };

export function changements(points: PointPrix[], depuis: string): Changement[] {
  const r: Changement[] = [];
  for (let i = 1; i < points.length; i++) {
    const v = points[i].prix - points[i - 1].prix;
    if (points[i].date >= depuis && Math.abs(v) > TOLERANCE) r.push({ date: points[i].date, variation: v });
  }
  return r;
}

const jourSemaine = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lundi

export type StatJour = { jour: number; hausses: number; baisses: number; variationMoyenne: number | null };

/** Hausses et baisses selon le jour où le nouveau prix entre en vigueur (0 = lundi … 6 = dimanche). */
export function parJourDeSemaine(ch: Changement[]): StatJour[] {
  return Array.from({ length: 7 }, (_, jour) => {
    const c = ch.filter((x) => jourSemaine(x.date) === jour);
    return {
      jour,
      hausses: c.filter((x) => x.variation > 0).length,
      baisses: c.filter((x) => x.variation < 0).length,
      variationMoyenne: c.length ? c.reduce((s, x) => s + x.variation, 0) / c.length : null,
    };
  });
}

export type StatMois = { mois: string; hausses: number; baisses: number; variationNette: number };

/** Les `n` derniers mois (y compris le mois en cours), même sans changement. */
export function parMois(ch: Changement[], dernierJour: string, n: number): StatMois[] {
  const [a, m] = dernierJour.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    const mois = d.toISOString().slice(0, 7);
    const c = ch.filter((x) => x.date.startsWith(mois));
    return {
      mois,
      hausses: c.filter((x) => x.variation > 0).length,
      baisses: c.filter((x) => x.variation < 0).length,
      variationNette: c.reduce((s, x) => s + x.variation, 0),
    };
  });
}

/** Une valeur par semaine (la dernière connue de chaque semaine), pour les graphiques sur plusieurs années. */
export function parSemaine(points: PointPrix[]): PointPrix[] {
  const r: PointPrix[] = [];
  let semaine = "";
  for (const p of points) {
    const lundi = new Date(`${p.date}T12:00:00Z`);
    lundi.setUTCDate(lundi.getUTCDate() - jourSemaine(p.date));
    const cle = lundi.toISOString().slice(0, 10);
    if (cle === semaine) r[r.length - 1] = p;
    else r.push(p);
    semaine = cle;
  }
  return r;
}

// Résumé d'un carburant, préparé à la construction du site (historique-donnees.ts) et affiché par l'onglet Stats
export const DEBUT_STATS = "2019-01-01";

export type HistoriqueProduit = {
  premierJour: string;
  dernierJour: string;
  unAn: PointPrix[]; // quotidien
  cinqAns: PointPrix[]; // hebdomadaire
  dixAns: PointPrix[]; // hebdomadaire
  jours: StatJour[];
  mois: StatMois[];
  exceptions: Changement[]; // changements un lundi ou un dimanche
  exclus: Exclusion[];
};
