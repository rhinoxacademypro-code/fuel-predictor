// Formats d'affichage (fr-BE)

export const eurosLitre = (n: number) => n.toLocaleString("fr-BE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const centimes = (n: number) => {
  const v = Math.round(n * 1000) / 10;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} c`;
};

export const pourcent = (n: number) => `${Math.round(n * 100)}\u00a0%`;

export function jourCourt(iso: string) {
  return new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

export function horodatage(iso: string) {
  return new Intl.DateTimeFormat("fr-BE", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels",
  }).format(new Date(iso));
}

export function niveauConfiance(p: { certain: boolean; confiance: number }) {
  if (p.certain) return "certain";
  if (p.confiance >= 0.7) return "confiance élevée";
  if (p.confiance >= 0.5) return "confiance moyenne";
  return "confiance faible";
}
