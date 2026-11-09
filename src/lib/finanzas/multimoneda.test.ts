// Libro de Costa Rica inventado (migración 0923): lectura con su moneda y flujo con cuentas en colones.
import assert from "node:assert/strict";
import test from "node:test";
import { leerLibro, leerMoneda, type Celda } from "./libro-excel";
import { filasEstadoFlujo, resumirFlujo, type FilaFlujo } from "./flujo";
import type { TasaMes } from "./entidades";

const TITULOS = ["MES", "TIENDA", "TIPO", "DESCRIPCIÓN", "EERR?", "FLUJO ?"];
const libroCr = (tituloMonto: string, conMoneda = false): Celda[][] => [
  ["LIBRO INVENTADO"],
  [...TITULOS, tituloMonto, ...(conMoneda ? ["MONEDA"] : [])],
  ["1-2026", "TIENDA UNO", "Ingresos", "Venta del mes", "SI", "SI", 1_000_000, ...(conMoneda ? ["CRC"] : [])],
  ["1-2026", "A DISTRIBUIR", "Oficina - ARRIENDO", "Alquiler", "SI", "SI", 40_000, ...(conMoneda ? [null] : [])],
  ["2-2026", "TIENDA DOS", "SISTEMAS", "Suscripción", "SI", "SI", 50, ...(conMoneda ? ["USD"] : [])],
];

test("el libro de Costa Rica se lee en su moneda (opción, título del monto o columna MONEDA)", () => {
  const conOpcion = leerLibro(libroCr("USD"), "GASTOS_COSTA_RICA_2026.xlsx", { moneda: "CRC" }).movimientos;
  assert.deepEqual(conOpcion.map((m) => m.moneda), ["CRC", "CRC", "CRC"]);
  assert.deepEqual(conOpcion.map((m) => m.monto), [1_000_000, 40_000, 50]);
  const porTitulo = leerLibro(libroCr("CRC"), "GASTOS_COSTA_RICA_2026.xlsx").movimientos;
  assert.deepEqual(porTitulo.map((m) => m.moneda), ["CRC", "CRC", "CRC"]);
  const porColumna = leerLibro(libroCr("MONTO", true), "GASTOS_COSTA_RICA_2026.xlsx", { moneda: "CRC" }).movimientos;
  assert.deepEqual(porColumna.map((m) => m.moneda), ["CRC", "CRC", "USD"], "la columna MONEDA gana; vacía, la del libro");
  // Sin nada que diga otra cosa: dólares, como el libro de Panamá.
  assert.deepEqual(leerLibro(libroCr("USD"), "x.xlsx").movimientos.map((m) => m.moneda), ["USD", "USD", "USD"]);
});

test("la huella de un movimiento en dólares no cambia; en otra moneda lleva la moneda", () => {
  const usd = leerLibro(libroCr("USD"), "x.xlsx").movimientos;
  const usdOtraVez = leerLibro(libroCr("USD"), "x.xlsx", { moneda: "USD" }).movimientos;
  const crc = leerLibro(libroCr("USD"), "x.xlsx", { moneda: "CRC" }).movimientos;
  assert.deepEqual(usd.map((m) => m.origen_clave), usdOtraVez.map((m) => m.origen_clave));
  assert.ok(usd.every((m, i) => m.origen_clave !== crc[i].origen_clave), "el mismo número en colones es otro movimiento");
  assert.ok(crc.every((m) => /^[0-9a-f]{24}#\d+$/.test(m.origen_clave)));
});

test("leerMoneda", () => {
  assert.equal(leerMoneda("crc"), "CRC");
  assert.equal(leerMoneda("₡"), "CRC");
  assert.equal(leerMoneda("$"), "USD");
  assert.equal(leerMoneda("Colones"), "CRC");
  assert.equal(leerMoneda("dólar estadounidense"), null);
  assert.equal(leerMoneda(null), null);
});

// ---------------------------------------------------------------------------------------------
// Flujo con una cuenta en colones: su saldo se valora al cierre y lo demás es diferencia de cambio
// ---------------------------------------------------------------------------------------------
const TASAS: TasaMes[] = [
  { moneda: "CRC", periodo: "2026-01-01", promedio: 500, cierre: 510 },
  { moneda: "CRC", periodo: "2026-02-01", promedio: 520, cierre: 530 },
];
const MESES = ["2026-01-01", "2026-02-01"];
const fila = (mes: string, cuenta: string, sentido: "entrada" | "salida", monto: number, montoCuenta: number): FilaFlujo => ({
  mes,
  cuenta_id: cuenta,
  tipo: sentido === "entrada" ? "Ingresos" : "SISTEMAS",
  orden: 1,
  bloque: "operativo",
  sentido,
  monto,
  monto_cuenta: montoCuenta,
});
// En USD: el banco de CR cobra 1.020.000 CRC en enero (2.040 USD al promedio) y paga 52.000 CRC en febrero (100 USD).
const FILAS: FilaFlujo[] = [
  fila("2026-01-01", "banco-cr", "entrada", 2040, 1_020_000),
  fila("2026-02-01", "banco-cr", "salida", 100, 52_000),
  fila("2026-01-01", "banco-pa", "entrada", 500, 500),
];
const CUENTAS = [
  { id: "banco-cr", nombre: "BANCO CR", clase: "banco" },
  { id: "banco-pa", nombre: "BANCO PA", clase: "banco" },
];
// Saldo inicial de enero: 510.000 CRC (en colones, la moneda de la cuenta) y 1.000 USD.
const SALDOS = [
  { cuenta_id: "banco-cr", fecha: "2026-01-01", monto: 510_000 },
  { cuenta_id: "banco-pa", fecha: "2026-01-01", monto: 1000 },
];

test("consolidado en USD: la cuenta en colones al cierre de cada mes y la diferencia de cambio aparte", () => {
  const r = resumirFlujo(FILAS, SALDOS, CUENTAS, MESES, { moneda: "USD", monedaCuenta: { "banco-cr": "CRC" }, tasas: TASAS });
  const cr = r.cuentas.find((c) => c.id === "banco-cr")!;
  assert.equal(cr.nombre, "BANCO CR · CRC");
  // Enero: inicial 510.000 / 510 (el cierre de diciembre no está: se usa el de enero) = 1.000; final 1.530.000 / 510 = 3.000.
  assert.equal(cr.inicial["2026-01-01"], 1000);
  assert.equal(cr.final["2026-01-01"], 3000);
  assert.equal(cr.diferencia!["2026-01-01"], -40, "3.000 − 1.000 − 2.040");
  // Febrero: inicial = final de enero (3.000); final 1.478.000 / 530 = 2.788,68.
  assert.equal(cr.inicial["2026-02-01"], 3000);
  assert.equal(cr.final["2026-02-01"], 2788.68);
  assert.equal(cr.diferencia!["2026-02-01"], -111.32, "2.788,68 − 3.000 + 100");
  // La cuenta en dólares no cambia.
  const pa = r.cuentas.find((c) => c.id === "banco-pa")!;
  assert.equal(pa.final["2026-01-01"], 1500);
  assert.equal(pa.diferencia, undefined);
  // Caja final = caja inicial + flujo neto + diferencia de cambio, mes a mes.
  for (const m of MESES) assert.equal(Math.round((r.caja.inicial[m] + r.estado.neto[m] + r.diferenciaCambio[m]) * 100) / 100, r.caja.final[m]);
  assert.deepEqual(r.diferenciaCambio, { "2026-01-01": -40, "2026-02-01": -111.32 });
  const filas = filasEstadoFlujo(r.estado, r.caja, r.diferenciaCambio);
  assert.ok(filas.some((f) => f.clave === "diferencia-cambio"));
});

test("sin cuentas en otra moneda todo queda como antes (ni diferencia ni línea nueva)", () => {
  const soloUsd = FILAS.filter((f) => f.cuenta_id === "banco-pa");
  const antes = resumirFlujo(soloUsd, SALDOS.slice(1), CUENTAS, MESES);
  const ahora = resumirFlujo(soloUsd, SALDOS.slice(1), CUENTAS, MESES, { moneda: "USD", monedaCuenta: {}, tasas: TASAS });
  assert.deepEqual(ahora, antes);
  assert.ok(!filasEstadoFlujo(ahora.estado, ahora.caja, ahora.diferenciaCambio).some((f) => f.clave === "diferencia-cambio"));
});

test("Costa Rica en colones: la cuenta en dólares es la que tiene diferencia de cambio", () => {
  // Las filas en la moneda de la entidad (monto = colones al promedio), la de la cuenta en dólares en su moneda.
  const filas: FilaFlujo[] = [fila("2026-01-01", "usd-cr", "entrada", 50_000, 100), fila("2026-02-01", "usd-cr", "salida", 0, 0)];
  const r = resumirFlujo(filas, [{ cuenta_id: "usd-cr", fecha: "2026-01-01", monto: 100 }], [{ id: "usd-cr", nombre: "CUENTA USD", clase: "banco" }], MESES, {
    moneda: "CRC",
    monedaCuenta: { "usd-cr": "USD" },
    tasas: TASAS,
  });
  const c = r.cuentas.find((x) => x.id === "usd-cr")!;
  assert.equal(c.inicial["2026-01-01"], 51_000, "100 USD × 510");
  assert.equal(c.final["2026-01-01"], 102_000, "200 USD × 510");
  assert.equal(c.diferencia!["2026-01-01"], 1_000, "102.000 − 51.000 − 50.000");
  assert.equal(c.diferencia!["2026-02-01"], 4_000, "200 × 530 − 102.000");
});

test("sin ninguna tasa para la moneda de la cuenta: solo su flujo, sin saldo ni diferencia", () => {
  const r = resumirFlujo(FILAS, SALDOS, CUENTAS, MESES, { moneda: "USD", monedaCuenta: { "banco-cr": "CRC" }, tasas: [] });
  const cr = r.cuentas.find((c) => c.id === "banco-cr")!;
  assert.equal(cr.conSaldo, false);
  assert.equal(cr.final["2026-01-01"], 2040);
  assert.equal(cr.diferencia!["2026-01-01"], 0);
});
