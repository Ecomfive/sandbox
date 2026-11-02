import assert from "node:assert/strict";
import test from "node:test";
import { fraseDelAnalisis, guiasPorMes, mesesPorGrupo, pareto, paretoDe, paretoDeProductos, posicionEn, tamanoDelTop, textoParte, ultimosMeses, cobertura } from "./pareto";

// 10 dropshippers: el primero hace 50, el segundo 30, luego 5, 4, 3, 3, 2, 1, 1, 1 = 100 guías.
const cien = [50, 30, 5, 4, 3, 3, 2, 1, 1, 1].map((valor, i) => ({ id: `d${i + 1}`, valor }));

test("el 20 % de los clientes que más guías hacen y el 80 % restante, y lo que hace cada grupo", () => {
  const r = pareto(cien);
  assert.equal(r.total, 100);
  assert.equal(r.n, 10);
  // El 20 % de 10 son 2: los que más hacen.
  assert.deepEqual(r.filas.slice(0, 2).map((f) => f.grupo), ["top", "top"]);
  assert.deepEqual(r.filas.slice(2).map((f) => f.grupo), Array(8).fill("resto"));
  assert.equal(r.grupos.top.n, 2);
  assert.equal(r.grupos.top.parteDeLosItems, 0.2);
  assert.equal(r.grupos.top.valor, 80);
  assert.equal(r.grupos.top.parteDelTotal, 0.8);
  assert.equal(r.grupos.resto.n, 8);
  assert.equal(r.grupos.resto.parteDeLosItems, 0.8);
  assert.equal(r.grupos.resto.valor, 20);
  assert.equal(r.grupos.resto.parteDelTotal, 0.2);
  assert.equal(r.cumple8020, true);
  // No existe ningún otro grupo.
  assert.deepEqual(Object.keys(r.grupos).sort(), ["resto", "top"]);
});

test("cuántos forman el 20 %: se redondea hacia arriba", () => {
  assert.equal(tamanoDelTop(121), 25);
  assert.equal(tamanoDelTop(100), 20);
  assert.equal(tamanoDelTop(15), 3);
  assert.equal(tamanoDelTop(10), 2);
  assert.equal(tamanoDelTop(5), 1);
  assert.equal(tamanoDelTop(1), 1);
  assert.equal(tamanoDelTop(0), 0);
});

test("cuando no se cumple el 80/20 se dice lo que hace de verdad cada grupo", () => {
  const r = pareto([{ id: "a", valor: 60 }, { id: "b", valor: 25 }, { id: "c", valor: 15 }]);
  // El 20 % de 3 es 1: «a» hace el 60 %; los otros dos, el 40 %.
  assert.deepEqual(r.filas.map((f) => f.grupo), ["top", "resto", "resto"]);
  assert.equal(r.grupos.top.parteDelTotal, 0.6);
  assert.equal(r.grupos.resto.parteDelTotal, 0.4);
  assert.equal(r.cumple8020, false);
  // Para llegar al 80 % hacen falta 2 (el que cruza el 80 % también cuenta).
  assert.equal(r.paraLlegarA80.n, 2);
  assert.equal(r.filas[1].acumulado, 0.85);
  // Reparto parejo: el 20 % hace el 20 % y hacen falta 8 de 10 para llegar al 80 %.
  const parejo = pareto(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, valor: 10 })));
  assert.equal(parejo.cumple8020, false);
  assert.equal(parejo.grupos.top.parteDelTotal, 0.2);
  assert.equal(parejo.paraLlegarA80.n, 8);
  assert.equal(parejo.paraLlegarA80.parte, 0.8);
});

test("los que no tienen guías no entran y un solo cliente es el 20 %", () => {
  const r = pareto([{ id: "a", valor: 0 }, { id: "b", valor: 7 }, { id: "c", valor: -2 }]);
  assert.equal(r.n, 1);
  assert.equal(r.filas[0].grupo, "top");
  assert.equal(r.filas[0].acumulado, 1);
  assert.equal(r.grupos.resto.n, 0);
  assert.equal(fraseDelAnalisis(r, "los dropshippers", "las guías"), "El 20 % de los dropshippers (1 de 1) hace el 100 % de las guías.");
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
  assert.equal(fraseDelAnalisis(r, "los dropshippers", "las guías"), "El 20 % de los dropshippers (2 de 10) hace el 80 % de las guías; el 80 % restante (8) hace el 20 %.");
  const d3 = posicionEn(r, "d3");
  assert.equal(d3?.posicion, 3);
  assert.equal(d3?.grupo, "resto");
  assert.equal(posicionEn(r, "d1")?.grupo, "top");
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

test("el análisis con los últimos k meses y las guías de cada mes por grupo", () => {
  const meses = ["2026-08-01", "2026-09-01", "2026-10-01"];
  const por = new Map<string, number[]>([
    ["grande", [100, 10, 10]],
    ["medio", [0, 5, 5]],
    ["chico", [0, 0, 1]],
  ]);
  // Con los 3 meses suman 131; con solo el último mes, 16.
  assert.equal(paretoDe(por, 3).total, 131);
  assert.equal(paretoDe(por, 1).total, 16);
  assert.equal(paretoDe(por, 1).filas[0].id, "grande");
  const r = paretoDe(por, 3);
  const filas = mesesPorGrupo(por, r, 3, meses);
  assert.equal(filas.length, 3);
  // El 20 % de 3 es 1: «grande».
  assert.equal(filas[0].top, 100);
  assert.equal(filas[0].resto, 0);
  assert.equal(filas[2].resto, 6);
  // Lo de cada mes suma lo mismo que las series.
  assert.equal(filas.reduce((s, f) => s + f.top + f.resto, 0), 131);
  // Con k = 1 solo sale el último mes.
  assert.equal(mesesPorGrupo(por, paretoDe(por, 1), 1, meses).length, 1);
  // Quien no tiene guías en el periodo no suma a ningún grupo.
  const series = new Map([["viejo", [50, 0, 0]], ["activo", [0, 0, 4]]]);
  assert.deepEqual(mesesPorGrupo(series, paretoDe(series, 1), 1, meses), [{ mes: "2026-10-01", top: 4, resto: 0 }]);
});

test("el Pareto de los productos de un dropshipper", () => {
  const r = paretoDeProductos([
    { productoId: 1, nombre: "Faja", pedidos: 70 },
    { productoId: 2, nombre: "Cepillo", pedidos: 20 },
    { productoId: 3, nombre: "Lámpara", pedidos: 10 },
  ]);
  assert.equal(r.grupos.top.n, 1);
  assert.equal(r.grupos.top.parteDelTotal, 0.7);
  assert.equal(r.grupos.resto.n, 2);
  assert.equal(r.nombres.get("1"), "Faja");
  assert.equal(r.filas[0].parte, 0.7);
});

test("desde qué mes hay guías: la cobertura de los datos", () => {
  const meses = ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"];
  // Los primeros meses sin nada: hay datos desde septiembre (3 meses con el actual).
  const series = new Map([["a", [0, 0, 4, 1]], ["b", [0, 2, 0, 0]]]);
  assert.deepEqual(cobertura(series, meses), { desde: "2026-09-01", meses: 3 });
  // Con guías desde el primer mes, cubre todo.
  assert.deepEqual(cobertura(new Map([["a", [1, 0, 0, 0]]]), meses), { desde: "2026-08-01", meses: 4 });
  // Sin guías, o sin series, no hay cobertura.
  assert.equal(cobertura(new Map([["a", [0, 0, 0, 0]]]), meses), null);
  assert.equal(cobertura(new Map(), meses), null);
});
