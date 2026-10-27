import assert from "node:assert/strict";
import test from "node:test";
import { cantidadDeLinea, fechasDeConfirmacion, historialDePedido, type EventoCompra } from "./historial";

const ev = (campo: string, antes: string | null, despues: string | null, ocurrido_en: string, origen = "sistema", autor = "Francis Aponte"): EventoCompra => ({
  campo,
  valor_antes: antes,
  valor_despues: despues,
  ocurrido_en,
  autor,
  origen,
});

test("deja solo lo que le toca al proveedor, del más nuevo al más viejo", () => {
  const h = historialDePedido(
    [
      ev("cotizacion", null, "1,000 u. · $3,340.00", "2026-10-10T10:00:00Z", "proveedor", "Shen Zhen"),
      ev("etapa", "cotizado", "produccion", "2026-10-11T10:00:00Z"),
      ev("qtyTotal", "1000", "500", "2026-10-11T10:00:01Z"),
      ev("tienda", "—", "Kenku", "2026-10-11T10:00:02Z"),
      ev("primerPago", "—", "$1,000.00", "2026-10-11T10:00:03Z"),
      ev("cotizacion", "1,000 u. · $3,340.00", "500 u. · $1,700.00", "2026-10-12T10:00:00Z", "proveedor", "Shen Zhen"),
    ],
    { conAutor: false },
  );
  assert.deepEqual(
    h.map((l) => [l.tipo, l.lado, l.autor, l.antes, l.despues]),
    [
      ["cotizacion", "proveedor", "Shen Zhen", "1,000 u. · $3,340.00", "500 u. · $1,700.00"],
      ["unidades", "ecomfive", null, "1000", "500"],
      ["etapa", "ecomfive", null, "cotizado", "produccion"],
      ["cotizacion", "proveedor", "Shen Zhen", null, "1,000 u. · $3,340.00"],
    ],
  );
});

test("Ecomfive ve el nombre de quien lo hizo", () => {
  const [l] = historialDePedido([ev("qtyTotal", "1000", "500", "2026-10-11T10:00:00Z")], { conAutor: true });
  assert.equal(l.autor, "Francis Aponte");
});

test("etapas: se ven como las del portal y se saltan las que el proveedor no ve", () => {
  const h = historialDePedido(
    [
      ev("etapa", "produccion", "tracking", "2026-10-20T00:00:00Z", "proveedor", "Shen Zhen"),
      ev("etapa", "backlog", "cotizar", "2026-10-01T00:00:00Z"),
      ev("etapa", "cotizar", "backlog", "2026-10-02T00:00:00Z"),
      ev("etapa", "arribo_mercancia", "completado", "2026-10-30T00:00:00Z"),
    ],
    { conAutor: false },
  );
  assert.deepEqual(
    h.map((l) => [l.antes, l.despues]),
    [
      ["produccion", "enviado"],
      [null, "por_cotizar"],
    ],
  );
});

test("de una línea de producto queda solo la cantidad y el monto", () => {
  assert.equal(cantidadDeLinea("ACEITE/CALABAZA · Aceite de calabaza · 1.040 u. · $1.270,00"), "1.040 u. · $1.270,00");
  assert.equal(cantidadDeLinea("500 u."), "500 u.");
  assert.equal(cantidadDeLinea("sin cantidad"), null);
  const [l] = historialDePedido([ev("productoCambiado", "SKU · Producto · 1.000 u. · $3.340,00", "500 u. · $1.700,00", "2026-10-11T00:00:00Z")], { conAutor: false });
  assert.deepEqual([l.tipo, l.antes, l.despues], ["cantidad", "1.000 u. · $3.340,00", "500 u. · $1.700,00"]);
});

test("fecha de confirmación: la última vez que pasó a producción", () => {
  assert.deepEqual(
    fechasDeConfirmacion([
      { compra_id: "a", valor_despues: "produccion", ocurrido_en: "2026-10-10T00:00:00Z" },
      { compra_id: "a", valor_despues: "produccion", ocurrido_en: "2026-10-12T00:00:00Z" },
      { compra_id: "b", valor_despues: "cotizado", ocurrido_en: "2026-10-12T00:00:00Z" },
    ]),
    { a: "2026-10-12T00:00:00Z" },
  );
});
