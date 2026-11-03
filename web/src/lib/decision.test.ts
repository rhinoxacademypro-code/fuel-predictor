// Lancement : node --test src/lib/decision.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decider, type Prevision } from "./decision.ts";

const base: Prevision = {
  produit: "b7", horizon: 1, date_cible: "2026-11-03", prix_reference: 2.452, certain: false, statut: "previsionnel",
  p_baisse: 0.05, p_stable: 0.9, p_hausse: 0.05, scenario: 0, variation_estimee: 0, amplitude: 0.03,
  intervalle_bas: 0, intervalle_haut: 0, confiance: 0.9, explication: "", emise_le: "2026-11-02T05:30:00+00:00",
  modele_version: "test",
};
const prev = (h: 1 | 2, champs: Partial<Prevision>): Prevision => ({ ...base, horizon: h, ...champs });
const AUJ = "2026-11-02";

test("aucune prévision : gris", () => {
  assert.equal(decider([], AUJ).couleur, "gris");
});

test("prévisions périmées : gris, même si une hausse est annoncée", () => {
  const v = decider([prev(1, { p_hausse: 0.9, p_stable: 0.1, emise_le: "2026-10-28T05:00:00Z" }), prev(2, { emise_le: "2026-10-28T05:00:00Z" })], AUJ);
  assert.equal(v.couleur, "gris");
  assert.match(v.raisons[0], /trop anciennes/);
});

test("hausse officielle publiée : vert, enjeu exact", () => {
  const v = decider([prev(1, { statut: "reel", certain: true, scenario: 1, variation_estimee: 0.04 }), prev(2, {})], AUJ);
  assert.equal(v.couleur, "vert");
  assert.equal(v.enjeuEuros?.toFixed(2), "2.00"); // 4 c × 50 L
});

test("baisse officielle publiée : orange", () => {
  const v = decider([prev(1, { statut: "reel", certain: true, scenario: -1, variation_estimee: -0.03 }), prev(2, {})], AUJ);
  assert.equal(v.couleur, "orange");
});

test("prix figé par le calendrier : gris", () => {
  const v = decider([prev(1, { certain: true }), prev(2, { certain: true })], AUJ);
  assert.equal(v.couleur, "gris");
  assert.match(v.raisons[0], /ne peut pas changer/);
});

test("hausse probable et enjeu suffisant : vert", () => {
  // 0,7 × 4 c × 50 L = 1,40 € ≥ 1 €
  const v = decider([prev(1, {}), prev(2, { p_hausse: 0.7, p_stable: 0.25, amplitude: 0.04 })], AUJ);
  assert.equal(v.couleur, "vert");
  assert.equal(v.enjeuEuros?.toFixed(2), "1.40");
});

test("hausse probable mais enjeu trop faible : gris", () => {
  // 0,7 × 1 c × 50 L = 0,35 € < 1 €
  const v = decider([prev(1, {}), prev(2, { p_hausse: 0.7, p_stable: 0.25, amplitude: 0.01 })], AUJ);
  assert.equal(v.couleur, "gris");
});

test("baisse probable à J+1 : orange avec avertissement de fiabilité", () => {
  const v = decider([prev(1, { p_baisse: 0.65, p_stable: 0.3, amplitude: 0.05 }), prev(2, {})], AUJ);
  assert.equal(v.couleur, "orange");
  assert.ok(v.raisons.some((r) => /moins fiable/.test(r)));
});

test("probabilité sous le seuil : gris", () => {
  const v = decider([prev(1, {}), prev(2, { p_hausse: 0.45, p_stable: 0.5, amplitude: 0.1 })], AUJ);
  assert.equal(v.couleur, "gris");
  assert.match(v.raisons[0], /sous ton seuil de 60/);
});

test("petit plein : le même scénario peut ne plus valoir la peine", () => {
  const p = [prev(1, {}), prev(2, { p_hausse: 0.7, p_stable: 0.25, amplitude: 0.04 })];
  const v = decider(p, AUJ, { quantite: 20, seuilEuros: 1, seuilProba: 0.6 }); // 0,56 €
  assert.equal(v.couleur, "gris");
  assert.match(v.raisons[0], /enjeu moyen reste faible/);
});
