import { Stations } from "@/components/Stations";
import { chargerPrixOfficiels } from "@/lib/prix-officiels";

export default async function Page() {
  const prix = await chargerPrixOfficiels();
  return (
    <main className="flex flex-1 flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Stations</h1>
        <p className="mt-1 text-sm text-muted">Les stations autour de toi, le plafond légal du jour et tes propres relevés de prix.</p>
      </header>
      <Stations prix={prix} />
    </main>
  );
}
