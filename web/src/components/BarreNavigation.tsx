"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Onglet = { href: string; label: string; icone: React.ReactNode };

const trait = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ONGLETS: Onglet[] = [
  {
    href: "/",
    label: "Accueil",
    icone: <path {...trait} d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  },
  {
    href: "/previsions",
    label: "Prévisions",
    icone: <path {...trait} d="M4 18 9 12l4 3 7-8M15 7h5v5" />,
  },
  {
    href: "/brief",
    label: "Brief",
    icone: <path {...trait} d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" />,
  },
  {
    href: "/stations",
    label: "Stations",
    icone: <path {...trait} d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
  },
  {
    href: "/statistiques",
    label: "Stats",
    icone: <path {...trait} d="M5 20V11M12 20V5M19 20v-6" />,
  },
  {
    href: "/marches",
    label: "Marchés",
    icone: <path {...trait} d="M7 4v3M7 13v4M5 7h4v6H5zM17 6v4M17 16v3M15 10h4v6h-4z" />,
  },
  {
    href: "/parametres",
    label: "Réglages",
    icone: <path {...trait} d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4" />,
  },
];

export function BarreNavigation() {
  const chemin = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-7">
        {ONGLETS.map((o) => {
          const actif = o.href === "/" ? chemin === "/" : chemin.startsWith(o.href);
          return (
            <li key={o.href}>
              <Link
                href={o.href}
                aria-current={actif ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] ${actif ? "text-text" : "text-faint"}`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                  {o.icone}
                </svg>
                {o.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
