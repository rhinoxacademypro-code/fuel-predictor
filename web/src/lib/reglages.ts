"use client";

import { useSyncExternalStore } from "react";
import { REGLAGES_DEFAUT } from "@/lib/decision";
import type { CodeProduit } from "@/lib/produits";

// Préférences personnelles, gardées sur l'appareil (rien n'est envoyé en ligne).
export type Preferences = {
  carburant: CodeProduit;
  reservoir: number; // L
  quantite: number; // L achetés à chaque plein
  seuilEuros: number; // gain minimal pour recommander d'agir
};

export const PREFERENCES_DEFAUT: Preferences = { carburant: "b7", reservoir: 60, quantite: REGLAGES_DEFAUT.quantite, seuilEuros: REGLAGES_DEFAUT.seuilEuros };

const CLE = "fuel-preferences";
const EVENEMENT = "fuel-preferences-modifiees";

function lireBrut(): string | null {
  try {
    return window.localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

function abonner(rappel: () => void) {
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT, rappel);
  };
}

function analyser(brut: string | null): Preferences {
  if (!brut) return PREFERENCES_DEFAUT;
  try {
    return { ...PREFERENCES_DEFAUT, ...JSON.parse(brut) };
  } catch {
    return PREFERENCES_DEFAUT;
  }
}

let dernierBrut: string | null | undefined;
let dernieresPrefs: Preferences = PREFERENCES_DEFAUT;

function instantane(): Preferences {
  const brut = lireBrut();
  if (brut !== dernierBrut) {
    dernierBrut = brut;
    dernieresPrefs = analyser(brut);
  }
  return dernieresPrefs;
}

export function usePreferences(): [Preferences, (modif: Partial<Preferences>) => void] {
  const prefs = useSyncExternalStore(abonner, instantane, () => PREFERENCES_DEFAUT);
  const modifier = (modif: Partial<Preferences>) => {
    try {
      window.localStorage.setItem(CLE, JSON.stringify({ ...instantane(), ...modif }));
    } catch {
      // stockage indisponible (navigation privée) : la préférence ne sera pas retenue
    }
    window.dispatchEvent(new Event(EVENEMENT));
  };
  return [prefs, modifier];
}

const sansAbonnement = () => () => {};

/** Date du jour à Bruxelles (AAAA-MM-JJ), connue seulement côté navigateur. */
export function useAujourdhui(): string | null {
  return useSyncExternalStore(
    sansAbonnement,
    () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()),
    () => null,
  );
}
