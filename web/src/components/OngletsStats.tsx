"use client";

import { useState, type ReactNode } from "react";

// Deux vues dans l'onglet Stats ; le contenu de chacune est rendu à la construction du site
export function OngletsStats({ fiabilite, historique }: { fiabilite: ReactNode; historique: ReactNode }) {
  const [vue, setVue] = useState<"fiabilite" | "historique">("historique");
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Statistiques" className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
        {([["historique", "Historique"], ["fiabilite", "Fiabilité"]] as const).map(([cle, label]) => (
          <button key={cle} role="tab" aria-selected={vue === cle} onClick={() => setVue(cle)}
            className={`rounded-lg px-2 py-2 text-xs font-medium ${vue === cle ? "bg-surface-2 text-text" : "text-faint"}`}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{vue === "fiabilite" ? fiabilite : historique}</div>
    </div>
  );
}
