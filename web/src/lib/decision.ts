// Indicateur « faire le plein ou attendre ».
// Règles issues de l'étude de faisabilité : le gain du bon moment est faible (environ 1 à 2 € par plein
// quand le modèle a raison), donc on ne recommande d'agir que si le scénario est probable ET si le gain
// attendu dépasse un seuil. Sinon : pas de différence significative. Jamais de verdict catégorique
// avec des données périmées ou absentes.

export type Prevision = {
  produit: "e10" | "e98" | "b7";
  horizon: 1 | 2 | 3;
  date_cible: string;
  prix_reference: number;
  certain: boolean;
  statut: "reel" | "previsionnel";
  p_baisse: number;
  p_stable: number;
  p_hausse: number;
  scenario: -1 | 0 | 1;
  variation_estimee: number;
  amplitude: number;
  intervalle_bas: number;
  intervalle_haut: number;
  confiance: number;
  explication: string;
  emise_le: string;
  modele_version: string;
};

export type Reglages = { quantite: number; seuilEuros: number; seuilProba: number };
export const REGLAGES_DEFAUT: Reglages = { quantite: 50, seuilEuros: 1, seuilProba: 0.6 };

export type Verdict = {
  couleur: "vert" | "orange" | "gris";
  titre: "FAIRE LE PLEIN MAINTENANT" | "ATTENDRE 24 À 48 HEURES" | "PAS DE DIFFÉRENCE SIGNIFICATIVE";
  raisons: string[];
  enjeuEuros: number | null; // gain (attendre) ou perte évitée (plein maintenant) attendu, sur la quantité choisie
};

const euros = (n: number) => `${n.toFixed(2).replace(".", ",")}\u00a0€`;
const cents = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")} c/L`;
const pct = (n: number) => `${Math.round(n * 100)}\u00a0%`;

export function decider(previsions: Prevision[], aujourdhui: string, r: Reglages = REGLAGES_DEFAUT): Verdict {
  const gris = (raisons: string[]): Verdict => ({ couleur: "gris", titre: "PAS DE DIFFÉRENCE SIGNIFICATIVE", raisons, enjeuEuros: null });
  // horizon 24 à 48 h : J+1 et J+2
  const fenetre = previsions.filter((p) => p.horizon <= 2).sort((a, b) => a.horizon - b.horizon);
  if (fenetre.length < 2) return gris(["Prévisions indisponibles : aucune recommandation possible."]);
  const emission = fenetre[0].emise_le.slice(0, 10);
  const veille = new Date(new Date(`${aujourdhui}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  if (emission < veille) return gris([`Prévisions trop anciennes (émises le ${emission}) : aucune recommandation.`]);

  // 1. Changement officiel déjà publié : certitude
  const officiel = fenetre.find((p) => p.statut === "reel" && p.scenario !== 0);
  if (officiel) {
    const enjeu = Math.abs(officiel.variation_estimee) * r.quantite;
    const quand = officiel.horizon === 1 ? "demain" : "après-demain";
    if (officiel.scenario > 0)
      return { couleur: "vert", titre: "FAIRE LE PLEIN MAINTENANT", enjeuEuros: enjeu,
        raisons: [`Hausse officielle publiée par le SPF pour ${quand} : +${cents(officiel.variation_estimee)}.`,
          `Faire le plein avant évite ${euros(enjeu)} sur ${r.quantite} L.`] };
    return { couleur: "orange", titre: "ATTENDRE 24 À 48 HEURES", enjeuEuros: enjeu,
      raisons: [`Baisse officielle publiée par le SPF pour ${quand} : −${cents(Math.abs(officiel.variation_estimee))}.`,
        `Attendre fait économiser ${euros(enjeu)} sur ${r.quantite} L.`] };
  }

  // 2. Prix figé par le calendrier : aucune différence possible
  if (fenetre.every((p) => p.certain)) return gris(["Aucun calcul du SPF avant 48 heures : le prix maximum ne peut pas changer."]);

  // 3. Prévision : on retient l'horizon où le scénario est le plus marqué
  const incertaines = fenetre.filter((p) => !p.certain);
  const hausse = incertaines.reduce((a, b) => (b.p_hausse > a.p_hausse ? b : a));
  const baisse = incertaines.reduce((a, b) => (b.p_baisse > a.p_baisse ? b : a));
  const gainAttente = baisse.p_baisse * baisse.amplitude * r.quantite;
  const perteAttente = hausse.p_hausse * hausse.amplitude * r.quantite;
  const avertJ1 = (p: Prevision) =>
    p.horizon === 1 ? ["Prévision à J+1 : la moins fiable des trois horizons (cotations de Rotterdam non disponibles gratuitement)."] : [];

  if (hausse.p_hausse >= r.seuilProba && perteAttente >= r.seuilEuros && hausse.p_hausse > baisse.p_baisse)
    return { couleur: "vert", titre: "FAIRE LE PLEIN MAINTENANT", enjeuEuros: perteAttente,
      raisons: [`Hausse probable à J+${hausse.horizon} (${pct(hausse.p_hausse)}), d'environ ${cents(hausse.amplitude)}.`,
        `Coût moyen attendu d'une attente : ${euros(perteAttente)} sur ${r.quantite} L.`, ...avertJ1(hausse)] };
  if (baisse.p_baisse >= r.seuilProba && gainAttente >= r.seuilEuros)
    return { couleur: "orange", titre: "ATTENDRE 24 À 48 HEURES", enjeuEuros: gainAttente,
      raisons: [`Baisse probable à J+${baisse.horizon} (${pct(baisse.p_baisse)}), d'environ ${cents(baisse.amplitude)}.`,
        `Gain moyen attendu en attendant : ${euros(gainAttente)} sur ${r.quantite} L.`, ...avertJ1(baisse)] };

  // Gris : on dit quel critère manque (probabilité, enjeu, ou signaux contradictoires)
  const risque = Math.max(hausse.p_hausse, baisse.p_baisse);
  const enjeu = Math.max(gainAttente, perteAttente);
  if (risque < r.seuilProba)
    return gris([
      `Aucun mouvement assez probable dans les 48 heures (risque de changement le plus élevé : ${pct(risque)}, sous ton seuil de ${pct(r.seuilProba)}).`,
      `Enjeu moyen : ${euros(enjeu)} sur ${r.quantite} L.`,
    ]);
  if (hausse.p_hausse >= r.seuilProba && baisse.p_baisse >= r.seuilProba)
    return gris([
      `Signaux contradictoires : hausse probable à J+${hausse.horizon} (${pct(hausse.p_hausse)}), baisse probable à J+${baisse.horizon} (${pct(baisse.p_baisse)}).`,
    ]);
  return gris([
    `Changement probable (${pct(risque)}), mais l'enjeu moyen reste faible : ${euros(enjeu)} sur ${r.quantite} L, sous ton seuil de ${euros(r.seuilEuros)}.`,
  ]);
}
