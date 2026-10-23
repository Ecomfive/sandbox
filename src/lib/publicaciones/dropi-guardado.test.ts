import assert from "node:assert/strict";
import test from "node:test";
import { armarGuardadoProducto, faltaEnDropi, leerTokenDropi } from "./dropi-guardado";

// Lo que devolvió `GET api/products/7587` (recortado) y lo que mandó la pantalla de Dropi al guardarlo (atrapado sin enviar, 22 oct 2026).
const ciudad = { id: 501, department_id: 1, name: "CIUDAD DE PANAMA" };
const producto7587 = {
  id: 7587,
  name: "URO/PROBIOTIC (B280)",
  description: "<p>Probióticos</p>",
  dropi_app_description: null,
  type: "SIMPLE",
  sale_price: "5.49",
  suggested_price: "5.49",
  user_id: 2094,
  privated_product: false,
  active: true,
  sku: "URO/PROBIOTIC (B280)",
  weight: "1.00",
  length: "1.00",
  width: "1.00",
  height: "1.00",
  variations: [],
  categories: [{ id: 4, name: "Salud", parent_category: 0 }],
  add_stock_in_return: false,
  private_product_inventories: [],
  user_profit_percentage_product: [],
  is_warehouse_white_brand: false,
  name_in_guide: null,
  shipping_method: null,
  bar_code: null,
  dropi_product_supplier_increment_fixed: false,
  warehouse_product: [{ id: 13734, warehouse_id: 280, product_id: 7587, stock: 185, warehouse: { id: 280, name: "Bodega Dropi Panama", city: ciudad, warehouse_white_brand: true } }],
  gallery: [{ urlS3: "x.png" }],
};
const bodegasProveedor = [{ id: 81, name: "Proveedor Ecomfive", address: "Ave Centenario, Costa del Este", warehouse_white_brand: false }];
const claves = "id name description dropi_app_description type sale_price suggested_price user_id privated_product active sku weight length width height attribute variations categories add_stock_in_return private_product_inventories user_profit_percentage_product is_warehouse_white_brand warehouselected warehouse_previus controlChangesPhotos name_in_guide shipping_method bar_code dropi_product_supplier_increment_fixed".split(" ");

test("el guardado tiene los mismos 29 campos que manda la pantalla de Dropi, en el mismo orden", () => {
  const r = armarGuardadoProducto(producto7587, bodegasProveedor, { nombre: "Probióticos URO", nombreGuia: "URO/PROBIOTIC" });
  assert.ok("cuerpo" in r);
  assert.deepEqual(Object.keys(r.cuerpo), claves);
  assert.equal(r.cuerpo.name, "Probióticos URO");
  assert.equal(r.cuerpo.name_in_guide, "URO/PROBIOTIC");
  // Lo demás, tal cual: precios y medidas como números, el SKU de Dropi sin tocar, sin fotos ni bodegas previas.
  assert.equal(r.cuerpo.sale_price, 5.49);
  assert.equal(r.cuerpo.weight, 1);
  assert.equal(r.cuerpo.sku, "URO/PROBIOTIC (B280)");
  assert.equal(r.cuerpo.description, "<p>Probióticos</p>");
  assert.deepEqual(r.cuerpo.controlChangesPhotos, []);
  assert.equal(r.cuerpo.warehouse_previus, null);
  assert.equal("gallery" in r.cuerpo, false);
});

test("bodegas: las del producto (con su stock) y después las del proveedor, sin repetir", () => {
  const r = armarGuardadoProducto(producto7587, bodegasProveedor, { nombre: "X nombre", nombreGuia: null });
  assert.ok("cuerpo" in r);
  assert.deepEqual(r.cuerpo.warehouselected, [
    { warehouse_id: 280, fullName: "Bodega Dropi Panama()", stock: 185, city: ciudad, warehouse_white_brand: true },
    { fullName: "Proveedor Ecomfive(Ave Centenario, Costa del Este)", warehouse_id: 81, warehouse_white_brand: false },
  ]);
  // Sin stock (el 8179): Dropi no lista bodegas del producto y la pantalla manda solo la del proveedor.
  const sinStock = armarGuardadoProducto({ ...producto7587, warehouse_product: [] }, bodegasProveedor, { nombre: "X nombre", nombreGuia: null });
  assert.ok("cuerpo" in sinStock);
  assert.deepEqual((sinStock.cuerpo.warehouselected as unknown[]).length, 1);
  // Sin nombre de guía nuevo se queda el que tenía (la pantalla manda "" si no había).
  assert.equal(sinStock.cuerpo.name_in_guide, "");
});

test("no se toca un producto con variaciones ni un nombre de más de 40", () => {
  assert.deepEqual(armarGuardadoProducto({ ...producto7587, type: "VARIABLE" }, bodegasProveedor, { nombre: "X", nombreGuia: null }), { error: "Tiene variaciones: cámbialo a mano en Dropi." });
  assert.ok("error" in armarGuardadoProducto(producto7587, bodegasProveedor, { nombre: "x".repeat(41), nombreGuia: null }));
  assert.ok("error" in armarGuardadoProducto(producto7587, bodegasProveedor, { nombre: "ok", nombreGuia: "y".repeat(41) }));
});

test("verificación después de guardar y lectura de la sesión", () => {
  assert.equal(faltaEnDropi({ name: "A", name_in_guide: "G" }, { nombre: "A", nombreGuia: "G" }), null);
  assert.match(faltaEnDropi({ name: "Viejo", name_in_guide: "G" }, { nombre: "A", nombreGuia: "G" })!, /Viejo/);
  assert.match(faltaEnDropi({ name: "A", name_in_guide: null }, { nombre: "A", nombreGuia: "G" })!, /guía/);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const t = leerTokenDropi(`${b64({ alg: "HS256" })}.${b64({ sub: "2094", exp: 1792720664 })}.firma`);
  assert.equal(t?.usuarioId, 2094);
  assert.equal(t?.venceEn.toISOString(), "2026-10-23T01:57:44.000Z");
  assert.equal(leerTokenDropi("no-es-un-token"), null);
});

test("precios: solo se cambia lo que se pide y el sugerido no queda menor que el precio", () => {
  const solo = armarGuardadoProducto({ ...producto7587, suggested_price: "12.99" }, bodegasProveedor, { nombre: null, nombreGuia: null, precio: 5.29 });
  assert.ok("cuerpo" in solo);
  if ("cuerpo" in solo) {
    assert.equal(solo.cuerpo.sale_price, 5.29);
    assert.equal(solo.cuerpo.suggested_price, 12.99);
    assert.equal(solo.cuerpo.name, producto7587.name);
  }
  // Subir el precio por encima del sugerido sube también el sugerido, con la misma proporción (igual al precio si eran iguales).
  const igual = armarGuardadoProducto({ ...producto7587, sale_price: "5.49", suggested_price: "5.49" }, bodegasProveedor, { nombre: null, nombreGuia: null, precio: 6.99 });
  assert.ok("cuerpo" in igual && igual.cuerpo.suggested_price === 6.99);
  const conMargen = armarGuardadoProducto({ ...producto7587, sale_price: "5.00", suggested_price: "6.50" }, bodegasProveedor, { nombre: null, nombreGuia: null, precio: 7.0 });
  assert.ok("cuerpo" in conMargen && conMargen.cuerpo.suggested_price === 9.1);
  assert.ok("error" in armarGuardadoProducto({ ...producto7587, suggested_price: "5.49" }, bodegasProveedor, { nombre: null, nombreGuia: null, precio: 6.99, precioSugerido: 6.5 }));
  assert.ok("error" in armarGuardadoProducto(producto7587, bodegasProveedor, { nombre: null, nombreGuia: null, precio: 0 }));
});
