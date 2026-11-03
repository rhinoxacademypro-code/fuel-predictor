import Link from "next/link";
import { LignePrevision } from "@/components/LignePrevision";
import { horodatage } from "@/lib/format";
import { chargerFiabilite, chargerPrevisions } from "@/lib/previsions";
import { PRODUITS } from "@/lib/produits";

export default async function Previsions() {
  const [r, fia] = await Promise.all([chargerPrevisions(), chargerFiabilite()]);
  return (
    <main className="flex flex-1 flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Prévisions</h1>
        <p className="mt-1 text-sm text-muted">Prix maximum officiel à J+1, J+2 et J+3. Une prévision n&apos;est jamais un prix confirmé.</p>
      </header>

      {!r.ok ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Prévisions indisponibles ({r.erreur}).</p>
      ) : (
        <>
          {PRODUITS.map((prod) => {
            const liste = r.previsions.filter((p) => p.produit === prod.code).sort((a, b) => a.horizon - b.horizon);
            return (
              <section key={prod.code} aria-labelledby={`t-${prod.code}`} className="rounded-2xl border border-border bg-surface px-4">
                <h2 id={`t-${prod.code}`} className="border-b border-border py-3 text-sm font-medium">{prod.nom}</h2>
                {fia.ok && Object.entries(fia.fiabilite.produits[prod.code].horizons).some(([, h]) => !h.meilleur_que_references) && (
                  <p className="mt-3 rounded-xl border border-hausse/50 bg-hausse/10 p-3 text-xs leading-relaxed text-hausse">
                    Attention : sur l&apos;historique, ces prévisions ne font pas mieux que « le prix ne bouge pas » pour au moins un horizon.
                    Ne t&apos;appuie pas dessus pour décider.
                  </p>
                )}
                <ul className="divide-y divide-border">
                  {liste.map((p) => <LignePrevision key={p.horizon} p={p} detail />)}
                </ul>
              </section>
            );
          })}
          <section className="space-y-2 text-xs leading-relaxed text-faint">
            <p>
              Émises le {horodatage(r.previsions[0].emise_le)} · modèle {r.previsions[0].modele_version} · statut{" "}
              <span className="text-muted">prévisionnel</span>.{" "}
              <Link href="/statistiques" className="underline decoration-border underline-offset-2">Voir la fiabilité mesurée</Link>
            </p>
            <p>
              Méthode : probabilités calculées à partir de l&apos;écart des cotations internationales (New York, converties en euros au taux
              BCE) depuis le dernier changement de prix, et du calendrier de calcul du SPF, puis corrigées pour ne pas surestimer leur
              confiance. Sur l&apos;historique, elles font mieux que « le prix ne bouge pas » à chaque horizon, mais{" "}
              <span className="text-muted">J+1 reste peu fiable</span> : le moteur annonce rarement un changement pour le lendemain. Les jours
              sans calcul du SPF (week-end, férié, fermeture) donnent un prix certain.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
