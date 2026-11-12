import assert from "node:assert/strict";
import { test } from "node:test";
import { diasEntre, leerPeriodo, parametrosPeriodo, periodoDe, rangoDeAtajo } from "./rango";

const HOY = "2026-11-12";

test("cada atajo da su rango contando desde hoy", () => {
  assert.deepEqual(rangoDeAtajo("hoy", HOY), { desde: HOY, hasta: HOY });
  assert.deepEqual(rangoDeAtajo("ayer", HOY), { desde: "2026-11-11", hasta: "2026-11-11" });
  assert.deepEqual(rangoDeAtajo("7", HOY), { desde: "2026-11-06", hasta: HOY });
  assert.deepEqual(rangoDeAtajo("30", HOY), { desde: "2026-10-14", hasta: HOY });
  assert.deepEqual(rangoDeAtajo("mes", HOY), { desde: "2026-11-01", hasta: HOY });
  assert.deepEqual(rangoDeAtajo("mes-pasado", HOY), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.deepEqual(rangoDeAtajo("mes-pasado", "2026-03-05"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(rangoDeAtajo("anio", HOY), { desde: "2026-01-01", hasta: HOY });
  assert.equal(diasEntre("2026-11-06", HOY), 7);
});

test("la dirección: atajos (también los viejos 7, 30 y 90), un rango y lo que no se entiende", () => {
  assert.deepEqual(leerPeriodo("90"), { tipo: "atajo", id: "90" });
  assert.deepEqual(leerPeriodo(undefined), { tipo: "atajo", id: "30" });
  assert.deepEqual(leerPeriodo("otro"), { tipo: "atajo", id: "30" });
  assert.deepEqual(leerPeriodo("rango", "2026-11-10", "2026-11-03"), { tipo: "rango", desde: "2026-11-03", hasta: "2026-11-10" });
  assert.deepEqual(leerPeriodo("rango", "x", "2026-11-03"), { tipo: "atajo", id: "30" });
  assert.deepEqual(parametrosPeriodo({ tipo: "atajo", id: "30" }), { periodo: null, desde: null, hasta: null });
  assert.deepEqual(parametrosPeriodo({ tipo: "rango", desde: "2026-11-03", hasta: HOY }), { periodo: "rango", desde: "2026-11-03", hasta: HOY });
});

test("la etiqueta del botón y un rango que no pasa de hoy", () => {
  assert.equal(periodoDe({ tipo: "atajo", id: "hoy" }, HOY).etiqueta, "Hoy");
  const r = periodoDe({ tipo: "rango", desde: "2026-11-03", hasta: "2026-12-30" }, HOY);
  assert.equal(r.hasta, HOY);
  assert.equal(r.dias, 10);
  assert.equal(r.etiqueta, "3 nov – 12 nov 2026");
  assert.equal(periodoDe({ tipo: "rango", desde: "2025-12-20", hasta: "2026-01-05" }, HOY).etiqueta, "20 dic 2025 – 5 ene 2026");
  assert.equal(periodoDe({ tipo: "rango", desde: HOY, hasta: HOY }, HOY).etiqueta, "12 nov 2026");
});
