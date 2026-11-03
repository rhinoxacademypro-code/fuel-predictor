"use client";

import { useSyncExternalStore } from "react";
import type { Releve } from "@/lib/stations";

// Relevés de prix et stations favorites, gardés dans Safari sur l'appareil (rien n'est envoyé en ligne).
// Même mécanisme que les préférences (reglages.ts) : localStorage + événement pour mettre à jour l'écran.

function stockage<T>(cle: string, defaut: T) {
  const evenement = `${cle}-modifie`;
  let dernierBrut: string | null | undefined;
  let derniereValeur = defaut;

  const lire = (): T => {
    let brut: string | null = null;
    try {
      brut = window.localStorage.getItem(cle);
    } catch {
      // stockage indisponible (navigation privée)
    }
    if (brut !== dernierBrut) {
      dernierBrut = brut;
      try {
        derniereValeur = brut ? (JSON.parse(brut) as T) : defaut;
      } catch {
        derniereValeur = defaut;
      }
    }
    return derniereValeur;
  };
  const abonner = (rappel: () => void) => {
    window.addEventListener("storage", rappel);
    window.addEventListener(evenement, rappel);
    return () => {
      window.removeEventListener("storage", rappel);
      window.removeEventListener(evenement, rappel);
    };
  };
  const ecrire = (valeur: T): boolean => {
    try {
      window.localStorage.setItem(cle, JSON.stringify(valeur));
      window.dispatchEvent(new Event(evenement));
      return true;
    } catch {
      return false;
    }
  };
  return function useStockage(): [T, (modif: (actuel: T) => T) => boolean] {
    const valeur = useSyncExternalStore(abonner, lire, () => defaut);
    return [valeur, (modif) => ecrire(modif(lire()))];
  };
}

const AUCUN_RELEVE: Releve[] = [];
const AUCUN_FAVORI: string[] = [];

export const useReleves = stockage<Releve[]>("fuel-releves", AUCUN_RELEVE);
export const useFavoris = stockage<string[]>("fuel-favoris", AUCUN_FAVORI);

// Dernier lieu recherché (position ou commune), pour rouvrir l'onglet au même endroit
export type Centre = { la: number; lo: number; nom: string };
export const useDernierCentre = stockage<Centre | null>("fuel-stations-centre", null);
