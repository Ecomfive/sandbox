import assert from "node:assert/strict";
import test from "node:test";
import { completarMapeo, formaDePago, montoDeColumna, SIN_COLUMNA, sugerirMapeo } from "../monday/columnas";
import { despachoDeShopify } from "../finanzas/shopify";
import { cambioDeEntrega, datosQueFaltan } from "./actualizar-entregas";

test("forma de pago: el texto de Monday o de la Matriz", () => {
  assert.equal(formaDePago("EFECTIVO"), "efectivo");
  assert.equal(formaDePago("Yappy"), "yappy");
  assert.equal(formaDePago("TRANSFERENCIA"), "transferencia");
  assert.equal(formaDePago("MiPOS"), "tarjeta");
  assert.equal(formaDePago("Cheque"), "otro");
  assert.equal(formaDePago("CANCELADO"), null);
  assert.equal(formaDePago("NO GESTIONADO"), null);
  assert.equal(formaDePago(""), null);
  assert.equal(montoDeColumna("32.9"), 32.9);
  assert.equal(montoDeColumna("$32,90"), 32.9);
  assert.equal(montoDeColumna(""), null);
  assert.equal(montoDeColumna("0"), null);
});

test("Monday: el mapeo guardado se completa con forma de pago y monto cobrado por el título", () => {
  const columnas = [
    { id: "estado_15", titulo: "Estado", tipo: "status" },
    { id: "status", titulo: "Edo. Pago", tipo: "status" },
    { id: "estado_1", titulo: "Forma de Pago", tipo: "status" },
    { id: "n_meros", titulo: "$ Cobrado", tipo: "numbers" },
    { id: "n_meros9", titulo: "$ Por Cobrar", tipo: "numbers" },
  ];
  assert.equal(sugerirMapeo(columnas).forma_pago, "estado_1");
  const c = completarMapeo({ pedido: "name", estado: "estado_15" }, columnas)!;
  assert.equal(c.forma_pago, "estado_1");
  assert.equal(c.monto_cobrado, "n_meros");
  assert.equal(c.estado, "estado_15");
  // Ya completo: nada que hacer. Sin la columna: queda marcado para no buscarla otra vez.
  assert.equal(completarMapeo(c, columnas), null);
  assert.equal(completarMapeo({ pedido: "name", estado: "estado_15" }, [{ id: "estado_15", titulo: "Estado", tipo: "status" }])!.forma_pago, SIN_COLUMNA);
});

test("Shopify: la fecha de despacho es el primer fulfillment no cancelado", () => {
  assert.equal(despachoDeShopify({ fulfillments: [{ created_at: "2026-11-10T15:00:00-05:00", status: "success" }, { created_at: "2026-11-09T10:00:00-05:00", status: "cancelled" }, { created_at: "2026-11-11T09:00:00-05:00" }] }), "2026-11-10T20:00:00.000Z");
  assert.equal(despachoDeShopify({ fulfillments: [] }), null);
  assert.equal(despachoDeShopify({}), null);
});

test("Monday entregado: pasa la forma de pago y lo cobrado al pedido", () => {
  const o = { id: "1", numero: "#1", fase: "despachada", fecha: "2026-11-01", congelada: false, cod_esperado: 32.9, transportista: null, guia: null };
  const c = cambioDeEntrega(o, { estado_grupo: "entregado", estado: "ENTREGADO", courier: "JULY CALLE", causa_rechazo: null, fecha: "2026-11-02", forma_pago: "YAPPY", monto_cobrado: 32.9 }, null, new Set())!;
  assert.equal(c.fase, "entregada");
  assert.equal(c.set.forma_pago_entrega, "yappy");
  assert.equal(c.set.cod_cobrado, 32.9);
  assert.match(c.detalle, /YAPPY/);
  const sinPago = cambioDeEntrega(o, { estado_grupo: "entregado", estado: "ENTREGADO", courier: null, causa_rechazo: null, fecha: null }, null, new Set())!;
  assert.equal(sinPago.set.forma_pago_entrega, undefined);
  assert.equal(sinPago.set.cod_cobrado, undefined);
});

test("datos que faltan: forma de pago del ENTREGADO más reciente y la fecha de despacho más temprana", () => {
  const base = { fase: "entregada", cod_esperado: 29.99, cod_cobrado: null, forma_pago_entrega: null, despachada_en: null, fecha_envio: null };
  const filas = [
    { estado_grupo: "en_ruta", fecha_despacho: "2026-10-20", forma_pago: null, actualizado_monday: "2026-10-20T10:00:00Z" },
    { estado_grupo: "entregado", fecha_despacho: "2026-10-22", forma_pago: "EFECTIVO", monto_cobrado: 29.99, actualizado_monday: "2026-10-22T10:00:00Z" },
  ];
  assert.deepEqual(datosQueFaltan(base, filas, null), { forma_pago_entrega: "efectivo", cod_cobrado: 29.99, despachada_en: "2026-10-20T17:00:00.000Z", fecha_envio: "2026-10-20" });
  // La guía de Servientrega da la fecha si es antes.
  assert.equal(datosQueFaltan({ ...base, fase: "devuelta" }, [], "2026-10-18")?.despachada_en, "2026-10-18T17:00:00.000Z");
  // Lo que ya tiene no se pisa.
  assert.equal(datosQueFaltan({ ...base, forma_pago_entrega: "yappy", despachada_en: "2026-10-19T12:00:00Z" }, filas, null), null);
  assert.equal(datosQueFaltan({ ...base, fase: "despachada", despachada_en: "x" }, filas, null), null);
});
