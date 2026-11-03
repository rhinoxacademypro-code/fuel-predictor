"use client";

import { useSyncExternalStore } from "react";
import { PRODUITS, type PointPrix, type PrixOfficiels } from "@/lib/produits";

const FUSEAU = "Europe/Brussels";

const sansAbonnement = () => () => {};

// Date du jour à Bruxelles, au format AAAA-MM-JJ
function aujourdhuiBruxelles(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(new Date());
}

function dateCourte(iso: string) {
  return new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

function horodatage(iso: string) {
  return new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: FUSEAU }).format(
    new Date(iso),
  );
}

// Heure courante arrondie à l'heure (valeur stable entre deux rendus)
const heureCourante = () => Math.floor(Date.now() / 3_600_000);

// Au-delà, la tâche quotidienne n'a probablement pas tourné : le prix « du jour » peut être dépassé
const HEURES_AVANT_ALERTE = 36;

const euros = (n: number) => n.toLocaleString("fr-BE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

type Etat = { prix: number; depuis: string; variation: number | null };

// Prix en vigueur le jour donné, date d'entrée en vigueur et variation par rapport au prix précédent
function etatDuJour(serie: PointPrix[], jour: string): Etat | null {
  const passe = serie.filter((p) => p.date <= jour);
  if (passe.length === 0) return null;
  const actuel = passe[passe.length - 1].prix;
  let i = passe.length - 1;
  while (i > 0 && Math.abs(passe[i - 1].prix - actuel) < 1e-9) i--;
  return { prix: actuel, depuis: passe[i].date, variation: i > 0 ? actuel - passe[i - 1].prix : null };
}

export function PrixActuels({ donnees }: { donnees: PrixOfficiels }) {
  // La date du jour n'est connue qu'au navigateur : la page pré-rendue ne doit pas figer une date
  const jour = useSyncExternalStore(sansAbonnement, aujourdhuiBruxelles, () => null);
  const heure = useSyncExternalStore(sansAbonnement, heureCourante, () => null);

  if (!donnees.ok) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Prix officiels indisponibles pour le moment ({donnees.erreur}). Aucune valeur n&apos;est affichée plutôt qu&apos;une valeur
        inventée.
      </p>
    );
  }

  const ancien = heure !== null && heure - new Date(donnees.recupereLe).getTime() / 3_600_000 > HEURES_AVANT_ALERTE;

  return (
    <div className="space-y-3">
      {ancien && (
        <p className="rounded-2xl border border-attente/40 bg-surface p-4 text-sm text-attente">
          Données non mises à jour depuis le {horodatage(donnees.recupereLe)}. Le prix affiché peut ne plus être celui d&apos;aujourd&apos;hui.
        </p>
      )}
      <ul className="grid gap-3">
        {PRODUITS.map((p) => {
          const etat = jour ? etatDuJour(donnees.series[p.code], jour) : null;
          const v = etat?.variation ?? null;
          const couleur = v === null || Math.abs(v) < 1e-9 ? "text-neutre" : v > 0 ? "text-hausse" : "text-baisse";
          return (
            <li key={p.code} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm text-muted">{p.nom}</h3>
                {v !== null && (
                  <span className={`chiffres text-sm font-medium ${couleur}`}>
                    {v > 0 ? "▲ +" : v < 0 ? "▼ −" : ""}
                    {euros(Math.abs(v))} €
                  </span>
                )}
              </div>
              <p className="chiffres mt-1 text-3xl font-semibold tracking-tight">
                {etat ? euros(etat.prix) : <span className="inline-block h-8 w-28 animate-pulse rounded bg-surface-2" />}
                <span className="ml-1 text-base font-normal text-muted">€/L</span>
              </p>
              <p className="mt-1 text-xs text-faint">{etat ? `En vigueur depuis le ${dateCourte(etat.depuis)}` : " "}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed text-faint">
        Prix maximums légaux TVAC, statut <span className="text-muted">réel</span>. Les stations peuvent vendre moins cher. Source :{" "}
        <a href={donnees.sourceUrl} className="underline decoration-border underline-offset-2">
          {donnees.source}
        </a>
        , récupéré le {horodatage(donnees.recupereLe)}.
      </p>
    </div>
  );
}
