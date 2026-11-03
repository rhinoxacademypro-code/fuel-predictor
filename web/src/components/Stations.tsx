"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { eurosLitre, horodatage } from "@/lib/format";
import { PRODUITS, type CodeProduit, type PointPrix, type PrixOfficiels } from "@/lib/produits";
import { useAujourdhui, usePreferences } from "@/lib/reglages";
import { useDernierCentre, useFavoris, useReleves, type Centre } from "@/lib/releves";
import {
  autour, estRecent, historique, lirePrix, moinsCher, nomStation, verifierPrix,
  type FichierStations, type Releve, type Station,
} from "@/lib/stations";

// Leaflet a besoin du navigateur : la carte n'est jamais pré-rendue
const CarteStations = dynamic(() => import("./CarteStations").then((m) => m.CarteStations), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-2xl bg-surface" />,
});

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const RAYONS = [5, 10, 20];
const MAX_LISTE = 30;

const km = (n: number) => `${n.toLocaleString("fr-BE", { maximumFractionDigits: n < 10 ? 1 : 0 })} km`;

function plafondDuJour(serie: PointPrix[] | undefined, jour: string | null): number | null {
  if (!serie || !jour) return null;
  const passe = serie.filter((p) => p.date <= jour);
  return passe.length ? passe[passe.length - 1].prix : null;
}

function EtatCarburant({ s, code }: { s: Station; code: CodeProduit }) {
  const v = s.f?.[code];
  const nom = PRODUITS.find((p) => p.code === code)?.nom.replace("Essence ", "");
  if (v === 1) return <span className="text-muted">{nom} : vendu</span>;
  if (v === 0) return <span className="text-hausse">{nom} : non vendu</span>;
  return <span className="text-faint">{nom} : non renseigné</span>;
}

function LigneReleve({ r, plafond }: { r: Releve; plafond: number | null }) {
  const ecart = plafond !== null ? r.prix - plafond : null;
  return (
    <>
      <span className="chiffres font-semibold">{eurosLitre(r.prix)} €/L</span>
      <span className="text-faint"> · relevé personnel du {horodatage(r.le)}</span>
      {ecart !== null && Math.abs(ecart) >= 0.0005 && (
        <span className={ecart < 0 ? "text-baisse" : "text-hausse"}>
          {" "}({ecart < 0 ? "−" : "+"}{eurosLitre(Math.abs(ecart))} € {ecart < 0 ? "sous le" : "au-dessus du"} maximum)
        </span>
      )}
    </>
  );
}

function CarteStation({
  s, distance, carburant, plafond, choisie, choisir,
}: { s: Station; distance: number; carburant: CodeProduit; plafond: number | null; choisie: boolean; choisir: (id: string) => void }) {
  const [releves, modifierReleves] = useReleves();
  const [favoris, modifierFavoris] = useFavoris();
  const [saisie, setSaisie] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const favori = favoris.includes(s.id);
  const liste = historique(releves, s.id, carburant);
  const dernier = liste[0];
  const maintenant = new Date();

  const enregistrer = (e: FormEvent) => {
    e.preventDefault();
    const prix = lirePrix(saisie ?? "");
    const verif = verifierPrix(prix, plafond);
    if (!verif.ok) return setMessage(verif.message);
    const ok = modifierReleves((r) => [...r, { station: s.id, carburant, prix, le: new Date().toISOString() }]);
    setMessage(ok ? verif.message : "Impossible d'enregistrer sur cet appareil (navigation privée ?).");
    if (ok && !verif.message) setSaisie(null);
  };
  const supprimer = (r: Releve) => modifierReleves((tous) => tous.filter((x) => x !== r && !(x.station === r.station && x.le === r.le && x.carburant === r.carburant)));

  return (
    <li id={`station-${s.id}`} className={`rounded-2xl border bg-surface p-4 ${choisie ? "border-text/60" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <button className="text-left" onClick={() => choisir(s.id)}>
          <p className="text-sm font-medium">{nomStation(s)}</p>
          {s.m && s.n && s.m !== s.n && <p className="text-xs text-muted">{s.m}</p>}
          <p className="mt-1 text-xs text-faint">{[s.a || "Adresse non renseignée", km(distance)].join(" · ")}</p>
        </button>
        <button
          aria-pressed={favori}
          aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
          onClick={() => modifierFavoris((f) => (favori ? f.filter((id) => id !== s.id) : [...f, s.id]))}
          className={`text-xl leading-none ${favori ? "text-attente" : "text-faint"}`}
        >
          {favori ? "★" : "☆"}
        </button>
      </div>

      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <EtatCarburant s={s} code={carburant} />
        {s.h && <span className="text-faint">Horaires : {s.h === "24/7" ? "24 h/24, 7 j/7" : s.h}</span>}
      </p>

      <p className="mt-3 text-sm">
        {dernier ? (
          <>
            <LigneReleve r={dernier} plafond={plafond} />
            {!estRecent(dernier, maintenant) && <span className="text-attente"> · ancien (plus de 7 jours)</span>}
          </>
        ) : (
          <span className="text-faint">Aucun relevé de prix pour cette station.</span>
        )}
      </p>

      {saisie === null ? (
        <div className="mt-3 flex gap-2">
          <button onClick={() => { setSaisie(""); setMessage(""); }} className="rounded-lg bg-surface-2 px-3 py-2 text-xs font-medium">
            Noter un prix
          </button>
          <a
            href={`https://maps.apple.com/?daddr=${s.la},${s.lo}&q=${encodeURIComponent(nomStation(s))}`}
            target="_blank" rel="noopener noreferrer"
            className="rounded-lg bg-surface-2 px-3 py-2 text-xs font-medium"
          >
            Itinéraire
          </a>
        </div>
      ) : (
        <form onSubmit={enregistrer} className="mt-3 space-y-2">
          <label className="block text-xs text-muted">
            Prix affiché pour ton {PRODUITS.find((p) => p.code === carburant)?.nom} (€/L)
            <input
              autoFocus inputMode="decimal" placeholder="1,859" value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              className="chiffres mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-base text-text"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-baisse/20 px-3 py-2 text-xs font-medium text-baisse">Enregistrer</button>
            <button type="button" onClick={() => setSaisie(null)} className="rounded-lg bg-surface-2 px-3 py-2 text-xs">Annuler</button>
          </div>
        </form>
      )}
      {message && <p className="mt-2 text-xs text-attente">{message}</p>}

      {liste.length > 1 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-faint">Historique ({liste.length} relevés)</summary>
          <ul className="mt-2 space-y-1">
            {liste.map((r) => (
              <li key={r.le} className="flex items-baseline justify-between gap-2">
                <span><LigneReleve r={r} plafond={null} /></span>
                <button onClick={() => supprimer(r)} className="text-faint underline">Supprimer</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export function Stations({ prix }: { prix: PrixOfficiels }) {
  const [prefs] = usePreferences();
  const jour = useAujourdhui();
  const [releves] = useReleves();
  const [favoris] = useFavoris();
  const [centre, setCentre] = useDernierCentre();
  const [fichier, setFichier] = useState<FichierStations | null>(null);
  const [erreur, setErreur] = useState("");
  const [rayon, setRayon] = useState(10);
  const [marque, setMarque] = useState("");
  const [favorisSeuls, setFavorisSeuls] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [patience, setPatience] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [nombre, setNombre] = useState(MAX_LISTE);

  useEffect(() => {
    fetch(`${BASE}/donnees/stations.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((f: FichierStations) => (f.nombre ? setFichier(f) : setErreur("Fichier des stations vide.")))
      .catch(() => setErreur("Liste des stations indisponible (connexion ?)."));
  }, []);

  const placer = (c: Centre) => {
    setCentre(() => c);
    setSelection(null);
    setNombre(MAX_LISTE);
  };

  const localiser = () => {
    if (!navigator.geolocation) return setErreur("Localisation non disponible sur cet appareil.");
    setPatience("Localisation en cours…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPatience(""); setErreur(""); placer({ la: p.coords.latitude, lo: p.coords.longitude, nom: "ta position" }); },
      () => { setPatience(""); setErreur("Position refusée ou indisponible : cherche plutôt une commune ou un code postal."); },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  };

  const chercher = async (e: FormEvent) => {
    e.preventDefault();
    const q = recherche.trim();
    if (!q) return;
    setPatience("Recherche…");
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=be&limit=1&q=${encodeURIComponent(q)}`);
      const [lieu] = (await r.json()) as { lat: string; lon: string; display_name: string }[];
      if (!lieu) setErreur(`« ${q} » introuvable en Belgique.`);
      else {
        setErreur("");
        placer({ la: Number(lieu.lat), lo: Number(lieu.lon), nom: lieu.display_name.split(",").slice(0, 2).join(",") });
      }
    } catch {
      setErreur("Recherche indisponible (connexion ?).");
    }
    setPatience("");
  };

  const plafond = plafondDuJour(prix.ok ? prix.series[prefs.carburant] : undefined, jour);
  const nomCarburant = PRODUITS.find((p) => p.code === prefs.carburant)?.nom;

  const proches = useMemo(() => (fichier && centre ? autour(fichier.stations, centre, rayon) : []), [fichier, centre, rayon]);
  const marques = useMemo(() => [...new Set(proches.map((p) => p.station.m).filter(Boolean) as string[])].sort(), [proches]);
  const { filtrees, affichees, pointsCarte } = useMemo(() => {
    const f = proches.filter((p) => (!marque || p.station.m === marque) && (!favorisSeuls || favoris.includes(p.station.id)));
    const a = f.slice(0, nombre);
    return { filtrees: f, affichees: a, pointsCarte: a.map((p) => p.station) };
  }, [proches, marque, favorisSeuls, favoris, nombre]);
  const meilleur = moinsCher(releves, filtrees.map((p) => p.station.id), prefs.carburant, new Date());
  const stationMeilleure = meilleur && filtrees.find((p) => p.station.id === meilleur.station);

  const choisir = useCallback((id: string) => {
    setSelection(id);
    document.getElementById(`station-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
        {plafond !== null ? (
          <p>
            Prix maximum légal aujourd&apos;hui ({nomCarburant}) : <span className="chiffres font-semibold">{eurosLitre(plafond)} €/L</span>.
            <span className="text-muted"> Aucune station ne peut vendre plus cher ; beaucoup vendent moins cher.</span>
          </p>
        ) : (
          <p className="text-muted">Prix maximum du jour indisponible.</p>
        )}
        <p className="mt-2 text-xs text-faint">
          Aucune source publique ne donne le prix de chaque station en Belgique : les prix affichés ici sont uniquement tes relevés.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <button onClick={localiser} className="shrink-0 rounded-xl bg-surface-2 px-3 py-2 text-sm font-medium">Me localiser</button>
          <form onSubmit={chercher} className="flex min-w-0 flex-1 gap-2">
            <input
              value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Commune ou code postal"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-base"
            />
            <button type="submit" className="shrink-0 rounded-xl bg-surface-2 px-3 py-2 text-sm">OK</button>
          </form>
        </div>
        {(patience || erreur) && <p className={`text-xs ${erreur ? "text-attente" : "text-muted"}`}>{patience || erreur}</p>}
      </div>

      {!centre ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
          Choisis un point de départ : ta position (Safari te demandera l&apos;autorisation ; elle reste sur ton téléphone) ou une commune.
        </p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Rayon" className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
            {RAYONS.map((r) => (
              <button key={r} role="radio" aria-checked={rayon === r} onClick={() => { setRayon(r); setNombre(MAX_LISTE); }}
                className={`rounded-lg px-2 py-2 text-xs font-medium ${rayon === r ? "bg-surface-2 text-text" : "text-faint"}`}>
                {r} km
              </button>
            ))}
          </div>

          <CarteStations centre={centre} rayon={rayon} stations={pointsCarte} selection={selection} choisir={choisir} />

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">{filtrees.length} stations autour de {centre.nom}</span>
            <select value={marque} onChange={(e) => setMarque(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1 text-base">
              <option value="">Toutes enseignes</option>
              {marques.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <label className="flex items-center gap-1 text-muted">
              <input type="checkbox" checked={favorisSeuls} onChange={(e) => setFavorisSeuls(e.target.checked)} /> Favoris
            </label>
          </div>

          {meilleur && stationMeilleure && (
            <button onClick={() => choisir(meilleur.station)} className="rounded-2xl border border-baisse/40 bg-baisse/10 p-4 text-left text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-baisse">Moins cher parmi tes relevés récents</span>
              <span className="mt-1 block">{nomStation(stationMeilleure.station)} · {km(stationMeilleure.km)}</span>
              <span className="mt-1 block"><LigneReleve r={meilleur} plafond={plafond} /></span>
            </button>
          )}

          {fichier === null && !erreur && <div className="h-24 animate-pulse rounded-2xl bg-surface" />}
          <ul className="grid gap-3">
            {affichees.map((p) => (
              <CarteStation key={p.station.id} s={p.station} distance={p.km} carburant={prefs.carburant} plafond={plafond}
                choisie={selection === p.station.id} choisir={choisir} />
            ))}
          </ul>
          {filtrees.length > nombre && (
            <button onClick={() => setNombre((n) => n + MAX_LISTE)} className="rounded-xl bg-surface-2 py-2 text-sm">
              Afficher plus de stations
            </button>
          )}
          {fichier && filtrees.length === 0 && <p className="text-sm text-muted">Aucune station dans ce rayon avec ces filtres.</p>}
        </>
      )}

      {fichier && (
        <p className="text-xs leading-relaxed text-faint">
          Stations : © les contributeurs OpenStreetMap (ODbL), base du {horodatage(fichier.base_osm)}, mise à jour mensuelle. Fond de
          carte © OpenStreetMap. Recherche de commune : Nominatim (OpenStreetMap). Tes relevés et favoris restent dans Safari sur ce téléphone
          (effacés si tu supprimes les données de Safari).
        </p>
      )}
    </div>
  );
}
