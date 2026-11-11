import assert from "node:assert/strict";
import test from "node:test";
import { DEF_STOCK, type FilaStock } from "./def-stock";
import { agruparVariantes, aplanarVariantes } from "./variantes-stock";

const fila = (id: string, codigo: string, extra: Partial<FilaStock> = {}): FilaStock => ({
  id,
  codigo,
  nombre: codigo,
  numero: null,
  barras: null,
  tipo: "simple",
  clase: "fisico",
  fisico: 0,
  reservado: 0,
  disponible: 0,
  danado: 0,
  inspeccion: 0,
  retenido: 0,
  enCamino: 0,
  vencido: 0,
  manejaVencimiento: false,
  foto: null,
  cajas: 0,
  unidadesEnCajas: 0,
  plataformas: null,
  porBodega: [],
  padreId: null,
  opciones: "",
  variantes: [],
  ...extra,
});

const PADRE = fila("p", "BANDA/PEDALES", { enCamino: 5 });
const ROSA = fila("r", "BANDA/PEDALES/ROSA", { padreId: "p", opciones: "Rosa", fisico: 165, disponible: 160, reservado: 5, porBodega: [{ bodegaId: "b1", fisico: 165 }] });
const AZUL = fila("a", "BANDA/PEDALES/AZUL", {
  padreId: "p",
  opciones: "Azul",
  fisico: 378,
  disponible: 378,
  porBodega: [{ bodegaId: "b1", fisico: 300 }, { bodegaId: "b2", fisico: 78 }],
  plataformas: { dropi: 10, effi: 0, drop: 0, dunamixfy: 0, total: 10, lineas: [] },
});

test("las variantes salen dentro de su producto, que suma sus cifras", () => {
  const filas = agruparVariantes([ROSA, fila("x", "OTRO", { fisico: 3 }), PADRE, AZUL]);
  assert.deepEqual(filas.map((f) => f.codigo), ["OTRO", "BANDA/PEDALES"]);
  const p = filas[1];
  assert.equal(p.fisico, 543);
  assert.equal(p.disponible, 538);
  assert.equal(p.reservado, 5);
  assert.equal(p.enCamino, 5);
  assert.deepEqual(p.variantes.map((v) => v.opciones), ["Azul", "Rosa"]);
  assert.equal(p.plataformas?.total, 10);
  assert.deepEqual(p.porBodega, [{ bodegaId: "b1", fisico: 465 }, { bodegaId: "b2", fisico: 78 }]);
});

test("una variante cuyo principal no está en la lista sale sola", () => {
  const filas = agruparVariantes([ROSA]);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].codigo, "BANDA/PEDALES/ROSA");
});

test("aplanar devuelve cada producto y sus variantes, para abrir una ficha por su id", () => {
  const ids = aplanarVariantes(agruparVariantes([ROSA, PADRE, AZUL])).map((f) => f.id);
  assert.deepEqual(ids, ["p", "a", "r"]);
});

test("buscar una variante encuentra a su producto, y se descarga una línea por variante", () => {
  const [p] = agruparVariantes([ROSA, PADRE, AZUL]);
  const buscador = DEF_STOCK.campos.find((c) => c.id === "sku");
  assert.ok(buscador && buscador.tipo === "texto");
  assert.ok(buscador.valor(p).includes("BANDA/PEDALES/ROSA"));
  assert.deepEqual(DEF_STOCK.expandirDescarga?.(p).map((f) => f.id), ["a", "r"]);
  assert.deepEqual(DEF_STOCK.expandirDescarga?.(fila("z", "SIN/VARIANTES")).map((f) => f.id), ["z"]);
});
