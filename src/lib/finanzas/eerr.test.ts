import assert from "node:assert/strict";
import test from "node:test";
import { armarEerr, mesesComparables, recortarInicio, sobre, total, ultimosMeses, valorEmpresa, variacion, type FilaEerr } from "./eerr";

const f = (periodo: string, tipo: string, seccion: FilaEerr["seccion"], signo: number, monto: number, orden = 0): FilaEerr => ({
  periodo, unidad_id: "u", tipo, orden, seccion, signo, monto,
});
const MESES = ["2026-01-01", "2026-02-01"];

test("el EERR suma por sección con el signo de cada tipo", () => {
  const e = armarEerr(
    [
      f("2026-01-01", "Ingresos", "ingresos", 1, 1000, 10),
      f("2026-01-01", "Devoluciones", "ingresos", -1, 100, 20),
      f("2026-01-01", "Shipping por Ventas", "costo_ventas", -1, 200),
      f("2026-01-01", "SUELDOS", "administracion", -1, 150),
      f("2026-01-01", "Publicidad Online - FACEBOOK", "marketing", -1, 250),
      f("2026-01-01", "Comisiones bancarias", "finanzas", -1, 20),
      f("2026-01-01", "Retiro de dividendos", "otros", -1, 80),
      f("2026-02-01", "Ingresos", "ingresos", 1, 500, 10),
      // Fuera de la ventana: no cuenta.
      f("2025-12-01", "Ingresos", "ingresos", 1, 9999, 10),
    ],
    MESES,
  );
  assert.equal(e.ingresosNetos["2026-01-01"], 900);
  assert.equal(e.margenBruto["2026-01-01"], 700);
  assert.equal(e.ebitda["2026-01-01"], 300);
  assert.equal(e.resultadoNeto["2026-01-01"], 200);
  assert.equal(e.dividendos["2026-01-01"], 80);
  assert.equal(total(e.ingresosNetos), 1400);
  // Ingresos antes que devoluciones (orden del catálogo).
  assert.deepEqual(e.secciones[0].tipos.map((t) => t.tipo), ["Ingresos", "Devoluciones"]);
  // Las secciones vacías siguen estando, en cero.
  assert.equal(e.secciones.find((s) => s.seccion === "impuesto_ganancias")!.efectoTotal, 0);
});

test("varias tiendas se suman en la misma línea", () => {
  const e = armarEerr([f("2026-01-01", "Ingresos", "ingresos", 1, 10), { ...f("2026-01-01", "Ingresos", "ingresos", 1, 5), unidad_id: "otra" }], MESES);
  assert.equal(e.secciones[0].tipos[0].meses["2026-01-01"], 15);
});

test("ayudas de fechas y porcentajes", () => {
  assert.deepEqual(ultimosMeses("2026-02-15", 3), ["2025-12-01", "2026-01-01", "2026-02-01"]);
  assert.deepEqual(recortarInicio(["2025-12-01", "2026-01-01", "2026-02-01"], new Set(["2026-02-01"])), ["2026-02-01"]);
  assert.deepEqual(mesesComparables(["2026-08-01", "2026-09-01", "2026-10-01"], "2026-10-18"), { actual: "2026-09-01", anterior: "2026-08-01" });
  assert.equal(sobre(25, 100), 25);
  assert.equal(sobre(25, 0), null);
  assert.equal(variacion(120, 100), 20);
  assert.equal(variacion(1, 0), null);
  assert.equal(valorEmpresa(100, 4), 400);
  assert.equal(valorEmpresa(-100, 4), 0);
});
