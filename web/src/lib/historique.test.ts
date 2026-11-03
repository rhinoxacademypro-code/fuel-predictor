// Lancement : node --test src/lib/historique.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { changements, exclureAberrations, parJourDeSemaine, parMois, parSemaine, type PointPrix } from "./historique.ts";

const serie = (debut: string, prix: number[]): PointPrix[] =>
  prix.map((p, i) => ({ date: new Date(Date.parse(`${debut}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), prix: p }));

test("pic aberrant de l'historique Brafco retiré (98, juillet 2020)", () => {
  const p = serie("2020-07-17", [1.449, 1.449, 1.449, 2.167, 2.167, 2.167, 1.426, 1.426]);
  const r = exclureAberrations(p);
  assert.deepEqual(r.exclus, [{ debut: "2020-07-20", fin: "2020-07-22", prix: 2.167 }]);
  assert.equal(r.points.length, 5);
  assert.deepEqual(changements(r.points, "2020-01-01").map((c) => Math.round(c.variation * 1000)), [-23]);
});

test("forte variation réelle conservée (diesel, mars 2022 : +20 c puis −21 c)", () => {
  const p = serie("2022-03-10", [1.9, 2.102, 2.102, 2.102, 2.102, 1.895]);
  assert.equal(exclureAberrations(p).exclus.length, 0);
});

test("hausses et baisses par jour d'entrée en vigueur (0 = lundi)", () => {
  // 2026-11-03 est un mardi, 2026-11-04 un mercredi
  const ch = changements(serie("2026-11-02", [2.0, 2.05, 2.01, 2.01]), "2019-01-01");
  const j = parJourDeSemaine(ch);
  assert.deepEqual([j[1].hausses, j[1].baisses, j[2].hausses, j[2].baisses], [1, 0, 0, 1]);
  assert.equal(j[0].variationMoyenne, null);
});

test("variation nette par mois, mois sans changement inclus", () => {
  const ch = [{ date: "2026-09-10", variation: 0.05 }, { date: "2026-09-20", variation: -0.02 }, { date: "2026-11-03", variation: -0.01 }];
  const m = parMois(ch, "2026-11-04", 3);
  assert.deepEqual(m.map((x) => x.mois), ["2026-09", "2026-10", "2026-11"]);
  assert.equal(Math.round(m[0].variationNette * 100), 3);
  assert.equal(m[1].hausses + m[1].baisses, 0);
});

test("une valeur par semaine : la dernière connue", () => {
  const s = parSemaine(serie("2026-11-02", [1, 2, 3, 4, 5, 6, 7, 8])); // lundi 2 -> lundi 9
  assert.deepEqual(s.map((p) => p.prix), [7, 8]);
});
