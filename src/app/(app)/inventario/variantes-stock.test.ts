import assert from "node:assert/strict";
import test from "node:test";
import { DEF_STOCK, type FilaStock } from "./def-stock";
import { agruparVariantes, aplanarVariantes, grupoDeColor, sinRepartirEn } from "./variantes-stock";

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

test("«sin repartir» se dice según la bodega que se ve: solo donde queda stock general", () => {
  // El Ventilador MF019 Mini: 146 ya repartidos al Blanco en Despacho; 125 siguen como stock general en otras dos bodegas.
  const padre = fila("p", "VENTILADOR", { repartoPendiente: true, porBodega: [{ bodegaId: "despacho", fisico: 0 }, { bodegaId: "externo", fisico: 25 }, { bodegaId: "istorage", fisico: 100 }] });
  const blanco = fila("b", "VENTILADOR/BLANCO", { padreId: "p", repartoPendiente: true, opciones: "Blanco", fisico: 146, porBodega: [{ bodegaId: "despacho", fisico: 146 }] });
  const [agrupado] = agruparVariantes([padre, blanco]);
  assert.equal(sinRepartirEn(agrupado, null), true, "sin filtro, en alguna bodega queda general");
  assert.equal(sinRepartirEn(agrupado, "despacho"), false, "en Despacho ya está repartido");
  assert.equal(sinRepartirEn(agrupado, "externo"), true);
  // La variante dice «sale del general» solo donde el general todavía tiene stock.
  assert.equal(sinRepartirEn(agrupado.variantes[0], "despacho"), false);
  assert.equal(sinRepartirEn(agrupado.variantes[0], "istorage"), true);
  // Sin la marca del producto nunca; sin el dato por bodega (una variante suelta), vale la marca.
  assert.equal(sinRepartirEn({ repartoPendiente: false, generalPorBodega: [{ bodegaId: "x", fisico: 5 }] }, "x"), false);
  assert.equal(sinRepartirEn({ repartoPendiente: true }, "x"), true);
});

test("grupoDeColor: la fila de un color suma sus variantes y las lleva dentro", () => {
  const m = fila("m", "CAMISA/AZUL/M", { padreId: "p", opciones: "Azul / M", color: "Azul", resto: "M", fisico: 3, disponible: 2, reservado: 1, porBodega: [{ bodegaId: "b1", fisico: 3 }] });
  const l = fila("l", "CAMISA/AZUL/L", { padreId: "p", opciones: "Azul / L", color: "Azul", resto: "L", fisico: 4, disponible: 4, porBodega: [{ bodegaId: "b1", fisico: 1 }, { bodegaId: "b2", fisico: 3 }] });
  const g = grupoDeColor(fila("p", "CAMISA"), "Azul", [m, l]);
  assert.equal(g.nombre, "Azul");
  assert.equal(g.fisico, 7);
  assert.equal(g.disponible, 6);
  assert.equal(g.reservado, 1);
  assert.deepEqual(g.porBodega.sort((a, b) => a.bodegaId.localeCompare(b.bodegaId)), [{ bodegaId: "b1", fisico: 4 }, { bodegaId: "b2", fisico: 3 }]);
  assert.deepEqual(g.variantes.map((v) => v.id), ["m", "l"]);
  assert.equal(g.id, "p|Azul");
});
