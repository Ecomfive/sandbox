import { test } from "node:test";
import assert from "node:assert/strict";
import { alertasFiscales, estadoObligacion, filasCalendario, validarObligacion, vencimiento, type Obligacion } from "./calendario-fiscal";

const itbms: Obligacion = { id: "1", clave: "itbms", nombre: "ITBMS", entidad: "DGI", periodicidad: "mensual", dia: 15, mes: null, anioSiguiente: true, diasAviso: 5, activo: true };
const renta: Obligacion = { id: "2", clave: "renta-anual", nombre: "Renta", entidad: "DGI", periodicidad: "anual", dia: 31, mes: 3, anioSiguiente: true, diasAviso: 30, activo: true };

test("vencimientos con traslado al día hábil", () => {
  // Septiembre 2026 → 15 oct 2026 (jueves).
  assert.equal(vencimiento(itbms, "2026-09-01"), "2026-10-15");
  // Octubre 2026 → 15 nov 2026 es domingo → lunes 16.
  assert.equal(vencimiento(itbms, "2026-10-01"), "2026-11-16");
  // Diciembre → enero del año siguiente.
  assert.equal(vencimiento(itbms, "2026-12-01"), "2027-01-15");
  // Renta 2026 → 31 mar 2027 (miércoles).
  assert.equal(vencimiento(renta, "2026-01-01"), "2027-03-31");
  // Día 31 en un mes de 30.
  assert.equal(vencimiento({ ...itbms, dia: 31 }, "2026-08-01"), "2026-09-30");
});

test("estado", () => {
  assert.equal(estadoObligacion("2026-10-15", false, "2026-10-20", 5).estado, "vencida");
  assert.equal(estadoObligacion("2026-10-15", false, "2026-10-12", 5).estado, "por_vencer");
  assert.equal(estadoObligacion("2026-10-15", false, "2026-10-01", 5).estado, "pendiente");
  assert.equal(estadoObligacion("2026-10-15", true, "2026-10-20", 5).estado, "presentada");
});

test("calendario y avisos", () => {
  const filas = filasCalendario([itbms, renta], [{ obligacionId: "1", periodo: "2026-08-01", presentadoEn: "2026-09-14", referencia: null, monto: null }], "2026-10-13");
  const sep = filas.find((f) => f.obligacion.clave === "itbms" && f.periodo === "2026-09-01")!;
  assert.equal(sep.estado, "por_vencer");
  assert.equal(filas.find((f) => f.periodo === "2026-08-01")?.estado, "presentada");
  // Julio vencido y sin presentar (15 ago → 17 ago lunes) sigue apareciendo.
  assert.equal(filas.find((f) => f.obligacion.clave === "itbms" && f.periodo === "2026-07-01")?.estado, "vencida");
  const a = alertasFiscales(filas);
  assert.ok(a.some((x) => x.clave === "fiscal:itbms:2026-09" && x.severidad === "aviso"));
  assert.ok(a.some((x) => x.clave === "fiscal:itbms:2026-07" && x.severidad === "critica"));
  assert.ok(!a.some((x) => x.clave === "fiscal:itbms:2026-08"));
});

test("validar una obligación", () => {
  assert.ok("error" in validarObligacion({ dia: "40", dias_aviso: "5" }, "mensual"));
  assert.ok("error" in validarObligacion({ dia: "15", dias_aviso: "5" }, "anual"));
  assert.deepEqual(validarObligacion({ dia: "15", dias_aviso: "5", mes: "7", activo: "on" }, "anual"), { dia: 15, mes: 7, dias_aviso: 5, activo: true });
});
