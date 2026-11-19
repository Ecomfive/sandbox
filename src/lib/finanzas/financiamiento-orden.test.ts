import { test } from "node:test";
import assert from "node:assert/strict";
import { conFinanciamiento, costoEstimado, financiamientoPorOrden, repartirEntreOrdenes } from "./financiamiento-orden";
import type { MovGrupo } from "./prestamos-grupo";

const mov = (m: Partial<MovGrupo>): MovGrupo => ({ id: "x", acreedorId: "ort", deudorId: "pa", tipo: "prestamo", fecha: "2026-08-01", vence: null, monto: 1000, concepto: "c", ordenes: [], ...m });
const tasas = new Map([["ort", { tasaCiclo: 0.2, diasCiclo: 90 }]]);

test("reparte por FOB con centavos exactos, o en partes iguales si falta un FOB", () => {
  const r = repartirEntreOrdenes(100, ["ECOM-1", "ecom-2", "ECOM-3"], new Map([["ECOM-1", 1], ["ECOM-2", 1], ["ECOM-3", 1]]));
  assert.equal([...r.values()].reduce((a, b) => a + b, 0), 100);
  assert.ok([...r.values()].every((v) => v === 33.33 || v === 33.34));
  const f = repartirEntreOrdenes(100, ["ECOM-1", "ECOM-2"], new Map([["ECOM-1", 300], ["ECOM-2", 100]]));
  assert.deepEqual([...f], [["ECOM-1", 75], ["ECOM-2", 25]]);
  const sinFob = repartirEntreOrdenes(10, ["ECOM-1", "ECOM-2"], new Map([["ECOM-1", 300]]));
  assert.deepEqual([...sinFob.values()], [5, 5]);
});

test("estimado: monto × tasa × días ÷ días del ciclo; sin ciclo, una vez la tasa", () => {
  assert.equal(costoEstimado(mov({ vence: "2026-10-30" }), { tasaCiclo: 0.2, diasCiclo: 90 }, "2026-11-19"), 200);
  assert.equal(costoEstimado(mov({ vence: null }), { tasaCiclo: 0.2, diasCiclo: 90 }, "2026-09-15"), 100, "45 días de un ciclo de 90");
  assert.equal(costoEstimado(mov({ vence: "2026-09-15" }), { tasaCiclo: 0.2, diasCiclo: null }, "2026-11-19"), 200);
  assert.equal(costoEstimado(mov({ vence: "2026-07-01" }), { tasaCiclo: 0.2, diasCiclo: 90 }, "2026-11-19"), 0);
});

test("un costo cargado reemplaza el estimado del préstamo de las mismas OC", () => {
  const movs = [
    mov({ ordenes: ["ECOM-1", "ECOM-2"], vence: "2026-10-30", monto: 1000 }),
    mov({ tipo: "costo", ordenes: ["ECOM-2", "ECOM-1"], monto: 210 }),
    mov({ ordenes: ["ECOM-3"], vence: "2026-10-30", monto: 500 }),
    mov({ acreedorId: "alcides", ordenes: ["ECOM-4"], monto: 400 }),
  ];
  const r = financiamientoPorOrden(movs, tasas, new Map(), "2026-11-19");
  assert.deepEqual(r.get("ECOM-1"), { codigo: "ECOM-1", capital: 500, real: 105, estimado: 0, total: 105 });
  assert.equal(r.get("ECOM-3")?.estimado, 100);
  assert.equal(r.get("ECOM-4")?.total, 0, "un socio sin tasa no suma costo");
});

test("suma el financiamiento al costo por unidad sin tocar el costo puesto", () => {
  const por = new Map([["ECOM-1", { codigo: "ECOM-1", capital: 500, real: 100, estimado: 0, total: 100 }]]);
  const [c, d] = conFinanciamiento([{ codigo: "ecom-1", total: 1000, unidades: 100 }, { codigo: "ECOM-9", total: 50, unidades: 10 }], por);
  assert.equal(c.total, 1000);
  assert.equal(c.unitarioConFinanciamiento, 11);
  assert.equal(d.financiamiento, null);
  assert.equal(d.unitarioConFinanciamiento, 5);
});
