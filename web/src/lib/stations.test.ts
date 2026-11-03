// Lancement : node --test src/lib/stations.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { autour, distanceKm, lirePrix, moinsCher, verifierPrix, type Releve, type Station } from "./stations.ts";

const NAMUR = { la: 50.4669, lo: 4.8675 };
const LIEGE = { la: 50.6326, lo: 5.5797 };

test("distance Namur-Liège ≈ 53 km", () => {
  assert.ok(Math.abs(distanceKm(NAMUR, LIEGE) - 53) < 2);
});

test("stations dans le rayon, triées par distance", () => {
  const s: Station[] = [{ id: "loin", ...LIEGE }, { id: "pres", la: 50.47, lo: 4.87 }, { id: "moyen", la: 50.5, lo: 4.9 }];
  assert.deepEqual(autour(s, NAMUR, 10).map((x) => x.station.id), ["pres", "moyen"]);
});

test("moins cher : dernier relevé récent de chaque station seulement", () => {
  const maintenant = new Date("2026-11-03T12:00:00Z");
  const r: Releve[] = [
    { station: "a", carburant: "e10", prix: 1.799, le: "2026-10-20T08:00:00Z" }, // trop ancien
    { station: "a", carburant: "e10", prix: 1.899, le: "2026-11-02T08:00:00Z" },
    { station: "b", carburant: "e10", prix: 1.879, le: "2026-11-01T08:00:00Z" },
    { station: "b", carburant: "b7", prix: 1.5, le: "2026-11-01T08:00:00Z" }, // autre carburant
    { station: "c", carburant: "e10", prix: 1.7, le: "2026-11-03T08:00:00Z" }, // station hors liste
  ];
  assert.equal(moinsCher(r, ["a", "b"], "e10", maintenant)?.station, "b");
  assert.equal(moinsCher(r, ["a"], "e98", maintenant), null);
});

test("saisie et contrôle du prix", () => {
  assert.equal(lirePrix(" 1,859 "), 1.859);
  assert.equal(verifierPrix(18.59, 1.988).ok, false);
  assert.deepEqual(verifierPrix(1.859, 1.988), { ok: true, message: "" });
  assert.match(verifierPrix(1.999, 1.988).message, /maximum légal/);
});
