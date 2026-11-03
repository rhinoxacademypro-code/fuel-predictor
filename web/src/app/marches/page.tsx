import { Marches } from "@/components/Marches";
import { chargerMarches } from "@/lib/marches";

export default async function Page() {
  const { series, lien } = await chargerMarches();
  return (
    <main className="flex flex-1 flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Marchés</h1>
        <p className="mt-1 text-sm text-muted">
          Ce qui fait bouger le prix à la pompe : ton prix maximum belge, le pétrole et le dollar, avec leurs dates et sources.
        </p>
        <p className="mt-2 text-xs text-faint">Informations de marché uniquement, pas un conseil d&apos;investissement.</p>
      </header>
      <Marches series={series} lien={lien} />
    </main>
  );
}
