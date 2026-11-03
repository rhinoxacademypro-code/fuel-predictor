import { FormulaireReglages } from "@/components/FormulaireReglages";

export default function Parametres() {
  return (
    <main className="flex flex-1 flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
      <FormulaireReglages />
    </main>
  );
}
