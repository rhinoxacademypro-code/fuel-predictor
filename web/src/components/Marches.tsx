"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { jourCourt } from "@/lib/format";
import type { LienMarche, Point, Serie } from "@/lib/marches";
import { PRODUITS, type CodeProduit } from "@/lib/produits";
import { usePreferences } from "@/lib/reglages";

const PERIODES = [
  { jours: 7, label: "7 jours" },
  { jours: 30, label: "1 mois" },
  { jours: 365, label: "1 an" },
] as const;

// Couleur des courbes : bleu validé sur la surface sombre de l'app (contraste ≥ 3:1)
const TRAIT = "#3987e5";
const L = 320; // largeur du dessin (unités SVG)
const H = 120;
const MARGE = { gauche: 46, droite: 8, haut: 8, bas: 8 };

const dateAnnee = (iso: string) =>
  new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

const nombre = (n: number, d: number) => n.toLocaleString("fr-BE", { minimumFractionDigits: d, maximumFractionDigits: d });
const valeur = (s: Serie, v: number) => `${nombre(v, s.decimales)} ${s.unite}`;

function pointsPeriode(s: Serie, jours: number): Point[] {
  const derniere = s.points.at(-1)!.date;
  const debut = new Date(new Date(`${derniere}T12:00:00Z`).getTime() - jours * 86_400_000).toISOString().slice(0, 10);
  return s.points.filter((p) => p.date >= debut);
}

// Hausse du pétrole ou des prix = mauvaise nouvelle à la pompe ; hausse de l'euro = bonne nouvelle
function couleurVariation(code: Serie["code"], v: number) {
  if (Math.abs(v) < 1e-9) return "text-neutre";
  return (code === "eurusd" ? v > 0 : v < 0) ? "text-baisse" : "text-hausse";
}

// Décimales nécessaires pour écrire un pas de graduation (0,05 -> 2 ; 2,5 -> 1 ; 10 -> 0)
function decimalesDe(pas: number): number {
  let d = 0;
  while (d < 6 && Math.abs(Math.round(pas * 10 ** d) - pas * 10 ** d) > 1e-6) d++;
  return d;
}

function graduations(min: number, max: number): number[] {
  if (max - min < 1e-9) return [min];
  const brut = (max - min) / 3; // 2 à 4 graduations
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= brut) ?? brut;
  const debut = Math.ceil(min / pas) * pas;
  const t = [];
  for (let v = debut; v <= max + 1e-9; v += pas) t.push(v);
  return t;
}

// Avec l'année quand la courbe couvre plus de 10 mois (sinon « lundi 3 nov. » serait ambigu)
const dateGraphique = (iso: string, avecAnnee: boolean) =>
  avecAnnee
    ? new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`))
    : jourCourt(iso);

export function Graphique({ serie, points }: { serie: Serie; points: Point[] }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const avecAnnee = Date.parse(points.at(-1)!.date) - Date.parse(points[0].date) > 300 * 86_400_000;
  const date = (iso: string) => dateGraphique(iso, avecAnnee);
  const vals = points.map((p) => p.valeur);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const ecart = max - min || Math.abs(max) * 0.01 || 1;
  const bas = min - ecart * 0.08;
  const haut = max + ecart * 0.08;
  const largeur = L - MARGE.gauche - MARGE.droite;
  const hauteur = H - MARGE.haut - MARGE.bas;
  const x = (i: number) => MARGE.gauche + (points.length === 1 ? largeur : (i / (points.length - 1)) * largeur);
  const y = (v: number) => MARGE.haut + (1 - (v - bas) / (haut - bas)) * hauteur;
  const ligne = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.valeur).toFixed(1)}`).join("");
  const aire = `${ligne}L${x(points.length - 1).toFixed(1)},${H - MARGE.bas}L${x(0).toFixed(1)},${H - MARGE.bas}Z`;
  const actif = survol ?? points.length - 1;
  const ticks = graduations(bas, haut);
  const decimalesAxe = ticks.length > 1 ? decimalesDe(ticks[1] - ticks[0]) : serie.decimales;

  const versIndex = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const xs = ((e.clientX - r.left) / r.width) * L;
    const i = Math.round(((xs - MARGE.gauche) / largeur) * (points.length - 1));
    setSurvol(Math.min(points.length - 1, Math.max(0, i)));
  };
  const clavier = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setSurvol((i) => Math.min(points.length - 1, Math.max(0, (i ?? points.length - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
  };

  return (
    <div>
      <p className="text-xs text-faint" aria-live="polite">
        <span className="chiffres font-medium text-text">{valeur(serie, points[actif].valeur)}</span> · {date(points[actif].date)}
      </p>
      <svg
        viewBox={`0 0 ${L} ${H}`}
        className="mt-2 w-full touch-none select-none outline-none focus-visible:ring-1 focus-visible:ring-border"
        role="img"
        aria-label={`${serie.nom} du ${date(points[0].date)} au ${date(points.at(-1)!.date)}, de ${valeur(serie, points[0].valeur)} à ${valeur(serie, points.at(-1)!.valeur)}`}
        tabIndex={0}
        onPointerMove={versIndex}
        onPointerDown={versIndex}
        onPointerLeave={() => setSurvol(null)}
        onKeyDown={clavier}
        onBlur={() => setSurvol(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGE.gauche} x2={L - MARGE.droite} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={MARGE.gauche - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--faint)" className="chiffres">
              {nombre(t, decimalesAxe)}
            </text>
          </g>
        ))}
        <path d={aire} fill={TRAIT} fillOpacity={0.1} />
        <path d={ligne} fill="none" stroke={TRAIT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {survol !== null && (
          <line x1={x(actif)} x2={x(actif)} y1={MARGE.haut} y2={H - MARGE.bas} stroke="var(--muted)" strokeWidth={1} />
        )}
        <circle cx={x(actif)} cy={y(points[actif].valeur)} r={4} fill={TRAIT} stroke="var(--surface)" strokeWidth={2} />
      </svg>
      <div className="mt-1 flex justify-between pl-[14%] text-[10px] text-faint">
        <span>{date(points[0].date)}</span>
        <span>{date(points.at(-1)!.date)}</span>
      </div>
    </div>
  );
}

function CarteSerie({ serie, jours }: { serie: Serie; jours: number }) {
  const points = pointsPeriode(serie, jours);
  const premier = points[0];
  const dernier = points.at(-1)!;
  const v = dernier.valeur - premier.valeur;
  const pct = premier.valeur ? (100 * v) / premier.valeur : 0;
  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{serie.nom}</h3>
        <span className={`chiffres text-sm font-medium ${couleurVariation(serie.code, v)}`}>
          {v > 0 ? "▲ +" : v < 0 ? "▼ −" : ""}
          {nombre(Math.abs(pct), 1)}&nbsp;%
        </span>
      </div>
      <div className="mt-2">
        {points.length > 1 ? <Graphique serie={serie} points={points} /> : <p className="text-sm text-muted">Pas assez de valeurs sur cette période.</p>}
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-faint">Voir les valeurs · {serie.source}</summary>
        <table className="mt-2 w-full">
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.date} className="border-t border-border">
                <td className="py-1 text-muted">{jourCourt(p.date)}</td>
                <td className="chiffres py-1 text-right">{valeur(serie, p.valeur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </li>
  );
}

const NOM_COTATION = { ho: "gasoil de New York", rbob: "essence de New York" };

function Lien({ lien, code }: { lien?: LienMarche; code: CodeProduit }) {
  const nom = PRODUITS.find((p) => p.code === code)?.nom;
  if (!lien)
    return <p className="text-sm text-muted">Mesure disponible après le prochain calcul de nuit.</p>;
  const lies = lien.decalages_lies;
  return (
    <div className="space-y-2 text-sm leading-relaxed text-muted">
      <p>
        Le prix maximum du <span className="text-text">{nom}</span> réagit au cours du {NOM_COTATION[lien.cotation]} avec{" "}
        <span className="text-text">{lies[0]} à {lies.at(-1)} jours de décalage</span> (le plus net : {lien.decalage_jours} jours).
      </p>
      <p>
        En moyenne, une variation de ce cours se retrouve à <span className="chiffres text-text">{lien.transmission_7j.part_pct}&nbsp;%</span> dans
        le prix belge après 7 jours, et à <span className="chiffres text-text">{lien.transmission_30j.part_pct}&nbsp;%</span> après 30 jours.
      </p>
      <p className="text-xs text-faint">
        Mesuré sur les variations du {dateAnnee(lien.periode[0])} au {dateAnnee(lien.periode[1])} (corrélation sur 30 jours : {nombre(lien.transmission_30j.correlation, 2)}). Le SPF calcule le prix
        avec les cotations de Rotterdam de la veille, lissées sur plusieurs jours : d&apos;où ce décalage. Une moyenne passée, pas une
        prévision.
      </p>
    </div>
  );
}

export function Marches({ series, lien }: { series: Serie[]; lien: Partial<Record<CodeProduit, LienMarche>> }) {
  const [jours, setJours] = useState<number>(30);
  const [prefs] = usePreferences();
  const visibles = series.filter((s) => !["e10", "e98", "b7"].includes(s.code) || s.code === prefs.carburant);
  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Période" className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
        {PERIODES.map((p) => (
          <button key={p.jours} role="radio" aria-checked={jours === p.jours} onClick={() => setJours(p.jours)}
            className={`rounded-lg px-2 py-2 text-xs font-medium ${jours === p.jours ? "bg-surface-2 text-text" : "text-faint"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Données de marché indisponibles.</p>
      ) : (
        <ul className="grid gap-3">
          {visibles.map((s) => <CarteSerie key={s.code} serie={s} jours={jours} />)}
        </ul>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">Lien avec le prix belge</h2>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <Lien lien={lien[prefs.carburant]} code={prefs.carburant} />
        </div>
      </section>
    </div>
  );
}
