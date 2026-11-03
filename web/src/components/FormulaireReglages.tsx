"use client";

import { SelecteurCarburant } from "@/components/Accueil";
import { usePreferences, type Preferences } from "@/lib/reglages";

type ChampNum = { cle: "reservoir" | "quantite" | "seuilEuros"; label: string; unite: string; min: number; max: number; pas: number; aide: string };

const CHAMPS: ChampNum[] = [
  { cle: "reservoir", label: "Capacité du réservoir", unite: "L", min: 20, max: 150, pas: 1, aide: "Sert au calculateur d'économies (phase 4)." },
  { cle: "quantite", label: "Quantité achetée à chaque plein", unite: "L", min: 5, max: 150, pas: 1, aide: "Sert à chiffrer l'enjeu de l'indicateur." },
  { cle: "seuilEuros", label: "Gain minimal pour recommander d'agir", unite: "€", min: 0.5, max: 10, pas: 0.5, aide: "En dessous, l'indicateur affiche « pas de différence significative »." },
];

export function FormulaireReglages() {
  const [prefs, modifier] = usePreferences();
  const changer = (cle: keyof Preferences, brut: string, c: ChampNum) => {
    const v = Number(brut.replace(",", "."));
    if (Number.isFinite(v)) modifier({ [cle]: Math.min(c.max, Math.max(c.min, v)) });
  };
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Carburant utilisé</p>
        <SelecteurCarburant />
      </div>
      {CHAMPS.map((c) => (
        <label key={c.cle} className="block space-y-1.5">
          <span className="text-sm font-medium">{c.label}</span>
          <span className="flex items-center gap-2">
            <input
              type="number" inputMode="decimal" min={c.min} max={c.max} step={c.pas}
              key={prefs[c.cle]} defaultValue={prefs[c.cle]}
              onBlur={(e) => changer(c.cle, e.target.value, c)}
              className="chiffres w-28 rounded-lg border border-border bg-surface px-3 py-2 text-base text-text"
            />
            <span className="text-sm text-muted">{c.unite}</span>
          </span>
          <span className="block text-xs text-faint">{c.aide}</span>
        </label>
      ))}
      <p className="text-xs leading-relaxed text-faint">
        Réglages enregistrés sur cet appareil uniquement. À venir : consommation et kilométrage (phase 4), localisation et rayon de recherche
        (phase 3), heure du brief et seuil des notifications (phase 2).
      </p>
    </div>
  );
}
