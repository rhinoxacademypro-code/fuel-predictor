"use client";

import type { Actualite, Brief, Cotation } from "@/lib/brief";
import { eurosLitre, horodatage, jourCourt } from "@/lib/format";
import { useAujourdhui, usePreferences } from "@/lib/reglages";
import { Indicateur, PrevisionsMonCarburant } from "./Accueil";

const heure = (iso: string) =>
  new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }).format(new Date(iso));

const nombre = (n: number, decimales: number) =>
  n.toLocaleString("fr-BE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

function valeurCotation(c: Cotation) {
  if (c.serie === "eurusd") return `${nombre(c.valeur, 4)} $`;
  if (c.unite === "USD/gal") return `${nombre(c.valeur, 3)} $/gal`;
  return `${nombre(c.valeur, 2)} $`;
}

// Hausse du pétrole = mauvaise nouvelle à la pompe (rouge) ; hausse de l'euro = bonne nouvelle (vert)
function couleurVariation(c: Cotation) {
  if (Math.abs(c.variation_pct) < 0.05) return "text-neutre";
  const favorable = c.serie === "eurusd" ? c.variation_pct > 0 : c.variation_pct < 0;
  return favorable ? "text-baisse" : "text-hausse";
}

function Marche({ marche }: { marche: Cotation[] }) {
  if (marche.length === 0) return <p className="text-sm text-muted">Cotations indisponibles.</p>;
  return (
    <ul className="divide-y divide-border">
      {marche.map((c) => (
        <li key={c.serie} className="flex items-baseline justify-between gap-3 py-3">
          <div>
            <p className="text-sm">{c.nom}</p>
            <p className="text-xs text-faint">
              {c.serie === "eurusd" ? "Taux BCE du" : "Clôture du"} {jourCourt(c.date)}, comparé au {jourCourt(c.date_precedent)}
            </p>
          </div>
          <div className="text-right">
            <p className="chiffres text-sm font-medium">{valeurCotation(c)}</p>
            <p className={`chiffres text-xs ${couleurVariation(c)}`}>
              {c.variation_pct > 0 ? "▲ +" : c.variation_pct < 0 ? "▼ −" : ""}
              {nombre(Math.abs(c.variation_pct), 1)}&nbsp;%
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Actualites({ actualites, erreur }: { actualites: Actualite[]; erreur: string }) {
  if (erreur) return <p className="py-3 text-sm text-muted">Actualités indisponibles ce matin. Rien n&apos;est affiché plutôt qu&apos;une sélection incomplète.</p>;
  if (actualites.length === 0) return <p className="py-3 text-sm text-muted">Aucune actualité pertinente dans les dernières 36 heures.</p>;
  return (
    <ul className="divide-y divide-border">
      {actualites.map((a) => (
        <li key={a.lien} className="py-3">
          <a href={a.lien} target="_blank" rel="noopener noreferrer" className="text-sm leading-snug underline decoration-border underline-offset-2">
            {a.titre}
          </a>
          <p className="mt-1 text-xs text-faint">
            {a.media} · {horodatage(a.publie_le)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function MonPrix({ brief }: { brief: Brief }) {
  const [prefs] = usePreferences();
  const p = brief.prix[prefs.carburant];
  if (!p) return null;
  const v = p.prochain ? p.prochain.prix - p.prix : 0;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm text-muted">{p.nom} · prix maximum officiel</p>
      <p className="chiffres mt-1 text-3xl font-semibold tracking-tight">
        {eurosLitre(p.prix)}
        <span className="ml-1 text-base font-normal text-muted">€/L</span>
      </p>
      <p className="mt-1 text-xs text-faint">En vigueur depuis le {jourCourt(p.depuis)}</p>
      {p.prochain && (
        <p className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span>
            <span className="text-muted">Le {jourCourt(p.prochain.date)} : </span>
            <span className="chiffres font-semibold">{eurosLitre(p.prochain.prix)} €/L</span>
          </span>
          <span className={`chiffres font-medium ${v > 0 ? "text-hausse" : "text-baisse"}`}>
            {v > 0 ? "▲ +" : "▼ −"}
            {eurosLitre(Math.abs(v))} €
          </span>
        </p>
      )}
    </div>
  );
}

const Section = ({ titre, children }: { titre: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-sm font-medium text-muted">{titre}</h2>
    {children}
  </section>
);

export function BriefDuJour({ briefs }: { briefs: Brief[] }) {
  const aujourdhui = useAujourdhui();
  const [brief, ...anciens] = briefs;
  if (!brief)
    return (
      <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
        Aucun brief publié pour l&apos;instant. Le premier arrivera au prochain passage de la tâche automatique, puis chaque jour entre 6 h et 7 h.
      </p>
    );
  const pasEncore = aujourdhui !== null && brief.date < aujourdhui;
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <p className="text-sm text-muted">
          Brief du {jourCourt(brief.date)}, publié à {heure(brief.genere_le)}
          {brief.en_retard && " (en retard : la tâche automatique de GitHub a pris du retard)"}.
        </p>
        {pasEncore && (
          <p className="rounded-2xl border border-attente/40 bg-surface p-3 text-sm text-attente">
            Le brief d&apos;aujourd&apos;hui n&apos;est pas encore publié (prévu entre 6 h et 7 h). Voici le dernier disponible.
          </p>
        )}
      </div>

      <Section titre="Ton carburant">
        <MonPrix brief={brief} />
        <Indicateur previsions={brief.previsions} jourDecision={brief.date} />
      </Section>

      <Section titre="Les 3 prochains jours">
        <PrevisionsMonCarburant previsions={brief.previsions} />
      </Section>

      <Section titre="Actualités">
        <div className="rounded-2xl border border-border bg-surface px-4">
          <Actualites actualites={brief.actualites} erreur={brief.actualites_erreur} />
        </div>
        <p className="text-xs leading-relaxed text-faint">
          {brief.actualites_source}. Titres et liens des médias, sans résumé ni avis : ouvre l&apos;article pour le détail.
        </p>
      </Section>

      <Section titre="Marché de la veille">
        <div className="rounded-2xl border border-border bg-surface px-4">
          <Marche marche={brief.marche} />
        </div>
        <p className="text-xs leading-relaxed text-faint">
          Cotations de New York (Yahoo Finance, source non officielle) et taux de la BCE. Elles influencent le prix maximum belge
          avec un ou deux jours de décalage, sans le déterminer seules (le SPF utilise les cotations de Rotterdam, payantes).
        </p>
      </Section>

      {anciens.length > 0 && (
        <Section titre="Briefs précédents">
          <ul className="space-y-2">
            {anciens.map((b) => (
              <li key={b.date}>
                <details className="rounded-2xl border border-border bg-surface px-4">
                  <summary className="cursor-pointer py-3 text-sm">
                    {jourCourt(b.date)}
                    <span className="text-faint"> · {b.actualites.length} actualités</span>
                  </summary>
                  <Actualites actualites={b.actualites} erreur={b.actualites_erreur} />
                </details>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
