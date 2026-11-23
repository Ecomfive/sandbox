import assert from "node:assert/strict";
import test from "node:test";
import { cpm, cvr, efectividad, nivelesDeMetricas, sinResultados, type Resultados } from "./metricas";

const r = (p: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...p });

// Una fila real de la hoja «Control de Testing» (Panamá, fila 7): CPM $4.20, 49.12 %, Hook 38.75 %, CTR 4.93 %, CPA $1.03, Gasto $14.46, 14 compras, CVR 16.67 %.
const FILA_7 = r({ gasto: 14.46, impresiones: 3443, clics: 170, video3s: 1334, vioLanding: 84, compras: 14 });

test("las cifras salen como en la hoja: CPM, % Efectividad (visitas ÷ clics) y CVR (compras ÷ visitas)", () => {
  assert.equal(Math.round((cpm(FILA_7) ?? 0) * 100) / 100, 4.2);
  assert.equal(Math.round((efectividad(FILA_7) ?? 0) * 10) / 10, 49.4);
  assert.equal(Math.round((cvr(FILA_7) ?? 0) * 100) / 100, 16.67);
  assert.equal(cpm(sinResultados()), null);
});

test("en testing el color sigue las escalas de la hoja", () => {
  const n = nivelesDeMetricas(FILA_7, "testing", 3);
  assert.deepEqual(n, { cpm: "medio", efectividad: "malo", hook: "medio", ctr: "bueno", cpa: "bueno", gasto: "neutral", compras: "neutral", cvr: "bueno" });
});

test("los extremos de cada escala cuentan como regular, como «entre» en la hoja", () => {
  const base = { impresiones: 10_000, clics: 300 };
  // CPM exactamente 3 y 5, CPA exactamente 2 y 4.
  assert.equal(nivelesDeMetricas(r({ ...base, gasto: 30, compras: 15 }), "testing", 3).cpm, "medio");
  assert.equal(nivelesDeMetricas(r({ ...base, gasto: 50, compras: 10 }), "testing", 3).cpm, "medio");
  assert.equal(nivelesDeMetricas(r({ ...base, gasto: 30, compras: 15 }), "testing", 3).cpa, "medio");
  assert.equal(nivelesDeMetricas(r({ ...base, gasto: 40, compras: 10 }), "testing", 3).cpa, "medio");
  // CTR exactamente 2 % y 3 %.
  assert.equal(nivelesDeMetricas(r({ impresiones: 1000, clics: 20 }), "testing", 3).ctr, "medio");
  assert.equal(nivelesDeMetricas(r({ impresiones: 1000, clics: 30 }), "testing", 3).ctr, "medio");
  assert.equal(nivelesDeMetricas(r({ impresiones: 1000, clics: 19 }), "testing", 3).ctr, "malo");
  assert.equal(nivelesDeMetricas(r({ impresiones: 1000, clics: 31 }), "testing", 3).ctr, "bueno");
});

test("el gasto solo se marca en rojo por encima de $24", () => {
  assert.equal(nivelesDeMetricas(r({ gasto: 24 }), "testing", 3).gasto, "neutral");
  assert.equal(nivelesDeMetricas(r({ gasto: 27.56 }), "testing", 3).gasto, "malo");
  assert.equal(nivelesDeMetricas(r({}), "testing", 3).gasto, "neutral");
});

test("una campaña de testing que gastó y no compró pone el CPA en rojo solo si ya pasó de $4 (la hoja usa el gasto como CPA)", () => {
  assert.equal(nivelesDeMetricas(r({ gasto: 24.38, compras: 0 }), "testing", 3).cpa, "malo");
  assert.equal(nivelesDeMetricas(r({ gasto: 3, compras: 0 }), "testing", 3).cpa, "neutral");
  assert.equal(nivelesDeMetricas(r({}), "testing", 3).cpa, "neutral");
});

test("escala y retargeting todavía no tienen rangos nuevos: conservan CPA frente a su tope, CTR y Hook, y el resto sin color", () => {
  const n = nivelesDeMetricas(FILA_7, "escala", 3);
  assert.equal(n.cpm, "neutral");
  assert.equal(n.efectividad, "neutral");
  assert.equal(n.cvr, "neutral");
  assert.equal(n.cpa, "bueno");
  assert.equal(n.ctr, "bueno");
  assert.equal(nivelesDeMetricas(FILA_7, null, 3).cpm, "neutral");
});
