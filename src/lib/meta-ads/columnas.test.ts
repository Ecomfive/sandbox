import assert from "node:assert/strict";
import test from "node:test";
import { CATALOGO_COLUMNAS, columnasValidas, moverColumna, PRESETS_COLUMNAS, rejillaDeColumnas, valorColumna, type ClaveColumna } from "./columnas";
import { sinResultados, type Resultados } from "./metricas";

const r = (p: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...p });
const ctx = { tope: 10, etapa: "venta", confiable: true };

test("las columnas guardadas se validan: solo claves que existen, sin repetir y en su orden; vacío o roto vuelve a lo de por defecto", () => {
  const defecto: ClaveColumna[] = ["gasto", "cpa"];
  assert.deepEqual(columnasValidas(["cvr", "x", "gasto", "cvr", 3], defecto), ["cvr", "gasto"]);
  assert.deepEqual(columnasValidas([], defecto), defecto);
  assert.deepEqual(columnasValidas(["nada"], defecto), defecto);
  assert.deepEqual(columnasValidas("gasto", defecto), defecto);
  assert.deepEqual(columnasValidas(null, defecto), defecto);
});

test("mover una columna la sube o la baja una posición sin salirse de la lista", () => {
  const l: ClaveColumna[] = ["gasto", "compras", "cpa"];
  assert.deepEqual(moverColumna(l, "cpa", -1), ["gasto", "cpa", "compras"]);
  assert.deepEqual(moverColumna(l, "gasto", -1), l);
  assert.deepEqual(moverColumna(l, "cpa", 1), l);
  assert.deepEqual(moverColumna(l, "gasto", 1), ["compras", "gasto", "cpa"]);
});

test("cada preset usa solo columnas del catálogo y «Todas» las trae todas", () => {
  const claves = new Set(CATALOGO_COLUMNAS.map((c) => c.clave));
  for (const p of PRESETS_COLUMNAS) for (const c of p.columnas) assert.ok(claves.has(c), `${p.id}: ${c}`);
  assert.equal(PRESETS_COLUMNAS.find((p) => p.id === "todas")?.columnas.length, CATALOGO_COLUMNAS.length);
  // El conjunto de la hoja de Testing va en su orden: CPM, efectividad, Hook, CTR, CPA, gasto, compras y CVR.
  assert.deepEqual(PRESETS_COLUMNAS.find((p) => p.id === "testing")?.columnas.slice(0, 8), ["cpm", "efectividad", "hook", "ctr", "cpa", "gasto", "compras", "cvr"]);
});

test("el texto y el color de cada columna: «—» cuando no hay dato, nunca un cero que parezca real", () => {
  const x = r({ gasto: 100, impresiones: 20_000, clics: 700, video3s: 9000, vioLanding: 630, compras: 12, valor: 480, reproducciones: 400, segundosVistos: 3600 });
  assert.deepEqual(valorColumna("gasto", x, ctx), { texto: "$100.00", nivel: "neutral" });
  assert.equal(valorColumna("cpa", x, ctx).texto, "$8.33");
  assert.equal(valorColumna("cpa", x, ctx).nivel, "bueno");
  assert.equal(valorColumna("roas", x, ctx).texto, "4.80x");
  assert.equal(valorColumna("tiempo", x, ctx).texto, "9.0 s");
  assert.equal(valorColumna("tiempo", x, ctx).nivel, "bueno");
  assert.equal(valorColumna("hook", x, ctx).texto, "45 %");
  assert.equal(valorColumna("cpm", x, ctx).texto, "$5.00");
  const vacio = sinResultados();
  for (const c of CATALOGO_COLUMNAS) assert.ok(["—"].includes(valorColumna(c.clave, vacio, ctx).texto), c.clave);
  assert.equal(valorColumna("cpa", r({ gasto: 30 }), ctx).texto, "Sin compras");
  assert.equal(valorColumna("frecuencia", x, ctx).texto, "—");
  assert.deepEqual(valorColumna("frecuencia", x, { ...ctx, frecuencia: 3.1 }), { texto: "3.10", nivel: "malo" });
});

test("con poca data los colores se apagan", () => {
  const x = r({ gasto: 30, compras: 1 });
  assert.equal(valorColumna("cpa", x, { ...ctx, confiable: true }).nivel, "malo");
  assert.equal(valorColumna("cpa", x, { ...ctx, confiable: false }).nivel, "neutral");
});

test("la rejilla de una lista: el nombre, una columna por métrica y la flecha (con una columna extra para el tipo)", () => {
  assert.equal(rejillaDeColumnas(3), "minmax(0,3fr) repeat(3, minmax(4.5rem,1fr)) 1rem");
  assert.equal(rejillaDeColumnas(2, true), "minmax(0,2.4fr) minmax(0,1.2fr) repeat(2, minmax(4.5rem,1fr)) 1rem");
});
