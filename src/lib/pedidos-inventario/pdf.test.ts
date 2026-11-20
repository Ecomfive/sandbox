import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { datosDelPedido, nombreArchivoPedido, observacionesDeLineas, pedidoAPdf } from "./pdf";
import type { PedidoInventario } from "./reglas";

const pedido = (extra: Partial<PedidoInventario> = {}, lineas = 2): PedidoInventario => ({
  id: "p1",
  numero: 12,
  estado: "enviado",
  pedidoPor: "u1",
  pedidoPorNombre: "Yiletsi",
  creadoEn: "2026-11-20T15:00:00Z",
  responsableNombre: "Dinora",
  enviadoEn: "2026-11-20T18:00:00Z",
  recibidoPorNombre: null,
  recibidoEn: null,
  origen: null,
  traslado: "TRA-0007",
  items: Array.from({ length: lineas }, (_, i) => ({
    id: `i${i}`,
    skuId: `s${i}`,
    producto: `Faja Body Enterizo · Negro / ${i}XL con un nombre largo para que parta en líneas ñandú`,
    codigo: `FAJA/BODY/${i}`,
    cantidadPedida: 40 + i,
    nota: i === 0 ? "se agotó" : null,
    cantidadEntregada: i === 0 ? 38 : null,
    observacion: null,
  })),
  ...extra,
});

test("el nombre del archivo es el número del pedido", () => {
  assert.equal(nombreArchivoPedido(pedido()), "PED-0012.pdf");
});

test("la cabecera trae solo los datos que tienen valor", () => {
  const d = datosDelPedido(pedido());
  assert.deepEqual(d.map(([e]) => e), ["Estado", "Fecha del pedido", "Pedido por", "Responsable de bodega", "Enviado"]);
  assert.equal(d[0][1], "Enviado");
  const sin = datosDelPedido(pedido({ responsableNombre: null, enviadoEn: null }));
  assert.deepEqual(sin.map(([e]) => e), ["Estado", "Fecha del pedido", "Pedido por"]);
});

test("el traslado va en las observaciones de la última línea", () => {
  assert.deepEqual(observacionesDeLineas(pedido()), ["se agotó", "TRA-0007"]);
});

test("arma un PDF válido de una página", async () => {
  const bytes = await pedidoAPdf(pedido());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
});

test("un pedido largo pasa a más de una página", async () => {
  const bytes = await pedidoAPdf(pedido({}, 60));
  assert.ok((await PDFDocument.load(bytes)).getPageCount() > 1);
});
