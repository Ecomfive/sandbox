import { test } from "node:test";
import assert from "node:assert/strict";
import { efectoLineas, filaMovimiento, leerMonto, lineasDeAjuste, validarAjuste } from "./ajustes-cierre";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const T1 = "33333333-3333-4333-8333-333333333333";
const T2 = "44444444-4444-4444-8444-444444444444";

test("montos escritos", () => {
  assert.equal(leerMonto("1,250.50"), 1250.5);
  assert.equal(leerMonto("−300"), -300);
  assert.equal(leerMonto("$ 40"), 40);
  assert.equal(leerMonto("abc"), null);
});

test("validar un ajuste", () => {
  assert.ok("error" in validarAjuste({ clase: "nada" }));
  assert.ok("error" in validarAjuste({ clase: "otro", concepto: "x", unidad_id: U1, tipo_id: T1, monto: "0" }));
  const ok = validarAjuste({ clase: "provision", concepto: " Bono  anual ", unidad_id: U1, tipo_id: T1, monto: "500" });
  assert.ok(!("error" in ok));
  if (!("error" in ok)) assert.equal(ok.concepto, "Bono anual");
  assert.ok("error" in validarAjuste({ clase: "reclasificacion", concepto: "x", unidad_id: U1, tipo_id: T1, monto: "50" }), "destino igual");
  assert.ok("error" in validarAjuste({ clase: "reclasificacion", concepto: "x", unidad_id: U1, tipo_id: T1, tipo_destino_id: T2, monto: "-50" }));
});

test("una reclasificación son dos líneas que se compensan si los tipos tienen el mismo signo", () => {
  const e = validarAjuste({ clase: "reclasificacion", concepto: "Factura mal tipada", unidad_id: U1, tipo_id: T1, unidad_destino_id: U2, tipo_destino_id: T2, monto: "120" });
  assert.ok(!("error" in e));
  if ("error" in e) return;
  const l = lineasDeAjuste(e);
  assert.deepEqual(l.map((x) => [x.unidadId, x.tipoId, x.monto]), [[U1, T1, -120], [U2, T2, 120]]);
  assert.equal(efectoLineas(l, new Map([[T1, -1], [T2, -1]])), 0);
  const fila = filaMovimiento(l[0], 0, "aj", "2026-09-01", null, "2026-10-05");
  assert.equal(fila.origen, "ajuste_cierre");
  assert.equal(fila.en_flujo, false);
  assert.equal(fila.origen_clave, "ajuste:aj:1");
});

test("efecto de una provisión de gasto: baja el resultado", () => {
  assert.equal(efectoLineas([{ tipoId: T1, monto: 200 }], new Map([[T1, -1]])), -200);
});
