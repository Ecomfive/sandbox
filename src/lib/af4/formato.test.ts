import assert from "node:assert/strict";
import { test } from "node:test";
import { MENOS, dinero, dineroCompacto, dineroKpi, dias, entero, fraccion, numero, porcentaje, puntos, signoDe, veces } from "./formato";
import { diaMes, fechaCorta, fechaHora, hoyPanama, leerPeriodo, mesCorto, mesEnCursoPanama, mesLargo, mesMedio, rangoMeses, sumarMeses, ultimosMeses } from "./fecha";
import { calcularVariacion, textoLectorVariacion, textoVariacion, tonoVariacion } from "./variacion";

import { dinero2 } from "./formato";

// Se corre con: npm run test:seguridad (incluye src/lib/af4/*.test.ts)

test("dinero: dólares sin decimales, con separador de miles y signo menos tipográfico", () => {
  assert.equal(dinero(1234567.4), "$1,234,567");
  assert.equal(dinero(-1234.6), `${MENOS}$1,235`);
  assert.equal(dinero(12.5, "USD", { decimales: 2 }), "$12.50");
  // Costos unitarios: dos decimales como mínimo y hasta cuatro si hacen falta.
  assert.equal(dinero(1.25, "USD", { decimales: 2, decimalesMax: 4 }), "$1.25");
  assert.equal(dinero(0.0375, "USD", { decimales: 2, decimalesMax: 4 }), "$0.0375");
  assert.equal(dinero(-2.12345, "USD", { decimales: 2, decimalesMax: 4 }), `${MENOS}$2.1235`);
  assert.equal(dinero(null), "—");
  assert.equal(dinero(Number.NaN), "—");
});

test("dinero: medio centavo cuenta como cero (nunca «−$0») y vacioSiCero da «—»", () => {
  assert.equal(dinero(-0.001), "$0");
  assert.equal(dinero(0.004, "USD", { vacioSiCero: true }), "—");
  assert.equal(dinero(5, "USD", { vacioSiCero: true }), "$5");
});

test("dinero: con signo para variaciones; colones con el locale de Costa Rica; USDT con sufijo", () => {
  assert.equal(dinero(1200, "USD", { conSigno: true }), "+$1,200");
  assert.equal(dinero(-1200, "USD", { conSigno: true }), `${MENOS}$1,200`);
  assert.equal(dinero(0, "USD", { conSigno: true }), "$0");
  assert.ok(dinero(-3400000, "CRC").startsWith(`${MENOS}₡`));
  assert.equal(dinero(10, "USDT"), "$10 USDT");
});

test("dineroCompacto: abrevia desde mil y no abrevia debajo", () => {
  assert.equal(dineroCompacto(12345), "$12.3\u00a0K");
  assert.equal(dineroCompacto(-1234567), `${MENOS}$1.2\u00a0M`);
  assert.equal(dineroCompacto(850), "$850");
  assert.equal(dineroCompacto(null), "—");
});

test("dineroKpi: completo hasta diez millones, compacto encima", () => {
  assert.equal(dineroKpi(9_999_999), "$9,999,999");
  assert.equal(dineroKpi(12_500_000), "$12.5\u00a0M");
});

test("porcentajes, puntos, enteros, días y veces", () => {
  assert.equal(porcentaje(28.44), "28.4 %");
  assert.equal(porcentaje(-3.25, { conSigno: true }), `${MENOS}3.3 %`);
  assert.equal(porcentaje(12, { conSigno: true }), "+12.0 %");
  assert.equal(porcentaje(null), "—");
  assert.equal(fraccion(0.873), "87.3 %");
  assert.equal(puntos(1.24), "+1.2 pp");
  assert.equal(puntos(-0.4), `${MENOS}0.4 pp`);
  assert.equal(entero(1234.6), "1,235");
  assert.equal(numero(2.456, 2), "2.46");
  assert.equal(dias(1), "1 día");
  assert.equal(dias(42.4), "42 días");
  assert.equal(veces(3.25), "3.3×");
  assert.equal(signoDe(-2), "negativo");
  assert.equal(signoDe(0.001), "cero");
});

test("fechas: hoy y el mes en curso en la hora de Panamá", () => {
  // 03:00 UTC del 1 de octubre todavía es 30 de septiembre en Panamá (UTC−5).
  const ahora = new Date("2026-10-01T03:00:00Z");
  assert.equal(hoyPanama(ahora), "2026-09-30");
  assert.equal(mesEnCursoPanama(ahora), "2026-09-01");
});

test("fechas: meses y días en español", () => {
  assert.equal(mesCorto("2026-09-01"), "sep 26");
  assert.equal(mesMedio("2026-09-01"), "Sep 2026");
  assert.equal(mesLargo("2026-09-01"), "septiembre de 2026");
  assert.equal(fechaCorta("2026-09-04"), "4 sep 2026");
  assert.equal(diaMes("2026-09-14"), "14 sep");
  assert.equal(fechaHora("2026-10-23T15:05:00Z"), "23 oct 2026, 10:05");
  assert.equal(fechaHora("no es fecha"), "—");
  assert.equal(rangoMeses(["2026-08-01", "2025-09-01", "2026-01-01"]), "sep 25 – ago 26");
  assert.equal(rangoMeses(["2026-08-01"]), "ago 26");
  assert.equal(rangoMeses([]), "—");
});

test("fechas: sumar meses, últimos meses y leer un período", () => {
  assert.equal(sumarMeses("2026-01-01", -1), "2025-12-01");
  assert.equal(sumarMeses("2025-12-01", 1), "2026-01-01");
  assert.equal(sumarMeses("2026-03-01", -14), "2025-01-01");
  assert.deepEqual(ultimosMeses("2026-02-15", 3), ["2025-12-01", "2026-01-01", "2026-02-01"]);
  assert.equal(leerPeriodo("2026-09"), "2026-09-01");
  assert.equal(leerPeriodo("2026-09-01"), "2026-09-01");
  assert.equal(leerPeriodo("2026-13"), null);
  assert.equal(leerPeriodo(["2026-09"]), null);
});

test("variación: dirección, juicio según el sentido y textos", () => {
  const v = calcularVariacion(1124, 1000);
  assert.equal(v.direccion, "sube");
  assert.equal(v.favorable, true);
  assert.equal(textoVariacion(v), "+12.4 %");
  assert.equal(tonoVariacion(v), "success");
  assert.equal(textoLectorVariacion(v, "agosto"), "Sube 12.4 % frente a agosto, favorable");

  const gasto = calcularVariacion(1124, 1000, "menos-es-mejor");
  assert.equal(gasto.favorable, false);
  assert.equal(tonoVariacion(gasto), "destructive");

  const neutro = calcularVariacion(900, 1000, "neutro");
  assert.equal(neutro.direccion, "baja");
  assert.equal(neutro.favorable, null);
});

test("variación: referencia negativa, cero e igual", () => {
  // De −100 a −50 mejora (sube) aunque los dos sean negativos.
  const v = calcularVariacion(-50, -100);
  assert.equal(v.direccion, "sube");
  assert.equal(v.pct, 50);
  const sinBase = calcularVariacion(500, 0);
  assert.equal(sinBase.pct, null);
  assert.equal(textoVariacion(sinBase), "+$500");
  const igual = calcularVariacion(1000.0001, 1000);
  assert.equal(igual.direccion, "igual");
  assert.equal(igual.favorable, null);
  assert.equal(textoLectorVariacion(igual, "el presupuesto"), "Sin cambio frente a el presupuesto");
  assert.equal(textoVariacion(calcularVariacion(31.2, 30), "puntos"), "+1.2 pp");
});

test("dinero2: montos con centavos (nómina, recibos, cierres de caja), en USD o USDT", () => {
  assert.equal(dinero2(12.5), "$12.50");
  assert.equal(dinero2(-1234.567), `${MENOS}$1,234.57`);
  assert.equal(dinero2(0.004), "$0.00");
  assert.equal(dinero2(0, "USD", { vacioSiCero: true }), "—");
  assert.equal(dinero2(250, "USDT"), "$250.00 USDT");
  assert.equal(dinero2(null), "—");
});
