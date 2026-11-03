import type { Prevision } from "@/lib/decision";
import { centimes, eurosLitre, jourCourt, niveauConfiance, pourcent } from "@/lib/format";

function resume(p: Prevision) {
  if (p.statut === "reel") return { texte: `Officiel : ${eurosLitre(p.prix_reference + p.variation_estimee)} €/L`, couleur: p.scenario > 0 ? "text-hausse" : "text-baisse" };
  if (p.certain) return { texte: `Inchangé : ${eurosLitre(p.prix_reference)} €/L`, couleur: "text-text" };
  if (p.scenario > 0) return { texte: `Hausse probable, ${centimes(p.amplitude)}/L`, couleur: "text-hausse" };
  if (p.scenario < 0) return { texte: `Baisse probable, ${centimes(-p.amplitude)}/L`, couleur: "text-baisse" };
  return { texte: "Inchangé le plus probable", couleur: "text-text" };
}

export function LignePrevision({ p, detail = false }: { p: Prevision; detail?: boolean }) {
  const r = resume(p);
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm">
          <span className="font-medium">J+{p.horizon}</span> <span className="text-muted">{jourCourt(p.date_cible)}</span>
        </p>
        <p className="text-xs text-faint">{niveauConfiance(p)}</p>
      </div>
      <p className={`mt-1 text-sm font-medium ${r.couleur}`}>{r.texte}</p>
      {!p.certain && (
        <>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2" role="img"
            aria-label={`Baisse ${pourcent(p.p_baisse)}, stable ${pourcent(p.p_stable)}, hausse ${pourcent(p.p_hausse)}`}>
            <div className="bg-baisse" style={{ width: `${p.p_baisse * 100}%` }} />
            <div className="bg-neutre/40" style={{ width: `${p.p_stable * 100}%` }} />
            <div className="bg-hausse" style={{ width: `${p.p_hausse * 100}%` }} />
          </div>
          <p className="chiffres mt-1.5 flex justify-between text-xs text-faint">
            <span className="text-baisse">baisse {pourcent(p.p_baisse)}</span>
            <span>stable {pourcent(p.p_stable)}</span>
            <span className="text-hausse">hausse {pourcent(p.p_hausse)}</span>
          </p>
        </>
      )}
      {detail && (
        <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
          {!p.certain && (
            <p className="chiffres">
              Variation estimée {centimes(p.variation_estimee)}/L, intervalle à 80 % : de {centimes(p.intervalle_bas)} à {centimes(p.intervalle_haut)}.
            </p>
          )}
          <p>{p.explication}</p>
        </div>
      )}
    </li>
  );
}
