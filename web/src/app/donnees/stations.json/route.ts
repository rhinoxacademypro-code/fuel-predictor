import { lireFichierMoteur } from "@/lib/fichiers-moteur";

// Fichier statique des stations (moteur/sorties/stations.json), servi tel quel à l'adresse /donnees/stations.json :
// chargé par l'onglet Stations seulement quand on l'ouvre, pour ne pas alourdir les autres pages.
export const dynamic = "force-static";

export async function GET() {
  try {
    return new Response(await lireFichierMoteur("sorties/stations.json"), { headers: { "Content-Type": "application/json" } });
  } catch {
    return Response.json({ genere_le: "", base_osm: "", source: "", nombre: 0, stations: [] });
  }
}
