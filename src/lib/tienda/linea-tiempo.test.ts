import assert from "node:assert/strict";
import { test } from "node:test";
import { pasosDelPedido, type DatosLineaTiempo } from "./linea-tiempo";

const base = (o: Partial<DatosLineaTiempo> = {}): DatosLineaTiempo => ({
  fecha: "2026-10-15",
  fase: "por_confirmar",
  estado_entrega: "pendiente",
  etiquetas: "CIUDAD",
  fecha_envio: null,
  fecha_devolucion: null,
  motivo_cancelacion: null,
  transportista: null,
  estado_pago: "PENDING",
  ...o,
});
const tonos = (o: DatosLineaTiempo, e: Parameters<typeof pasosDelPedido>[1] = null) => pasosDelPedido(o, e).map((p) => `${p.etiqueta}:${p.tono}`);

test("un pedido nuevo: solo entró", () => {
  assert.deepEqual(tonos(base()), ["Entró:hecho", "Confirmado:pendiente", "Despachado:pendiente", "Entregado:pendiente", "Pagado:pendiente"]);
});

test("la etiqueta «Confirmada» de Shopify cuenta como confirmado, sin fecha", () => {
  const p = pasosDelPedido(base({ etiquetas: "CIUDAD, Confirmada" }));
  assert.equal(p[1].tono, "hecho");
  assert.equal(p[1].nota, "sin fecha");
});

test("entregado según Monday: la fecha del reparto y el repartidor; el cobro no se supone", () => {
  const p = pasosDelPedido(base({ fase: "entregada", estado_entrega: "entregada", entregada_en: "2026-10-16T17:00:00.000Z", cod_esperado: 32.9 }), { fuente: "monday", grupo: "entregado", fecha: "2026-10-16", repartidor: "Aníbal Pérez", causa: null });
  assert.equal(p[3].etiqueta, "Entregado");
  assert.equal(p[3].fecha, "2026-10-16T17:00:00.000Z");
  assert.equal(p[3].nota, "Monday · Aníbal Pérez");
  assert.equal(p[4].tono, "pendiente");
});

test("devuelto: «Volvió» en rojo con el motivo; cancelado con el suyo", () => {
  const v = pasosDelPedido(base({ fase: "devuelta", estado_entrega: "devuelta", fecha_devolucion: "2026-09-30", motivo_cancelacion: "Servientrega: DEVUELTA (Dirección errada)" }));
  assert.deepEqual([v[3].etiqueta, v[3].tono, v[3].fecha], ["Volvió", "malo", "2026-09-30"]);
  assert.match(String(v[3].nota), /Dirección errada/);
  const c = pasosDelPedido(base({ fase: "cancelada", estado_entrega: "cancelada", motivo_cancelacion: "Cliente no responde" }));
  assert.deepEqual([c[1].tono, c[3].etiqueta, c[3].tono], ["malo", "Cancelado", "malo"]);
});

test("pagado: por Shopify o por lo cobrado contra entrega", () => {
  assert.equal(pasosDelPedido(base({ estado_pago: "PAID" }))[4].tono, "hecho");
  const cod = pasosDelPedido(base({ fase: "entregada", estado_entrega: "entregada", entregada_en: "2026-10-20T17:00:00.000Z", cod_esperado: 30, cod_cobrado: 30 }));
  assert.deepEqual([cod[4].tono, cod[4].nota], ["hecho", "contra entrega"]);
});

test("despachado con Servientrega en camino lo dice en Entregado", () => {
  const p = pasosDelPedido(base({ fase: "despachada", estado_entrega: "en_transito", fecha_envio: "2026-11-01", transportista: "Servientrega" }), { fuente: "siscore", grupo: "en_ruta", fecha: "2026-11-02", repartidor: "Servientrega", causa: null });
  assert.equal(p[2].tono, "hecho");
  assert.equal(p[3].nota, "Servientrega: en camino");
});

test("sin fase (orden vieja del Excel), se deduce del estado de entrega", () => {
  assert.equal(pasosDelPedido(base({ fase: null, estado_entrega: "entregada" }))[3].tono, "hecho");
});
