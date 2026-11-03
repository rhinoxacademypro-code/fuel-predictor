import { Indicateur, PrevisionsMonCarburant, SelecteurCarburant } from "@/components/Accueil";
import { PrixActuels } from "@/components/PrixActuels";
import { chargerPrevisions } from "@/lib/previsions";
import { chargerPrixOfficiels } from "@/lib/prix-officiels";

export default async function Accueil() {
  const [prix, prev] = await Promise.all([chargerPrixOfficiels(), chargerPrevisions()]);
  const previsions = prev.ok ? prev.previsions : [];
  return (
    <main className="flex flex-1 flex-col gap-6">
      <header className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-faint">Fuel Predictor</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Carburants en Belgique</h1>
        </div>
        <SelecteurCarburant />
      </header>

      <Indicateur previsions={previsions} erreur={prev.ok ? undefined : prev.erreur} />

      <section aria-labelledby="titre-prev" className="space-y-3">
        <h2 id="titre-prev" className="text-sm font-medium text-muted">Les 3 prochains jours</h2>
        <PrevisionsMonCarburant previsions={previsions} />
      </section>

      <section aria-labelledby="titre-prix" className="space-y-3">
        <h2 id="titre-prix" className="text-sm font-medium text-muted">Prix maximums officiels aujourd&apos;hui</h2>
        <PrixActuels donnees={prix} />
      </section>

      <section aria-labelledby="titre-suite" className="space-y-3">
        <h2 id="titre-suite" className="text-sm font-medium text-muted">Bientôt sur cet écran</h2>
        <ul className="grid gap-2 text-sm text-muted">
          <li className="rounded-2xl border border-dashed border-border p-4">Dernières actualités du marché (phase 2)</li>
          <li className="rounded-2xl border border-dashed border-border p-4">Stations autour de toi (phase 3)</li>
        </ul>
      </section>
    </main>
  );
}
