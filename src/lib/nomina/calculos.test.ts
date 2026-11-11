import assert from "node:assert/strict";
import test from "node:test";
import {
  calcularExterna,
  calcularFormal,
  cuadra,
  horaNormalExterna,
  horaRata,
  HORAS_MES,
  minutosHoraExtra,
  minutosTardanzaADescontar,
  type EntradaFormal,
} from "./calculos";

const BASE: EntradaFormal = {
  salarioMensual: 800,
  horasMes: 195,
  horasTrabajadas: 97.5,
  horasExtra: 0,
  tardanzaHoras: 0,
  ausenciaDias: 0,
  ausenciaHoras: 0,
  montoFeriado: 0,
  horasExtraFeriado: 0,
  montoHorasExtraFeriado: 0,
  bono: 0,
  descuentoAplicado: 0,
  descuentoAntesDeSeguros: true,
  aplicaSeguros: true,
};

test("hora rata y horas del mes de la planilla", () => {
  assert.equal(HORAS_MES, 45 * 4.3333);
  assert.ok(cuadra(horaRata(1100, HORAS_MES), 5.641069));
  assert.equal(horaRata(800, 195), 800 / 195);
  assert.equal(horaRata(800, 0), 0);
});

test("una quincena sin novedades: la mitad del salario, menos 9,75 % y 1,25 %", () => {
  const c = calcularFormal(BASE);
  assert.equal(c.devengado, 400);
  assert.equal(c.totalBruto, 400);
  assert.equal(c.seguroSocial, 39);
  assert.equal(c.seguroEducativo, 5);
  assert.equal(c.neto, 356);
});

test("quien no cotiza cobra el total asignaciones", () => {
  const c = calcularFormal({ ...BASE, aplicaSeguros: false });
  assert.equal(c.seguroSocial, 0);
  assert.equal(c.neto, 400);
});

test("horas extra ×1,25, feriado y horas extra en feriado ×1,5, bono", () => {
  const rata = 800 / 195;
  const c = calcularFormal({ ...BASE, horasExtra: 2, montoFeriado: 30, horasExtraFeriado: 1, bono: 150, aplicaSeguros: false });
  assert.equal(c.montoHorasExtra, Math.round(2 * rata * 1.25 * 100) / 100);
  assert.equal(c.montoHorasExtraFeriado, Math.round(rata * 1.5 * 100) / 100);
  assert.ok(cuadra(c.totalBruto, 400 + 2 * rata * 1.25 + 30 + rata * 1.5 + 150));
  // Sin horas, vale el monto que trae el Excel.
  assert.equal(calcularFormal({ ...BASE, montoHorasExtraFeriado: 12.34 }).montoHorasExtraFeriado, 12.34);
});

test("tardanza en horas y ausencia en días (pago por día = 7,5 h) o en horas", () => {
  const rata = 800 / 195;
  const c = calcularFormal({ ...BASE, tardanzaHoras: 106 / 60, ausenciaDias: 1, aplicaSeguros: false });
  assert.equal(c.descuentoTardanza, Math.round((106 / 60) * rata * 100) / 100);
  assert.equal(c.descuentoAusencia, Math.round(7.5 * rata * 100) / 100);
  assert.ok(cuadra(c.neto, 400 - (106 / 60) * rata - 7.5 * rata));
  assert.equal(calcularFormal({ ...BASE, ausenciaHoras: 4 }).descuentoAusencia, Math.round(4 * rata * 100) / 100);
});

test("descuento aplicado antes o después de los seguros", () => {
  const antes = calcularFormal({ ...BASE, descuentoAplicado: 100 });
  assert.equal(antes.totalBruto, 300);
  assert.equal(antes.neto, 300 - 29.25 - 3.75);
  const despues = calcularFormal({ ...BASE, descuentoAplicado: 100, descuentoAntesDeSeguros: false });
  assert.equal(despues.totalBruto, 400);
  assert.equal(despues.neto, 256);
});

test("política de la hoja CALCULOS: 15 minutos de tolerancia", () => {
  assert.equal(minutosTardanzaADescontar(15), 0);
  assert.equal(minutosTardanzaADescontar(16), 16);
  assert.equal(minutosTardanzaADescontar(22), 22);
  assert.equal(minutosHoraExtra(52), 37);
  assert.equal(minutosHoraExtra(10), 0);
});

test("nómina externa: hora normal = sueldo ÷ 26 ÷ 9, total = sueldo + extras + bono", () => {
  assert.equal(horaNormalExterna(234), 1);
  const c = calcularExterna({ sueldo: 234, horasExtra: 3.5, horaNormal: null, bono: 20 });
  assert.equal(c.montoHorasExtra, 3.5);
  assert.equal(c.total, 257.5);
  // Con una hora normal fija (pagos parciales sobre la base mensual).
  assert.equal(calcularExterna({ sueldo: 100, horasExtra: 2, horaNormal: 0.5, bono: 0 }).total, 101);
});
