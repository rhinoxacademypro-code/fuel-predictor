import { Historique } from "@/components/Historique";
import { OngletsStats } from "@/components/OngletsStats";
import { TableauFiabilite } from "@/components/TableauFiabilite";
import { chargerHistorique } from "@/lib/historique-donnees";
import { chargerFiabilite } from "@/lib/previsions";

export default async function Statistiques() {
  const [r, historique] = await Promise.all([chargerFiabilite(), chargerHistorique()]);
  return (
    <main className="flex flex-1 flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Statistiques</h1>
        <p className="mt-1 text-sm text-muted">L&apos;historique des prix maximums, et la fiabilité mesurée du moteur de prévision.</p>
      </header>
      <OngletsStats
        historique={<Historique donnees={historique} />}
        fiabilite={
          r.ok ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">Le moteur de prévision mérite-t-il ta confiance ? Les chiffres, sans arrondir à son avantage.</p>
              <TableauFiabilite f={r.fiabilite} />
            </div>
          ) : (
            <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Fiabilité indisponible ({r.erreur}).</p>
          )
        }
      />
    </main>
  );
}
