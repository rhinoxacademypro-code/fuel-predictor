import { BriefDuJour } from "@/components/Brief";
import { chargerBriefs } from "@/lib/brief";

export default async function Page() {
  const briefs = await chargerBriefs();
  return (
    <main className="flex flex-1 flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Brief du matin</h1>
        <p className="mt-1 text-sm text-muted">Chaque jour entre 6 h et 7 h : ton carburant, les prévisions, les actualités et le marché.</p>
      </header>
      <BriefDuJour briefs={briefs} />
    </main>
  );
}
