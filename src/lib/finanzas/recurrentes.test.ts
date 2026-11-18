import assert from "node:assert/strict";
import test from "node:test";
import { claveRecurrente, fechaDelMes, leerDatosRecurrente, MAX_MESES_ATRAS, mesesPorGenerar, type PlantillaRecurrente } from "./recurrentes";

const base: PlantillaRecurrente = { id: "p", dia: 10, desde: "2026-09-01", hasta: null, ultimo_periodo: null, activo: true };

test("genera los meses que faltan y el mes en curso solo desde su día", () => {
  assert.deepEqual(mesesPorGenerar(base, "2026-11-09"), ["2026-09-01", "2026-10-01"]);
  assert.deepEqual(mesesPorGenerar(base, "2026-11-10"), ["2026-09-01", "2026-10-01", "2026-11-01"]);
});

test("sigue después del último generado y respeta «hasta» y activo", () => {
  assert.deepEqual(mesesPorGenerar({ ...base, ultimo_periodo: "2026-10-01" }, "2026-11-20"), ["2026-11-01"]);
  assert.deepEqual(mesesPorGenerar({ ...base, ultimo_periodo: "2026-11-01" }, "2026-11-20"), []);
  assert.deepEqual(mesesPorGenerar({ ...base, hasta: "2026-09-01" }, "2026-11-20"), ["2026-09-01"]);
  assert.deepEqual(mesesPorGenerar({ ...base, activo: false }, "2026-11-20"), []);
});

test("cruza el año y no va más atrás del tope", () => {
  assert.deepEqual(mesesPorGenerar({ ...base, ultimo_periodo: "2026-11-01" }, "2027-01-15"), ["2026-12-01", "2027-01-01"]);
  assert.equal(mesesPorGenerar({ ...base, desde: "2020-01-01" }, "2026-11-20").length, MAX_MESES_ATRAS + 1);
});

test("el día 31 en un mes corto cae en su último día", () => {
  assert.equal(fechaDelMes("2026-02-01", 31), "2026-02-28");
  assert.equal(fechaDelMes("2028-02-01", 30), "2028-02-29");
  assert.deepEqual(mesesPorGenerar({ ...base, dia: 31, desde: "2026-02-01" }, "2026-02-28"), ["2026-02-01"]);
  assert.equal(claveRecurrente("abc", "2026-02-01"), "recurrente:abc:2026-02");
});

test("valida la ficha", () => {
  const ok = { unidad_id: "11111111-1111-1111-1111-111111111111", tipo_id: "22222222-2222-2222-2222-222222222222", descripcion: " Alquiler  oficina ", monto: "1,200.50", dia: "5", desde: "2026-11", hasta: "", en_eerr: "si" };
  const d = leerDatosRecurrente((k) => (ok as Record<string, string>)[k]);
  assert.ok(!("error" in d));
  if (!("error" in d)) {
    assert.equal(d.descripcion, "Alquiler oficina");
    assert.equal(d.monto, 1200.5);
    assert.equal(d.desde, "2026-11-01");
    assert.equal(d.hasta, null);
    assert.equal(d.en_eerr, true);
  }
  assert.ok("error" in leerDatosRecurrente((k) => ({ ...ok, dia: "32" } as Record<string, string>)[k]));
  assert.ok("error" in leerDatosRecurrente((k) => ({ ...ok, hasta: "2026-10" } as Record<string, string>)[k]));
  assert.ok("error" in leerDatosRecurrente((k) => ({ ...ok, monto: "0" } as Record<string, string>)[k]));
});
