import assert from "node:assert/strict";
import { test } from "node:test";
import { capitalTrabajoOperativo, leerDias, necesidadCapitalTrabajo, type InsumosCrecimiento } from "./capital-crecimiento";

test("capital de trabajo operativo por días", () => {
  // Ventas 36 500/mes → 1 200/día; costo 18 250/mes → 600/día.
  assert.equal(capitalTrabajoOperativo(36_500, 18_250, 10, 30, 20), 1_200 * 10 + 600 * 30 - 600 * 20);
  assert.equal(capitalTrabajoOperativo(0, 0, 10, 30, 20), 0);
});

const base: InsumosCrecimiento = {
  ventasMes: 36_500,
  costoMes: 18_250,
  dso: 10,
  dio: 30,
  dpo: 20,
  crecimiento: 0.3,
  meses: 12,
  margenEbitda: 0,
  servicioDeuda: [],
  cajaDisponible: 0,
  deudaDisponible: 0,
};

test("crecer 30 % exige el 30 % más de capital de trabajo", () => {
  const r = necesidadCapitalTrabajo(base);
  assert.equal(r.filas.length, 12);
  assert.equal(r.capitalTrabajoHoy, 18_000);
  assert.ok(Math.abs(r.requerido - 18_000 * 0.3) < 1);
  assert.ok(Math.abs(r.filas.at(-1)!.ventas - 36_500 * 1.3) < 0.01);
  assert.equal(r.alcanza, false);
  assert.equal(r.mesFalta, 1);
  assert.ok(Math.abs(r.falta - 5_400) < 1);
  assert.equal(r.ciclo, 20);
});

test("con caja generada y líneas libres alcanza", () => {
  const r = necesidadCapitalTrabajo({ ...base, margenEbitda: 0.05, servicioDeuda: Array(12).fill(500), cajaDisponible: 1_000, deudaDisponible: 2_000 });
  assert.equal(r.alcanza, true);
  assert.equal(r.falta, 0);
  assert.equal(r.mesFalta, null);
  assert.ok(r.cajaGenerada > 0);
  // Sin las líneas también (la caja generada cubre).
  assert.equal(r.alcanzaSinDeuda, true);
  const sinLineas = necesidadCapitalTrabajo({ ...base, margenEbitda: 0, cajaDisponible: 3_000, deudaDisponible: 3_000 });
  assert.equal(sinLineas.alcanza, true);
  assert.equal(sinLineas.alcanzaSinDeuda, false);
});

test("sin crecer no exige nada", () => {
  const r = necesidadCapitalTrabajo({ ...base, crecimiento: 0 });
  assert.equal(r.requerido, 0);
  assert.equal(r.alcanza, true);
});

test("leerDias", () => {
  assert.equal(leerDias("45"), 45);
  assert.equal(leerDias("12,5"), 12.5);
  assert.equal(leerDias(""), null);
  assert.equal(leerDias("-3"), null);
  assert.equal(leerDias("1000"), null);
});
