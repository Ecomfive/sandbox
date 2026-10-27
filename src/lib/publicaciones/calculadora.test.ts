import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularMargen, leerMonto, precioParaMargen, productosPorSku, textoWhatsapp, type PublicacionParaCalculo } from "./calculadora";

test("la cuenta de la referencia: Vinagre de Manzana a $8.99 con costo $3.14 y fulfillment $1.50 → $4.35 y 48 %", () => {
  const r = calcularMargen({ costo: 3.14, fulfillment: 1.5, precio: 8.99 })!;
  assert.equal(r.utilidad, 4.35);
  assert.equal(Math.round(r.margen * 100), 48);
  assert.equal(calcularMargen({ costo: 3, fulfillment: 1, precio: 0 }), null);
  assert.equal(calcularMargen({ costo: 9, fulfillment: 2, precio: 10 })!.utilidad, -1);
});

test("los montos se leen con coma o punto, con o sin $", () => {
  assert.equal(leerMonto("8,99"), 8.99);
  assert.equal(leerMonto(" $8.99 "), 8.99);
  assert.equal(leerMonto(""), null);
  assert.equal(leerMonto("abc"), null);
  assert.equal(leerMonto("-3"), null);
});

test("el precio para llegar a un margen se redondea hacia arriba al centavo", () => {
  assert.equal(precioParaMargen(3.14, 1.5, 0.3), 6.63); // 4.64 / 0.7 = 6.628…
  assert.equal(precioParaMargen(0, 0, 0.3), null);
  assert.equal(precioParaMargen(3, 1, 1), null);
});

test("el mensaje para WhatsApp: nombre en negrita con su ID y una línea por dato", () => {
  const d = { costo: 3.14, fulfillment: 1.5, precio: 8.99 };
  const r = calcularMargen(d)!;
  assert.equal(
    textoWhatsapp({ nombre: "Vinagre de Manzana 150 Capsulas", idDropi: "8515", costeReal: 2.62 }, d, r),
    ["*Vinagre de Manzana 150 Capsulas* · ID 8515", "Coste real: $2.62", "Costo de mercancía: $3.14", "Fulfillment: $1.50", "Precio de venta: $8.99", "Utilidad: $4.35", "Margen: 48 %"].join("\n"),
  );
  assert.equal(textoWhatsapp({ nombre: "" }, d, r).split("\n")[0], "*Cálculo de margen*");
});

test("la lista de la calculadora es por SKU: un producto con público y privadas sale una vez, con los datos del público", () => {
  const sku = (id: string, codigo: string) => ({ id, codigo, nombre: `Producto ${codigo}` });
  const pub = (numero: number, dropiId: string, skuP: ReturnType<typeof sku> | null, extra: Partial<PublicacionParaCalculo> = {}): PublicacionParaCalculo => ({
    numero, dropiId, archivada: false, duplicadaDe: null, sinPublicar: false, tipoDropi: "publico", sku: skuP, ...extra,
  });
  const a = sku("a", "ACEITE/OREGANO");
  const b = sku("b", "BOLSO/NAYLA");
  const lista = [
    pub(30, "9001", a, { tipoDropi: "privado" }),
    pub(12, "7001", a),
    pub(40, "7002", a),
    pub(5, "8000", b, { archivada: true }),
    pub(6, "8001", null),
    pub(7, "", b, { sinPublicar: true }),
  ];
  const r = productosPorSku(lista);
  assert.deepEqual(r.map((x) => [x.sku.codigo, x.representante.dropiId]), [["ACEITE/OREGANO", "7001"]]);
  // Un SKU que solo tiene una privada la usa como representante.
  assert.equal(productosPorSku([pub(30, "9001", a, { tipoDropi: "privado" })])[0].representante.dropiId, "9001");
});
