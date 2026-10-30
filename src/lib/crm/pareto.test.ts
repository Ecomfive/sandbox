import assert from "node:assert/strict";
import test from "node:test";
import { fraseDelAnalisis, guiasPorMes, mesesPorClase, pareto, paretoDe, paretoDeProductos, posicionEn, textoParte, ultimosMeses } from "./pareto";

// 10 dropshippers: el primero hace 50, el segundo 30, luego 5, 4, 3, 3, 2, 1, 1, 1 = 100 guías.
const cien = [50, 30, 5, 4, 3, 3, 2, 1, 1, 1].map((valor, i) => ({ id: `d${i + 1}`, valor }));

test("las clases salen de cuánto hace falta para llegar al 80 % y al 95 %", () => {
  const r = pareto(cien);
  assert.equal(r.total, 100);
  assert.equal(r.n, 10);
  // 50 → 50 %, 30 → 80 %: los dos primeros llegan justo al 80 %.
  assert.deepEqual(r.filas.slice(0, 2).map((f) => f.clase), ["A", "A"]);
  // 5, 4, 3 → 85, 89, 92 %; 3 → 95 % (todavía B: entró antes del 95); lo que sigue es C.
  assert.deepEqual(r.filas.slice(2, 6).map((f) => f.clase), ["B", "B", "B", "B"]);
  assert.deepEqual(r.filas.slice(6).map((f) => f.clase), ["C", "C", "C", "C"]);
  assert.equal(r.clases.A.n, 2);
  assert.equal(r.clases.A.parteDelTotal, 0.8);
  assert.equal(r.clases.B.n, 4);
  assert.equal(r.clases.C.n, 4);
  assert.equal(r.paraLlegarA80.n, 2);
  assert.equal(r.paraLlegarA80.parte, 0.2);
});

test("el que cruza el 80 % cuenta como A", () => {
  const r = pareto([{ id: "a", valor: 60 }, { id: "b", valor: 25 }, { id: "c", valor: 15 }]);
  assert.deepEqual(r.filas.map((f) => f.clase), ["A", "A", "B"]);
  assert.equal(r.filas[1].acumulado, 0.85);
});

test("la regla 20/80: el 20 % de los clientes y lo que hace", () => {
  const r = pareto(cien);
  assert.equal(r.top.n, 2);
  assert.equal(r.top.parteDelTotal, 0.8);
  assert.equal(r.cumple8020, true);
  // Reparto parejo: el 20 % hace el 20 %.
  const parejo = pareto(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, valor: 10 })));
  assert.equal(parejo.cumple8020, false);
  assert.equal(parejo.top.parteDelTotal, 0.2);
  assert.equal(parejo.clases.A.n, 8);
});

test("los que no tienen guías no entran y un solo cliente es A", () => {
  const r = pareto([{ id: "a", valor: 0 }, { id: "b", valor: 7 }, { id: "c", valor: -2 }]);
  assert.equal(r.n, 1);
  assert.equal(r.filas[0].clase, "A");
  assert.equal(r.filas[0].acumulado, 1);
  const vacio = pareto([]);
  assert.equal(vacio.n, 0);
  assert.equal(vacio.total, 0);
  assert.equal(vacio.cumple8020, false);
  assert.equal(fraseDelAnalisis(vacio, "los dropshippers", "las guías"), "Sin las guías en el periodo.");
});

test("con el mismo valor el orden no cambia", () => {
  const r1 = pareto([{ id: "b", valor: 5 }, { id: "a", valor: 5 }]);
  const r2 = pareto([{ id: "a", valor: 5 }, { id: "b", valor: 5 }]);
  assert.deepEqual(r1.filas.map((f) => f.id), ["a", "b"]);
  assert.deepEqual(r2.filas.map((f) => f.id), ["a", "b"]);
});

test("la frase y la posición de uno", () => {
  const r = pareto(cien);
  assert.equal(fraseDelAnalisis(r, "los dropshippers", "las guías"), "El 20 % de los dropshippers (2 de 10) hace el 80 % de las guías.");
  const d3 = posicionEn(r, "d3");
  assert.equal(d3?.posicion, 3);
  assert.equal(d3?.clase, "B");
  assert.equal(posicionEn(r, "nadie"), null);
  assert.equal(textoParte(0.004), "0,4 %");
  assert.equal(textoParte(0.136), "14 %");
  assert.equal(textoParte(0), "0 %");
});

test("los meses y las guías de cada uno mes a mes", () => {
  assert.deepEqual(ultimosMeses("2026-10-31", 3), ["2026-08-01", "2026-09-01", "2026-10-01"]);
  // Cruza el año.
  assert.deepEqual(ultimosMeses("2026-02-10", 4), ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
  const meses = ultimosMeses("2026-10-31", 12);
  assert.equal(meses.length, 12);
  assert.equal(meses[0], "2025-11-01");
  const por = guiasPorMes(
    [
      { dropshipperId: "a", mes: "2026-10-01", pedidos: 10 },
      { dropshipperId: "a", mes: "2026-09-01", pedidos: 4 },
      { dropshipperId: "b", mes: "2026-10-01", pedidos: 1 },
      { dropshipperId: "b", mes: "2020-01-01", pedidos: 99 }, // fuera de la ventana: se ignora
    ],
    meses,
  );
  assert.equal(por.get("a")?.[11], 10);
  assert.equal(por.get("a")?.[10], 4);
  assert.equal(por.get("b")?.reduce((s, x) => s + x, 0), 1);
});

test("el análisis con los últimos k meses y las guías de cada mes por clase", () => {
  const meses = ["2026-08-01", "2026-09-01", "2026-10-01"];
  const por = new Map<string, number[]>([
    ["grande", [100, 10, 10]],
    ["medio", [0, 5, 5]],
    ["chico", [0, 0, 1]],
  ]);
  // Con los 3 meses el grande hace 110 de 131; con solo el último mes, 10 de 16.
  assert.equal(paretoDe(por, 3).total, 131);
  assert.equal(paretoDe(por, 1).total, 16);
  assert.equal(paretoDe(por, 1).filas[0].id, "grande");
  const r = paretoDe(por, 3);
  const filas = mesesPorClase(por, r, 3, meses);
  assert.equal(filas.length, 3);
  assert.equal(filas[0].A, 100);
  // Lo de cada mes suma lo mismo que las series.
  assert.equal(filas.reduce((s, f) => s + f.A + f.B + f.C + f.sinClase, 0), 131);
  // Con k = 1 solo sale el último mes.
  assert.equal(mesesPorClase(por, paretoDe(por, 1), 1, meses).length, 1);
});

test("el Pareto de los productos de un dropshipper", () => {
  const r = paretoDeProductos([
    { productoId: 1, nombre: "Faja", pedidos: 70 },
    { productoId: 2, nombre: "Cepillo", pedidos: 20 },
    { productoId: 3, nombre: "Lámpara", pedidos: 10 },
  ]);
  assert.equal(r.clases.A.n, 2);
  assert.equal(r.nombres.get("1"), "Faja");
  assert.equal(r.filas[0].parte, 0.7);
});
