// La depreciación en el EERR (interruptor de Ajustes, migración 0917): debajo del EBITDA, no lo toca, y baja el
// resultado neto exactamente lo que deprecia. Datos inventados.
import assert from "node:assert/strict";
import test from "node:test";
import { armarEerr, SECCIONES, type FilaEerr } from "./eerr";
import { filasEstado } from "./eerr-filas";
import { compararConReal, derivados, generarLineas, serieDeEerr, supuestosPorDefecto } from "./presupuesto";

const f = (periodo: string, tipo: string, seccion: FilaEerr["seccion"], signo: number, monto: number, unidad = "u"): FilaEerr => ({
  periodo, unidad_id: unidad, tipo, orden: 0, seccion, signo, monto,
});
const MESES = ["2026-01-01", "2026-02-01"];
const LIBRO: FilaEerr[] = [
  f("2026-01-01", "Ingresos", "ingresos", 1, 1000),
  f("2026-01-01", "Shipping por Ventas", "costo_ventas", -1, 300),
  f("2026-01-01", "SUELDOS", "administracion", -1, 200),
  f("2026-01-01", "Publicidad Online - FACEBOOK", "marketing", -1, 100),
  f("2026-01-01", "Comisiones bancarias", "finanzas", -1, 10),
  f("2026-02-01", "Ingresos", "ingresos", 1, 800),
];
const DEPRECIACION: FilaEerr[] = [
  f("2026-01-01", "Depreciación Bienes de uso", "depreciacion", -1, 37.5),
  f("2026-02-01", "Depreciación Bienes de uso", "depreciacion", -1, 37.5),
];

test("la sección de depreciación va debajo del EBITDA y antes de finanzas", () => {
  const orden = SECCIONES.map((s) => s.clave);
  assert.ok(orden.indexOf("depreciacion") > orden.indexOf("marketing"));
  assert.ok(orden.indexOf("depreciacion") < orden.indexOf("finanzas"));
});

test("con depreciación el EBITDA es idéntico y el resultado neto baja exactamente la depreciación", () => {
  const sin = armarEerr(LIBRO, MESES);
  const con = armarEerr([...LIBRO, ...DEPRECIACION], MESES);
  assert.deepEqual(con.ebitda, sin.ebitda);
  assert.deepEqual(con.margenBruto, sin.margenBruto);
  for (const m of MESES) {
    assert.equal(sin.resultadoNeto[m] - con.resultadoNeto[m], 37.5);
    assert.equal(con.ebit[m], con.ebitda[m] - 37.5);
    assert.equal(sin.ebit[m], sin.ebitda[m]);
  }
  assert.equal(sin.ebitda["2026-01-01"], 400);
  assert.equal(con.resultadoNeto["2026-01-01"], 400 - 37.5 - 10);
});

test("la tabla muestra Depreciación y el EBIT solo cuando hay depreciación", () => {
  const sin = filasEstado(armarEerr(LIBRO, MESES)).map((x) => x.clave);
  assert.ok(!sin.includes("depreciacion") && !sin.includes("ebit"));
  const con = filasEstado(armarEerr([...LIBRO, ...DEPRECIACION], MESES)).map((x) => x.clave);
  const i = (c: string) => con.indexOf(c);
  assert.ok(i("ebitda") < i("depreciacion") && i("depreciacion") < i("ebit") && i("ebit") < i("finanzas"));
});

test("presupuesto: la depreciación resta del resultado, no del EBITDA, y se presupuesta como su promedio", () => {
  const serie = serieDeEerr(armarEerr([...LIBRO, ...DEPRECIACION], MESES));
  const d = derivados(serie, MESES);
  assert.equal(d.ebitda["2026-01-01"], 400);
  assert.equal(d.resultado["2026-01-01"], 400 - 37.5 - 10);

  const sup = supuestosPorDefecto(serie, MESES);
  const lineas = generarLineas(sup, new Map([["u", serie]]), 2026, false);
  const dep = lineas.filter((l) => l.seccion === "depreciacion" && l.escenario === "base");
  assert.equal(dep.length, 12);
  assert.ok(dep.every((l) => l.monto === 37.5));
  // Sin depreciación en el real no se guardan líneas en cero ni se muestra en la comparación.
  const sinDep = serieDeEerr(armarEerr(LIBRO, MESES));
  assert.equal(generarLineas(supuestosPorDefecto(sinDep, MESES), new Map([["u", sinDep]]), 2026, false).filter((l) => l.seccion === "depreciacion").length, 0);
  assert.ok(!compararConReal(sinDep, sinDep, MESES).some((c) => c.concepto === "depreciacion"));
  assert.ok(compararConReal(serie, serie, MESES).some((c) => c.concepto === "depreciacion"));
});
