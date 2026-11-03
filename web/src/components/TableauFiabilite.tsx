"use client";

import { SelecteurCarburant } from "@/components/Accueil";
import { horodatage } from "@/lib/format";
import type { Fiabilite } from "@/lib/previsions";
import { usePreferences } from "@/lib/reglages";

const HORIZONS = ["1", "2", "3"] as const;
const nombre = (n: number, dec = 0) => n.toLocaleString("fr-BE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const pct = (n: number | null | undefined, dec = 0) => (n == null ? "–" : `${nombre(n, dec)} %`);
const signe = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${nombre(Math.abs(n), 0)} %`;

function Carte({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-medium">{titre}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function TableauFiabilite({ f }: { f: Fiabilite }) {
  const [prefs] = usePreferences();
  const prod = f.produits[prefs.carburant];
  const h = prod.horizons;
  const bon = HORIZONS.every((k) => h[k].meilleur_que_references);
  const ind = prod.indicateur;
  const [debut, fin] = h["1"].periode;

  return (
    <div className="space-y-4">
      <SelecteurCarburant />

      <section className={`rounded-2xl border p-4 ${bon ? "border-baisse/50 bg-baisse/10" : "border-hausse/50 bg-hausse/10"}`}>
        <p className={`text-lg font-semibold tracking-tight ${bon ? "text-baisse" : "text-hausse"}`}>
          {bon ? "Le moteur fait mieux que les références" : "Attention : le moteur ne fait pas mieux que les références"}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-text/80">
          {bon
            ? `Testé jour par jour de ${debut.slice(0, 4)} à ${fin.slice(0, 4)}, sur des données qu'il ne connaissait pas, à J+1, J+2 et J+3.`
            : "Sur au moins un horizon, ses probabilités sont moins bonnes que « le prix ne bouge pas ». Ne t'appuie pas sur ses prévisions pour décider."}
        </p>
      </section>

      <Carte titre="Qualité des prévisions">
        <table className="chiffres w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-faint">
              <th className="pb-2 font-normal" />
              {HORIZONS.map((k) => <th key={k} className="w-14 pb-2 pl-2 text-right font-normal">J+{k}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              { l: "Mieux que « prix inchangé »", v: (k: (typeof HORIZONS)[number]) => signe(h[k].gain_vs_naif_pct) },
              { l: "Mieux que les moyennes", v: (k: (typeof HORIZONS)[number]) => signe(h[k].gain_vs_climatologie_pct) },
              { l: "Changements repérés", v: (k: (typeof HORIZONS)[number]) => pct(h[k].changements_reperes_pct) },
              { l: "Annoncés dans le mauvais sens", v: (k: (typeof HORIZONS)[number]) => pct(h[k].alertes_sens_oppose_pct) },
            ].map((ligne) => (
              <tr key={ligne.l}>
                <td className="py-2 pr-2 text-muted">{ligne.l}</td>
                {HORIZONS.map((k) => <td key={k} className="whitespace-nowrap py-2 pl-2 text-right">{ligne.v(k)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          « Mieux que » : amélioration du score de Brier (justesse des probabilités annoncées) sur les jours où le prix pouvait changer.
          Les probabilités sont volontairement prudentes : le moteur annonce rarement un changement, mais se trompe très rarement de sens.
        </p>
      </Carte>

      <Carte titre="Prix annoncés « certains »">
        <p className="text-sm leading-relaxed text-muted">
          Quand le SPF ne peut pas calculer de nouveau prix (week-end, férié, fermeture), le prix du lendemain est annoncé certain.{" "}
          <span className="text-text">
            Vérifié {nombre(h["1"].jours_certains - h["1"].jours_certains_dementis)} fois sur {nombre(h["1"].jours_certains)}
          </span>{" "}
          depuis {debut.slice(0, 4)}.
        </p>
      </Carte>

      <Carte titre="Si tu avais suivi l'indicateur">
        <p className="text-sm leading-relaxed text-muted">
          Sur {nombre(ind.jours)} jours rejoués, l&apos;indicateur aurait conseillé d&apos;agir{" "}
          <span className="text-text">{ind.verts + ind.oranges} fois</span> ({ind.verts} « faire le plein », {ind.oranges} « attendre ») et
          répondu « pas de différence » les autres jours.
        </p>
        {ind.gain_moyen_par_recommandation_eur != null && (
          <dl className="chiffres mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface-2 p-2">
              <dt className="text-[11px] text-faint">gagnantes</dt>
              <dd className="text-base font-semibold text-baisse">{pct(ind.recommandations_gagnantes_pct)}</dd>
            </div>
            <div className="rounded-xl bg-surface-2 p-2">
              <dt className="text-[11px] text-faint">perdantes</dt>
              <dd className="text-base font-semibold text-hausse">{pct(ind.recommandations_perdantes_pct, 1)}</dd>
            </div>
            <div className="rounded-xl bg-surface-2 p-2">
              <dt className="text-[11px] text-faint">gain moyen</dt>
              <dd className="text-base font-semibold">{nombre(ind.gain_moyen_par_recommandation_eur, 2)}&nbsp;€</dd>
            </div>
          </dl>
        )}
        <p className="mt-3 text-xs text-faint">Pour {ind.quantite_l} L par plein. Les autres recommandations : prix finalement inchangé, sans perte.</p>
      </Carte>

      <Carte titre="Les probabilités annoncées sont-elles fiables ? (J+2)">
        <ul className="space-y-2.5">
          {h["2"].calibration.map((c) => (
            <li key={c.annonce} className="chiffres text-xs">
              <div className="flex justify-between text-faint">
                <span>annoncé {pct(c.annonce * 100)}</span>
                <span>observé {pct(c.observe * 100)}</span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-surface-2">
                <div className="absolute inset-y-0 left-0 rounded-full bg-neutre/50" style={{ width: `${c.annonce * 100}%` }} />
                <div className="absolute inset-y-[-2px] w-0.5 bg-text" style={{ left: `${c.observe * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-faint">Barre : probabilité de changement annoncée. Trait : fréquence réellement observée. Plus ils sont proches, plus le chiffre est fiable.</p>
      </Carte>

      <Carte titre="Année par année (J+1, mieux que les moyennes)">
        <ul className="space-y-1.5">
          {h["1"].par_annee.map((a) => (
            <li key={a.annee} className="chiffres grid grid-cols-[3rem_1fr_3.5rem] items-center gap-2 text-xs">
              <span className="text-faint">{a.annee}</span>
              <div className="h-2 rounded-full bg-surface-2">
                <div className={`h-2 rounded-full ${a.gain_pct >= 0 ? "bg-baisse" : "bg-hausse"}`} style={{ width: `${Math.min(Math.abs(a.gain_pct), 50) * 2}%` }} />
              </div>
              <span className="text-right">{signe(a.gain_pct)}</span>
            </li>
          ))}
        </ul>
      </Carte>

      <Carte titre="Prévisions archivées (en direct)">
        <p className="text-sm leading-relaxed text-muted">
          {f.direct.suffisant
            ? `${f.direct.evaluees} prévisions comparées aux prix publiés : scénario juste ${pct(f.direct.scenario_juste_pct)}.`
            : `${f.direct.evaluees} prévision${f.direct.evaluees > 1 ? "s" : ""} déjà vérifiable${f.direct.evaluees > 1 ? "s" : ""}. Le verdict en direct s'affichera à partir de 30, une fois le moteur en route chaque jour.`}
        </p>
      </Carte>

      <p className="text-xs text-faint">
        Calculé le {horodatage(f.genere_le)} · modèle {f.modele_version}.
      </p>
    </div>
  );
}
