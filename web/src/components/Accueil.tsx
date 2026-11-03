"use client";

import Link from "next/link";
import { decider, type Prevision } from "@/lib/decision";
import { horodatage } from "@/lib/format";
import { PRODUITS } from "@/lib/produits";
import { useAujourdhui, usePreferences } from "@/lib/reglages";
import { LignePrevision } from "./LignePrevision";

const STYLE = {
  vert: "border-baisse/50 bg-baisse/10 text-baisse",
  orange: "border-attente/50 bg-attente/10 text-attente",
  gris: "border-border bg-surface text-neutre",
};

export function SelecteurCarburant() {
  const [prefs, modifier] = usePreferences();
  return (
    <div role="radiogroup" aria-label="Carburant" className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
      {PRODUITS.map((p) => (
        <button key={p.code} role="radio" aria-checked={prefs.carburant === p.code} onClick={() => modifier({ carburant: p.code })}
          className={`rounded-lg px-2 py-2 text-xs font-medium ${prefs.carburant === p.code ? "bg-surface-2 text-text" : "text-faint"}`}>
          {p.nom.replace("Essence ", "")}
        </button>
      ))}
    </div>
  );
}

// `jourDecision` : date à laquelle juger les prévisions (par défaut aujourd'hui ; le brief utilise sa propre date)
export function Indicateur({ previsions, erreur, jourDecision }: { previsions: Prevision[]; erreur?: string; jourDecision?: string }) {
  const [prefs] = usePreferences();
  const aujourdhui = useAujourdhui();
  const jour = jourDecision ?? aujourdhui;
  if (!jour) return <div className="h-36 animate-pulse rounded-2xl bg-surface" />;
  const miennes = previsions.filter((p) => p.produit === prefs.carburant);
  const v = decider(miennes, jour, { quantite: prefs.quantite, seuilEuros: prefs.seuilEuros, seuilProba: 0.6 });
  const nom = PRODUITS.find((p) => p.code === prefs.carburant)?.nom;
  return (
    <section aria-label="Faire le plein ou attendre" className={`rounded-2xl border p-4 ${STYLE[v.couleur]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-80">{nom} · {prefs.quantite} L</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{v.titre}</p>
      <ul className="mt-2 space-y-1 text-sm leading-relaxed text-text/80">
        {(erreur ? [`Prévisions indisponibles (${erreur}).`] : v.raisons).map((r) => <li key={r}>{r}</li>)}
      </ul>
    </section>
  );
}

export function PrevisionsMonCarburant({ previsions }: { previsions: Prevision[] }) {
  const [prefs] = usePreferences();
  const miennes = previsions.filter((p) => p.produit === prefs.carburant).sort((a, b) => a.horizon - b.horizon);
  if (miennes.length === 0)
    return <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Aucune prévision disponible pour le moment.</p>;
  return (
    <div className="rounded-2xl border border-border bg-surface px-4">
      <ul className="divide-y divide-border">
        {miennes.map((p) => <LignePrevision key={p.horizon} p={p} />)}
      </ul>
      <p className="border-t border-border py-3 text-xs leading-relaxed text-faint">
        Prévisions, pas des prix officiels. Émises le {horodatage(miennes[0].emise_le)}.{" "}
        <Link href="/previsions" className="underline decoration-border underline-offset-2">Détails et explications</Link>
      </p>
    </div>
  );
}
