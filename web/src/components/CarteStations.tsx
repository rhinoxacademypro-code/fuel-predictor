"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as CarteLeaflet, LayerGroup } from "leaflet";
import { nomStation, type Position, type Station } from "@/lib/stations";

const TRAIT = "#3987e5"; // même bleu que les graphiques
const ZOOM: Record<number, number> = { 5: 13, 10: 12, 20: 11 };

// Carte Leaflet chargée seulement dans le navigateur (Leaflet a besoin de `window`).
export function CarteStations({
  centre, rayon, stations, selection, choisir,
}: { centre: Position; rayon: number; stations: Station[]; selection: string | null; choisir: (id: string) => void }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteLeaflet | null>(null);
  const calque = useRef<LayerGroup | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const [prete, setPrete] = useState(false);

  // création de la carte, une seule fois
  useEffect(() => {
    let annule = false;
    import("leaflet").then((L) => {
      if (annule || !conteneur.current || carte.current) return;
      leaflet.current = L;
      carte.current = L.map(conteneur.current, { zoomControl: false, attributionControl: true }).setView([centre.la, centre.lo], ZOOM[rayon] ?? 12);
      // tuiles standard d'OpenStreetMap (gratuites, sans clé, usage léger), assombries en CSS (globals.css)
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">les contributeurs OpenStreetMap</a>',
      }).addTo(carte.current);
      calque.current = L.layerGroup().addTo(carte.current);
      setPrete(true);
    });
    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- création unique ; la vue suit `centre` et `rayon` ci-dessous
  }, []);

  // vue recentrée seulement quand le lieu ou le rayon change (pas à chaque sélection)
  useEffect(() => {
    if (prete) carte.current?.setView([centre.la, centre.lo], ZOOM[rayon] ?? 12);
  }, [prete, centre, rayon]);

  // cercle du rayon, stations et sélection
  useEffect(() => {
    const L = leaflet.current;
    if (!prete || !L || !carte.current || !calque.current) return;
    calque.current.clearLayers();
    L.circle([centre.la, centre.lo], { radius: rayon * 1000, color: "#6b7280", weight: 1, fill: false, interactive: false }).addTo(calque.current);
    for (const s of stations) {
      const choisie = s.id === selection;
      L.circleMarker([s.la, s.lo], {
        radius: choisie ? 9 : 6, color: "#14161a", weight: 2, fillColor: choisie ? "#f5f5f4" : TRAIT, fillOpacity: 1,
      })
        .bindTooltip(nomStation(s), { direction: "top", offset: [0, -6] })
        .on("click", () => choisir(s.id))
        .addTo(calque.current);
    }
    L.circleMarker([centre.la, centre.lo], { radius: 7, color: TRAIT, weight: 3, fillColor: "#f5f5f4", fillOpacity: 1, interactive: false })
      .addTo(calque.current);
  }, [prete, centre, rayon, stations, selection, choisir]);

  return <div ref={conteneur} className="h-72 w-full overflow-hidden rounded-2xl border border-border" aria-label="Carte des stations" />;
}
