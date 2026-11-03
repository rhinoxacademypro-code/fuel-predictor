"use client";

import { useState, type KeyboardEvent } from "react";
import { DEBUT_STATS, type HistoriqueProduit } from "@/lib/historique";
import { PRODUITS, type CodeProduit } from "@/lib/produits";
import { usePreferences } from "@/lib/reglages";
import { Graphique } from "./Marches";

// Couple divergent validé pour le daltonisme sur la surface sombre (hausse rouge, baisse bleue) ;
// le sens est aussi porté par la position (au-dessus ou en dessous de la ligne), jamais par la couleur seule.
const HAUSSE = "#e66767";
const BAISSE = "#3987e5";

const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const PERIODES = [
  { cle: "unAn", label: "1 an" },
  { cle: "cinqAns", label: "5 ans" },
  { cle: "dixAns", label: "10 ans" },
] as const;

const centimes = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} c/L`;
const dateLongue = (iso: string) =>
  new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const nomMois = (mois: string) =>
  new Intl.DateTimeFormat("fr-BE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mois}-15T12:00:00Z`));
const moisCourt = (mois: string) => `${mois.slice(5)}/${mois.slice(2, 4)}`; // « 11/26 »
const sansJourSemaine = (iso: string) => dateLongue(iso).replace(/^\S+ /, "").replace(/^1 /, "1er ");

// Barre arrondie (4 px) du côté de la valeur, droite contre la ligne de base
function barre(x: number, largeur: number, base: number, hauteur: number, versLeHaut: boolean) {
  if (hauteur < 0.5) return "";
  const r = Math.min(4, hauteur, largeur / 2);
  const y = versLeHaut ? base - hauteur : base + hauteur;
  const s = versLeHaut ? 1 : -1;
  return `M${x},${base}V${y + s * r}Q${x},${y} ${x + r},${y}H${x + largeur - r}Q${x + largeur},${y} ${x + largeur},${y + s * r}V${base}Z`;
}

function BarresDivergentes({
  colonnes, etiquette, lecture, resume, legende = ["hausses", "baisses"],
}: {
  colonnes: { haut: number; bas: number }[];
  etiquette: (i: number) => string;
  lecture: (i: number) => string;
  resume: string;
  legende?: [string, string];
}) {
  const [actif, setActif] = useState<number | null>(null);
  const L = 320;
  const H = 150;
  const base = H / 2;
  const max = Math.max(1e-9, ...colonnes.flatMap((c) => [c.haut, c.bas]));
  const pas = L / colonnes.length;
  const largeur = Math.min(24, pas * 0.6);
  const echelle = (v: number) => (v / max) * (base - 6);
  const clavier = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActif((i) => Math.min(colonnes.length - 1, Math.max(0, (i ?? -1) + (e.key === "ArrowLeft" ? -1 : 1))));
  };
  return (
    <div>
      <p className="min-h-[2.5em] text-xs text-muted" aria-live="polite">{actif === null ? resume : lecture(actif)}</p>
      <svg viewBox={`0 0 ${L} ${H + 16}`} className="mt-2 w-full touch-none select-none outline-none" role="img" aria-label={resume}
        tabIndex={0} onKeyDown={clavier} onBlur={() => setActif(null)} onPointerLeave={() => setActif(null)}>
        <line x1={0} x2={L} y1={base} y2={base} stroke="var(--border)" strokeWidth={1} />
        {colonnes.map((c, i) => {
          const x = i * pas + (pas - largeur) / 2;
          return (
            <g key={i} onPointerEnter={() => setActif(i)} onPointerDown={() => setActif(i)}>
              <rect x={i * pas} y={0} width={pas} height={H} fill={actif === i ? "var(--surface-2)" : "transparent"} />
              <path d={barre(x, largeur, base - 1, echelle(c.haut), true)} fill={HAUSSE} />
              <path d={barre(x, largeur, base + 1, echelle(c.bas), false)} fill={BAISSE} />
              <text x={i === colonnes.length - 1 ? L : i * pas + pas / 2} y={H + 12} fontSize={10} fill="var(--faint)"
                textAnchor={i === colonnes.length - 1 ? "end" : "middle"}>{etiquette(i)}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: HAUSSE }} /> au-dessus : {legende[0]}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: BAISSE }} /> en dessous : {legende[1]}</span>
      </p>
    </div>
  );
}

const Carte = ({ titre, children }: { titre: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-sm font-medium text-muted">{titre}</h2>
    <div className="rounded-2xl border border-border bg-surface p-4">{children}</div>
  </section>
);

export function Historique({ donnees }: { donnees: Partial<Record<CodeProduit, HistoriqueProduit>> }) {
  const [prefs] = usePreferences();
  const [periode, setPeriode] = useState<(typeof PERIODES)[number]["cle"]>("cinqAns");
  const h = donnees[prefs.carburant];
  const nom = PRODUITS.find((p) => p.code === prefs.carburant)?.nom ?? "";
  if (!h) return <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Historique indisponible.</p>;

  const points = h[periode].map((p) => ({ date: p.date, valeur: p.prix }));
  const total = h.jours.reduce((s, j) => s + j.hausses + j.baisses, 0);
  const hausses = h.jours.reduce((s, j) => s + j.hausses, 0);
  const frequent = [...h.jours].sort((a, b) => b.hausses + b.baisses - (a.hausses + a.baisses))[0];
  const depuis = sansJourSemaine(DEBUT_STATS);
  const lundis = h.jours[0].hausses + h.jours[0].baisses;

  return (
    <div className="flex flex-col gap-6">
      <Carte titre={`Prix maximum : ${nom}`}>
        <div role="radiogroup" aria-label="Période" className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-surface-2/60 p-1">
          {PERIODES.map((p) => (
            <button key={p.cle} role="radio" aria-checked={periode === p.cle} onClick={() => setPeriode(p.cle)}
              className={`rounded-lg px-2 py-1.5 text-xs font-medium ${periode === p.cle ? "bg-surface-2 text-text" : "text-faint"}`}>
              {p.label}
            </button>
          ))}
        </div>
        {points.length > 1 && (
          <Graphique
            key={periode}
            serie={{ code: prefs.carburant, nom, unite: "€/L", decimales: 3, source: "SPF Économie", points }}
            points={points}
          />
        )}
        <p className="mt-2 text-xs text-faint">
          {periode === "unAn" ? "Une valeur par jour." : "Une valeur par semaine (la dernière de la semaine)."} Données depuis le{" "}
          {sansJourSemaine(h.premierJour)}.
        </p>
      </Carte>

      <Carte titre="Quels jours le prix change">
        <BarresDivergentes
          colonnes={h.jours.map((j) => ({ haut: j.hausses, bas: j.baisses }))}
          etiquette={(i) => JOURS[i].slice(0, 3)}
          resume={`Depuis le ${depuis} : ${total} changements (${hausses} hausses, ${total - hausses} baisses), le plus souvent un ${JOURS[frequent.jour]}. Touche une colonne pour le détail.`}
          lecture={(i) => {
            const j = h.jours[i];
            const n = j.hausses + j.baisses;
            return n === 0
              ? `${JOURS[i]} : aucun changement.`
              : `${JOURS[i]} : ${j.hausses} hausses, ${j.baisses} baisses, variation moyenne ${centimes(j.variationMoyenne ?? 0)}.`;
          }}
        />
        <div className="mt-3 space-y-1 text-xs leading-relaxed text-faint">
          <p>
            Jour où le nouveau prix entre en vigueur.{" "}
            {lundis === 0
              ? "Jamais un lundi : le SPF ne calcule pas de nouveau prix le dimanche."
              : "Le lundi est normalement exclu : le SPF ne calcule pas de nouveau prix le dimanche."}
            {h.exceptions.length > 0 &&
              ` Exception${h.exceptions.length > 1 ? "s" : ""} : ${h.exceptions.map((x) => `${dateLongue(x.date)} (${centimes(x.variation)})`).join(", ")}.`}
          </p>
          <p>Aucun jour n&apos;est « moins cher » en soi : ce qui compte, c&apos;est le prochain changement publié, que l&apos;indicateur de l&apos;accueil suit.</p>
        </div>
      </Carte>

      <Carte titre="Mois par mois (24 derniers mois)">
        <BarresDivergentes
          colonnes={h.mois.map((m) => ({ haut: Math.max(0, m.variationNette), bas: Math.max(0, -m.variationNette) }))}
          etiquette={(i) => ((h.mois.length - 1 - i) % 4 === 0 ? moisCourt(h.mois[i].mois) : "")}
          legende={["hausse nette", "baisse nette"]}
          resume="Variation nette du prix maximum chaque mois (somme des hausses et des baisses). Touche un mois pour le détail."
          lecture={(i) => {
            const m = h.mois[i];
            return `${nomMois(m.mois)} : ${m.hausses} hausses, ${m.baisses} baisses, ${centimes(m.variationNette)} au total.`;
          }}
        />
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-faint">Voir le tableau</summary>
          <table className="mt-2 w-full">
            <thead>
              <tr className="text-left text-faint"><th className="py-1 font-normal">Mois</th><th className="font-normal">Hausses</th><th className="font-normal">Baisses</th><th className="text-right font-normal">Total</th></tr>
            </thead>
            <tbody>
              {[...h.mois].reverse().map((m) => (
                <tr key={m.mois} className="border-t border-border">
                  <td className="py-1 text-muted">{nomMois(m.mois)}</td>
                  <td className="chiffres">{m.hausses}</td>
                  <td className="chiffres">{m.baisses}</td>
                  <td className="chiffres text-right">{centimes(m.variationNette)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Carte>

      <p className="text-xs leading-relaxed text-faint">
        Source : SPF Économie (be.STAT pour la dernière année, historique Brafco avant).
        {h.exclus.length > 0 &&
          ` Valeur${h.exclus.length > 1 ? "s" : ""} manifestement erronée${h.exclus.length > 1 ? "s" : ""} de l'historique exclue${h.exclus.length > 1 ? "s" : ""} : ${h.exclus
            .map((x) => `${x.prix.toLocaleString("fr-BE", { minimumFractionDigits: 3 })} €/L du ${sansJourSemaine(x.debut)} au ${sansJourSemaine(x.fin)}`)
            .join(", ")} (saut de plus de 40 c/L annulé quelques jours plus tard).`}
      </p>
    </div>
  );
}
