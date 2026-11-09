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
  // La bodega del producto con el ID en texto («81») es la misma que la del proveedor (81): no va dos veces.
  const enTexto = armarGuardadoProducto({ ...producto7587, warehouse_product: [{ warehouse_id: "81", stock: 5, warehouse: { name: "Proveedor Ecomfive", address: "x" } }] }, bodegasProveedor, { nombre: "X nombre", nombreGuia: null });
  assert.ok("cuerpo" in enTexto);
  assert.equal((enTexto.cuerpo.warehouselected as unknown[]).length, 1);
});

test("no se toca un producto con variaciones ni un nombre de más de 40", () => {
  assert.deepEqual(armarGuardadoProducto({ ...producto7587, type: "VARIABLE" }, bodegasProveedor, { nombre: "X", nombreGuia: null }), { error: "Tiene variaciones: cámbialo a mano en Dropi." });
  assert.ok("error" in armarGuardadoProducto(producto7587, bodegasProveedor, { nombre: "x".repeat(41), nombreGuia: null }));
  assert.ok("error" in armarGuardadoProducto(producto7587, bodegasProveedor, { nombre: "ok", nombreGuia: "y".repeat(41) }));
});

test("un producto con variaciones: el precio nuevo va a cada variación (misma proporción) solo si se pide", () => {
  const atributo = { id: 10, product_id: 7587, description: "Talla", isVariation: true, deleted_at: null, values: [{ id: 1, value: "S", attribute_id: 10, attribute_name: "Talla", deleted_at: null }] };
  const variacion = (id: number, venta: string, sugerido: string, borrada: string | null = null) => ({ id, sale_price: venta, suggested_price: sugerido, product_id: 7587, stock: 0, sku: "B/" + id, deleted_at: borrada, attribute_values: [] });
  const variable = { ...producto7587, type: "VARIABLE", sale_price: "10.00", suggested_price: "10.00", attributes: [atributo], variations: [variacion(1, "10.00", "10.00"), variacion(2, "20.00", "25.00"), variacion(3, "7.00", "7.00", "2026-10-01")] };
  const precios = (r: ReturnType<typeof armarGuardadoProducto>, campo: "sale_price" | "suggested_price") => {
    assert.ok("cuerpo" in r);
    return "cuerpo" in r ? (r.cuerpo.variations as Record<string, number>[]).map((v) => v[campo]) : [];
  };
  const sin = armarGuardadoProducto(variable, bodegasProveedor, { nombre: null, nombreGuia: null, precio: 5, precioSugerido: 5 }, { variable: true });
  assert.deepEqual(precios(sin, "sale_price"), [10, 20, 7], "sin la opción cada variación conserva su precio");
  const con = armarGuardadoProducto(variable, bodegasProveedor, { nombre: null, nombreGuia: null, precio: 5, precioSugerido: 5 }, { variable: true, precioEnVariaciones: true });
  assert.ok("cuerpo" in con);
  if ("cuerpo" in con) assert.equal(con.cuerpo.sale_price, 5);
  assert.deepEqual(precios(con, "sale_price"), [5, 10, 7], "la borrada no se toca");
  assert.deepEqual(precios(con, "suggested_price"), [5, 10, 7]);
  // Sin sugerido pedido, el de cada variación cambia con la misma proporción, sin quedar menor que su precio.
  const sinSug = armarGuardadoProducto(variable, bodegasProveedor, { nombre: null, nombreGuia: null, precio: 5 }, { variable: true, precioEnVariaciones: true });
  assert.deepEqual(precios(sinSug, "suggested_price"), [5, 12.5, 7]);
  // Sin cambio de precio no se toca ninguna variación aunque se pida la opción.
  const soloNombre = armarGuardadoProducto(variable, bodegasProveedor, { nombre: "Otro", nombreGuia: null }, { variable: true, precioEnVariaciones: true });
  assert.deepEqual(precios(soloNombre, "sale_price"), [10, 20, 7]);
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
