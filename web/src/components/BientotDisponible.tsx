export function BientotDisponible({ titre, etape, description }: { titre: string; etape: string; description: string }) {
  return (
    <main className="flex flex-1 flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{titre}</h1>
      <div className="rounded-2xl border border-dashed border-border p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-faint">{etape}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
      </div>
    </main>
  );
}
