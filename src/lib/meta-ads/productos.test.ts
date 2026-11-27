import assert from "node:assert/strict";
import test from "node:test";
import { angulosDeProducto, agruparProductos } from "./productos";
import { sinResultados, type Resultados } from "./metricas";
import type { CampanaVista, VideoVista } from "./vistas";

const r = (p: Partial<Resultados>): Resultados => ({ ...sinResultados(), ...p });
const camp = (id: string, producto: string | null, res: Partial<Resultados>, activa = true) => ({ id, producto, r: r(res), tope: 10, topeDefinido: false, activa }) as unknown as CampanaVista;
const vid = (id: string, producto: string | null, angulo: string | null, res: Partial<Resultados>) => ({ id, producto, angulo, analisis: null, r: r(res) }) as unknown as VideoVista;

test("las campañas de un mismo producto se suman, aunque el nombre cambie en mayúsculas o acentos, y salen de más a menos gasto", () => {
  const p = agruparProductos([camp("1", "Orégano", { gasto: 100, compras: 10 }), camp("2", "OREGANO", { gasto: 50, compras: 4 }, false), camp("3", "Faja", { gasto: 300, compras: 20 }), camp("4", null, { gasto: 5 })], [vid("v", "Faja", null, {}), vid("w", "faja", null, {})]);
  assert.deepEqual(p.map((x) => [x.nombre, x.r.gasto, x.campanas, x.activas, x.videos]), [["Faja", 300, 1, 1, 2], ["Orégano", 150, 2, 1, 0], ["Sin producto", 5, 1, 1, 0]]);
});

test("los ángulos de un producto salen de sus videos, cada uno con lo que sumó, de más a menos gasto", () => {
  const videos = [vid("a", "Faja", "Antes y después", { gasto: 40, compras: 4 }), vid("b", "FAJA", "Antes y después", { gasto: 60, compras: 5 }), vid("c", "Faja", null, { gasto: 90 }), vid("d", "Otro", "Ahorro", { gasto: 500 })];
  const a = angulosDeProducto(videos, "FAJA");
  assert.deepEqual(a.map((x) => [x.angulo, x.videos, x.r.gasto]), [["Antes y después", 2, 100], ["Sin ángulo", 1, 90]].sort((x, y) => (y[2] as number) - (x[2] as number)));
});
