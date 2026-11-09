import { test } from "node:test";
import assert from "node:assert/strict";
import { armarEerr, type FilaEerr } from "./eerr";
import { accionesDelMes, causasPrincipales, cifrasDelMes, implicancias, tiendaDelMes } from "./informe";

const f = (periodo: string, seccion: FilaEerr["seccion"], tipo: string, signo: number, monto: number): FilaEerr => ({
  periodo,
  unidad_id: "t",
  tipo,
  orden: 1,
  seccion,
  signo,
  monto,
});
const A = "2026-08-01";
const B = "2026-09-01";
const eerr = armarEerr(
  [
    f(A, "ingresos", "Ventas", 1, 1000),
    f(A, "costo_ventas", "Mercancía", -1, 300),
    f(A, "marketing", "Meta", -1, 100),
    f(B, "ingresos", "Ventas", 1, 800),
    f(B, "costo_ventas", "Mercancía", -1, 50),
    f(B, "marketing", "Meta", -1, 200),
  ],
  [A, B],
);

test("cifras del mes y peso de cada gasto", () => {
  const c = cifrasDelMes(eerr, B);
  assert.equal(c.ingresos, 800);
  assert.equal(c.ebitda, 550);
  assert.equal(c.costoVentasPct, 6.25);
  assert.equal(c.marketingPct, 25);
});

test("causas ordenadas por cuánto movieron el resultado", () => {
  const causas = causasPrincipales(eerr, B, A);
  assert.deepEqual(
    causas.map((c) => [c.tipo, c.impacto]),
    [
      ["Mercancía", 250],
      ["Ventas", -200],
      ["Meta", -100],
    ],
  );
});

test("implicancias y acciones", () => {
  const actual = cifrasDelMes(eerr, B);
  const anterior = cifrasDelMes(eerr, A);
  const imp = implicancias(actual, anterior, 4);
  assert.equal(imp.ebitdaAnualMes, 6600);
  assert.equal(imp.valorCreado, 6600 * 4 - 600 * 12 * 4);
  const acciones = accionesDelMes(actual, anterior, [tiendaDelMes("X", eerr, B, A)], [{ titulo: "Sin tipo", cantidad: 2 }]);
  const claves = acciones.map((a) => a.clave);
  assert.deepEqual(claves.slice(0, 2).sort(), ["costo", "pend-Sin tipo"]);
  assert.ok(claves.includes("mkt"));
  assert.ok(claves.includes("ing"));
  assert.equal(acciones[0].prioridad, 1);
});
