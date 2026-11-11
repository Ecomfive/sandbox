import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { FilaEerr } from "./eerr";
import { columnaMoneda, eerrInteranual, filasDosMonedas, filasInteranual, eerrMovil, eerrPorGrupo, gruposConDatos, moverMes, resultadoConReparto, variacionPct } from "./eerr-analisis";

const fila = (periodo: string, unidad: string, monto: number, seccion: FilaEerr["seccion"] = "ingresos", signo = 1): FilaEerr => ({
  periodo,
  unidad_id: unidad,
  tipo: seccion === "ingresos" ? "Ingresos" : "Costo",
  orden: 1,
  seccion,
  signo,
  monto,
});

test("mover meses cruza el año", () => {
  assert.equal(moverMes("2026-01-01", -1), "2025-12-01");
  assert.equal(moverMes("2025-12-01", 13), "2027-01-01");
  assert.equal(moverMes("2026-03-01", -12), "2025-03-01");
});

test("TTM suma el mes y los 11 anteriores", () => {
  const filas = Array.from({ length: 14 }, (_, i) => fila(moverMes("2025-01-01", i), "a", 10));
  const meses = ["2025-12-01", "2026-01-01", "2026-02-01"];
  const { eerr, completos } = eerrMovil(filas, meses, filas.map((f) => f.periodo));
  assert.equal(eerr.ingresosNetos["2025-12-01"], 120);
  assert.equal(eerr.ingresosNetos["2026-02-01"], 120);
  assert.deepEqual([...completos], meses);
  const corto = eerrMovil(filas.slice(5), meses, filas.slice(5).map((f) => f.periodo));
  assert.equal(corto.completos.size, 0);
});

test("el año anterior se alinea con el mes actual", () => {
  const filas = [fila("2025-03-01", "a", 50), fila("2026-03-01", "a", 80)];
  const r = eerrInteranual(filas, ["2026-03-01", "2026-04-01"], ["2025-03-01", "2026-03-01"]);
  assert.equal(r.actual.ingresosNetos["2026-03-01"], 80);
  assert.equal(r.anterior.ingresosNetos["2026-03-01"], 50);
  assert.deepEqual(r.conAnterior, ["2026-03-01"]);
  assert.equal(variacionPct(80, 50), 60);
  assert.equal(variacionPct(80, 0), null);
});

test("una columna por grupo con sus márgenes y el reparto antes y después", () => {
  const M = "2026-03-01";
  const directas = [fila(M, "a", 100), fila(M, "a", 60, "costo_ventas", -1), fila(M, "b", 50), fila(M, "b", 20, "costo_ventas", -1)];
  const repartidas = [fila(M, "a", 30, "administracion", -1), fila(M, "b", 40, "administracion", -1)];
  const canal = (u: string) => (u === "a" ? "shopify" : "dropi");
  const e = eerrPorGrupo([...directas, ...repartidas], [M], canal, ["shopify", "dropi", "sin"]);
  assert.equal(e.margenBruto.shopify, 40);
  assert.deepEqual(gruposConDatos(e, ["shopify", "dropi", "sin"]), ["shopify", "dropi"]);
  const r = resultadoConReparto(directas, repartidas, [M], canal, ["shopify", "dropi"]);
  assert.equal(r.antes.dropi, 30);
  assert.equal(r.despues.dropi, -10);
  assert.deepEqual(r.quedanEnPerdida, ["dropi"]);
});

test("las filas del año anterior traen variación y puntos", () => {
  const filas = [fila("2025-03-01", "a", 100), fila("2025-03-01", "a", 40, "costo_ventas", -1), fila("2026-03-01", "a", 150), fila("2026-03-01", "a", 90, "costo_ventas", -1)];
  const r = filasInteranual(filas, ["2026-03-01"]);
  const ingresos = r.find((f) => f.clave === "ingresos-netos")!;
  assert.deepEqual(ingresos.valores, [150, 100, 50, 50]);
  const margen = r.find((f) => f.clave === "margen-bruto-pct")!;
  assert.equal(margen.valores[2], 40 - 60);
  assert.equal(margen.valores[3], null);
});

test("dos monedas lado a lado con su total", () => {
  const M = "2026-03-01";
  const { claves, filas } = filasDosMonedas([fila(M, "a", 52000)], [fila(M, "a", 100)], [M]);
  assert.deepEqual(claves, [columnaMoneda(M, "local"), columnaMoneda(M, "usd"), "total|local", "total|usd"]);
  assert.deepEqual(filas.find((f) => f.clave === "ingresos-netos")!.valores, [52000, 100, 52000, 100]);
});
