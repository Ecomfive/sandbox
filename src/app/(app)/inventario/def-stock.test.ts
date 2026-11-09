import assert from "node:assert/strict";
import test from "node:test";
import { SIN_VALOR } from "@/lib/tabla/motor";
import { columnasDeDescarga } from "@/lib/tabla/csv";
import { DEF_STOCK, conBodegas, type FilaStock } from "./def-stock";

const BODEGAS = [
  { id: "b1", nombre: "Despacho Plaza 100" },
  { id: "b2", nombre: "Oficina Ancón" },
];

const fila = (porBodega: FilaStock["porBodega"]): FilaStock => ({
  id: "1",
  codigo: "ACEITE/UNO",
  nombre: "Aceite",
  numero: 5,
  barras: null,
  tipo: "simple",
  clase: "fisico",
  fisico: porBodega.reduce((s, b) => s + b.fisico, 0),
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
  porBodega,
  padreId: null,
  opciones: "",
  variantes: [],
});

test("con varias bodegas se puede filtrar por bodega: los productos con unidades en ella", () => {
  const def = conBodegas(DEF_STOCK, BODEGAS);
  const campo = def.campos.find((c) => c.id === "bodega");
  assert.ok(campo && campo.tipo === "seleccion");
  assert.deepEqual(campo.valores(fila([{ bodegaId: "b1", fisico: 10 }, { bodegaId: "b2", fisico: 0 }])), ["b1"]);
  assert.deepEqual(campo.valores(fila([{ bodegaId: "b1", fisico: 4 }, { bodegaId: "b2", fisico: -2 }])), ["b1", "b2"]);
  assert.deepEqual(campo.valores(fila([])), [SIN_VALOR]);
  assert.deepEqual(campo.opciones?.(), [{ valor: "b1", etiqueta: "Despacho Plaza 100" }, { valor: "b2", etiqueta: "Oficina Ancón" }]);
});

test("lo que se descarga trae una columna de unidades por cada bodega", () => {
  const def = conBodegas(DEF_STOCK, BODEGAS);
  const f = fila([{ bodegaId: "b2", fisico: 7 }]);
  const columnas = columnasDeDescarga(def, [f]);
  const deBodega = columnas.filter((c) => c.etiqueta.startsWith("Físico · "));
  assert.deepEqual(deBodega.map((c) => c.etiqueta), ["Físico · Despacho Plaza 100", "Físico · Oficina Ancón"]);
  assert.deepEqual(deBodega.map((c) => c.valor(f)), [0, 7]);
});

test("con una sola bodega no se agrega nada", () => {
  assert.equal(conBodegas(DEF_STOCK, [BODEGAS[0]]), DEF_STOCK);
});
