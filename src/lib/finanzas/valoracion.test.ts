import assert from "node:assert/strict";
import test from "node:test";
import {
  VALORACION_PREDETERMINADA,
  anualDeMensual,
  anualizarBase,
  calcularDcf,
  crecimientoInicial,
  leerValoracion,
  multiploImplicito,
  rangoValor,
  sensibilidadDcf,
  validarValoracion,
  valoracionAGuardar,
  type BaseDcf,
} from "./valoracion";

// Datos inventados.
const BASE: BaseDcf = { ingresos: 1000, ebitda: 200, capex: 20, capitalTrabajo: 100, crecimientoInicial: 10 };

test("leer los supuestos guardados: lo que falta o se sale del rango queda por defecto", () => {
  assert.deepEqual(leerValoracion(null), VALORACION_PREDETERMINADA);
  const s = leerValoracion({ multiplo: 5, tasa_descuento: 18, crecimiento_perpetuo: 2.5, años: 7, tasa_impuesto: 99 });
  assert.deepEqual(s, { multiplo: 5, tasaDescuento: 18, crecimientoPerpetuo: 2.5, anios: 7, tasaImpuesto: 25 });
  assert.equal(leerValoracion({ años: 2.5 }).anios, 5, "años entero");
  assert.deepEqual(leerValoracion(valoracionAGuardar(s)), s);
});

test("validar el formulario", () => {
  const ok = validarValoracion((c) => ({ multiplo: "4,5", tasaDescuento: "20", crecimientoPerpetuo: "3", anios: "5", tasaImpuesto: "25" })[c]);
  assert.ok("valoracion" in ok && ok.valoracion.multiplo === 4.5);
  const malo = validarValoracion((c) => ({ multiplo: "abc", tasaDescuento: "20", crecimientoPerpetuo: "3", anios: "5", tasaImpuesto: "25" })[c]);
  assert.ok("error" in malo && malo.error.startsWith("Múltiplo"));
  const gordon = validarValoracion((c) => ({ multiplo: "4", tasaDescuento: "3", crecimientoPerpetuo: "3", anios: "5", tasaImpuesto: "25" })[c]);
  assert.ok("error" in gordon);
});

test("DCF de un año a mano", () => {
  const s = { tasaDescuento: 20, crecimientoPerpetuo: 0, anios: 1, tasaImpuesto: 25 };
  const d = calcularDcf(BASE, s);
  assert.ok(d.valido);
  const a = d.anios[0];
  // Ingresos 1.100; EBITDA 20 % = 220; capex 2 % = 22; impuesto 25 % × 198 = 49,5; capital 10 % × 100 = 10.
  assert.equal(a.ingresos, 1100);
  assert.equal(a.ebitda, 220);
  assert.equal(a.capex, 22);
  assert.equal(a.impuestos, 49.5);
  assert.equal(a.variacionCapital, 10);
  assert.equal(a.flujoLibre, 138.5);
  assert.equal(a.valorPresente, 115.42);
  // Gordon con g = 0: 138,5 / 0,2 = 692,5, descontado un año.
  assert.equal(d.valorTerminal, 692.5);
  assert.equal(d.valorPresenteTerminal, 577.08);
  assert.equal(d.valor, 692.5);
  assert.equal(Math.round(d.pesoTerminal!), 83);
});

test("DCF: el crecimiento va del año 1 al perpetuo en línea recta y se acota", () => {
  const d = calcularDcf({ ...BASE, crecimientoInicial: 200 }, VALORACION_PREDETERMINADA);
  assert.deepEqual(d.anios.map((a) => Math.round(a.crecimiento * 100) / 100), [50, 38.25, 26.5, 14.75, 3]);
  assert.equal(calcularDcf({ ...BASE, ingresos: 0 }, VALORACION_PREDETERMINADA).valido, false);
  assert.equal(calcularDcf(BASE, { ...VALORACION_PREDETERMINADA, tasaDescuento: 3 }).valido, false);
  // EBITDA negativo: el valor no baja de cero.
  assert.equal(calcularDcf({ ...BASE, ebitda: -500 }, VALORACION_PREDETERMINADA).valor, 0);
});

test("sensibilidad 5 × 5: más tasa, menos valor; más crecimiento, más valor", () => {
  const m = sensibilidadDcf(BASE, VALORACION_PREDETERMINADA);
  assert.equal(m.length, 5);
  assert.equal(m[0].length, 5);
  assert.equal(m[2][2].tasa, 22);
  assert.equal(m[2][2].crecimiento, 3);
  assert.equal(m[2][2].valor, calcularDcf(BASE, VALORACION_PREDETERMINADA).valor);
  assert.ok(m[0][2].valor! > m[4][2].valor!);
  assert.ok(m[2][4].valor! > m[2][0].valor!);
  // Tasa que no supera al crecimiento: sin valor.
  const baja = sensibilidadDcf(BASE, { ...VALORACION_PREDETERMINADA, tasaDescuento: 5, crecimientoPerpetuo: 3 });
  assert.equal(baja[0][4].valor, null);
});

test("año base y crecimiento inicial", () => {
  const meses = ["2026-07-01", "2026-08-01", "2026-09-01"];
  const b = anualizarBase(
    meses,
    { "2026-07-01": 100, "2026-08-01": 200, "2026-09-01": 300 },
    { "2026-07-01": 10, "2026-08-01": 20, "2026-09-01": 30 },
    [{ fecha_alta: "2026-08-15", importe: 60 }, { fecha_alta: "2026-01-10", importe: 999 }],
  );
  assert.deepEqual(b, { ingresos: 2400, ebitda: 240, capex: 240 });
  assert.deepEqual(anualizarBase([], {}, {}, []), { ingresos: 0, ebitda: 0, capex: 0 });
  // Presupuesto que crece 1 % al mes → 12,68 % al año.
  const ppto = Array.from({ length: 12 }, (_, i) => 1000 * 1.01 ** i);
  const c = crecimientoInicial(ppto, [100, 200]);
  assert.equal(c.fuente, "presupuesto");
  assert.equal(Math.round(c.crecimiento * 100) / 100, 12.68);
  assert.equal(crecimientoInicial(null, [100, 110]).fuente, "tendencia");
  assert.deepEqual(crecimientoInicial(null, [100]), { crecimiento: 0, fuente: "sin_datos" });
});

test("rango: múltiplo vs DCF y lo que abarca la sensibilidad", () => {
  const s = VALORACION_PREDETERMINADA;
  const d = calcularDcf(BASE, s);
  const m = sensibilidadDcf(BASE, s);
  const r = rangoValor(200, s, d, m);
  assert.equal(r.porMultiplo, 800);
  assert.equal(r.minimo, Math.min(800, d.valor));
  assert.equal(r.maximo, Math.max(800, d.valor));
  assert.ok(r.sensibilidad!.minimo <= d.valor && d.valor <= r.sensibilidad!.maximo);
  assert.equal(multiploImplicito(1000, 200), 5);
  assert.equal(multiploImplicito(1000, 0), null);
  assert.equal(Math.round(anualDeMensual(1) * 100) / 100, 12.68);
});
