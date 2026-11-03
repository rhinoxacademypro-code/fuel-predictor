import { TableauFiabilite } from "@/components/TableauFiabilite";
import { chargerFiabilite } from "@/lib/previsions";

export default async function Statistiques() {
  const r = await chargerFiabilite();
  return (
    <main className="flex flex-1 flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Fiabilité</h1>
        <p className="mt-1 text-sm text-muted">Le moteur de prévision mérite-t-il ta confiance ? Les chiffres, sans arrondir à son avantage.</p>
      </header>
      {r.ok ? (
        <TableauFiabilite f={r.fiabilite} />
      ) : (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Fiabilité indisponible ({r.erreur}).</p>
      )}
      <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
        Historiques des prix, du Brent et de l&apos;EUR/USD sur 7 jours à 1 an : phase 4.
      </p>
    </main>
  );
}
