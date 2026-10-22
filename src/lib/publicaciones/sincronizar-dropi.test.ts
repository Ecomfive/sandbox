import assert from "node:assert/strict";
import test from "node:test";
import { bodegasEnOrden, cambiosDesdeDropi, codigoBodega, idsDeDropi, normalizarProductoProveedor, productoPrincipal, ubicacionDeBodega, ubicacionDeProducto, type ProductoProveedor } from "./sincronizar-dropi";

const HOY = "2026-10-22";
const prod = (id: number, extra: Partial<ProductoProveedor> = {}): ProductoProveedor => ({
  id,
  nombre: `P${id}`,
  tipo: "SIMPLE",
  archivado: false,
  privado: false,
  precio: 9.99,
  precioSugerido: 9.99,
  stock: 10,
  stockPrivado: 0,
  bodegas: [{ id: 81, nombre: "Proveedor Ecomfive", stock: 10 }],
  categorias: [],
  fotos: 1,
  creado: null,
  ...extra,
});

test("normalizar: un simple con su bodega y uno variable con las variaciones sumadas por bodega", () => {
  const simple = normalizarProductoProveedor(
    { id: 7587, name: "URO/PROBIOTIC (B280)", type: "SIMPLE", sale_price: 5.49, suggested_price: 5.49, total_stock: 185, private_stock: 0, private_product: false, warehouses: [{ id: 280, name: "Bodega Dropi Panama", stock: 185 }], variation_warehouses: [], gallery: [{}], categories: [{ name: "Salud" }], created_at: "2026-01-26T10:00:00" },
    false,
  );
  assert.deepEqual(simple?.bodegas, [{ id: 280, nombre: "Bodega Dropi Panama", stock: 185 }]);
  assert.equal(simple?.stock, 185);
  assert.deepEqual(simple?.categorias, ["Salud"]);
  const variable = normalizarProductoProveedor(
    { id: 8559, name: "Rodillera", type: "VARIABLE", sale_price: 4.99, total_stock: 52, warehouses: [], variation_warehouses: [{ id: 81, name: "Proveedor Ecomfive", stock: 9 }, { id: 81, name: "Proveedor Ecomfive", stock: 20 }, { id: 81, name: "Proveedor Ecomfive", stock: 23 }] },
    true,
  );
  assert.deepEqual(variable?.bodegas, [{ id: 81, nombre: "Proveedor Ecomfive", stock: 52 }]);
  assert.equal(variable?.archivado, true);
  assert.equal(normalizarProductoProveedor({ id: 1 }, false), null);
});

test("código de bodega y orden: B + su ID, la de más stock primero", () => {
  assert.equal(codigoBodega(280), "B280");
  assert.equal(codigoBodega(81), "B81");
  assert.deepEqual(
    bodegasEnOrden([{ id: 81, stock: 3 }, { id: 280, stock: 40 }]).map((b) => b.id),
    [280, 81],
  );
});

test("ubicación: por el nombre de la bodega, y la de más stock si hay varias", () => {
  assert.equal(ubicacionDeBodega("Bodega Dropi Panama"), "bodega_dropi");
  assert.equal(ubicacionDeBodega("Proveedor Ecomfive"), "bodega_ecomfive");
  assert.equal(ubicacionDeBodega("Bodega Effi Panamá"), "bodega_effi");
  assert.equal(ubicacionDeBodega("Otra"), null);
  const dos = prod(1, { bodegas: [{ id: 81, nombre: "Proveedor Ecomfive", stock: 3 }, { id: 280, nombre: "Bodega Dropi Panama", stock: 40 }] });
  assert.equal(ubicacionDeProducto(dos), "bodega_dropi");
  assert.equal(ubicacionDeProducto(prod(2, { bodegas: [] })), null);
});

test("producto principal: el activo, entre activos el de más stock, y si ninguno está activo el primero", () => {
  const m = new Map([prod(8165, { archivado: true }), prod(7409), prod(7410, { stock: 50 })].map((p) => [p.id, p]));
  assert.equal(productoPrincipal([8165, 7409], m)?.id, 7409);
  assert.equal(productoPrincipal([7409, 7410], m)?.id, 7410);
  assert.equal(productoPrincipal([8165, 9999], m)?.id, 8165);
  assert.equal(productoPrincipal([9999], m), null);
  assert.deepEqual(idsDeDropi("8165/7409"), [8165, 7409]);
  assert.deepEqual(idsDeDropi("7231-7679"), [7231, 7679]);
  assert.deepEqual(idsDeDropi(null), []);
});

test("cambios: Dropi manda en ubicación, precio (y la fecha del cambio), tipo y estado", () => {
  const { cambios, detalle } = cambiosDesdeDropi(
    { ubicacion: "bodega_dropi", precioVenta: 3.99, tipo: "publico", estadoPublicacion: "activo" },
    prod(1, { precio: 4.99, privado: true, archivado: true }),
    HOY,
  );
  assert.deepEqual(cambios, { ubicacion: "bodega_ecomfive", precio_venta: 4.99, ultimo_cambio_precio: HOY, tipo_publicacion: "privado", estado_publicacion: "archivado" });
  assert.equal(detalle.length, 4);
  assert.equal(detalle[1], "Precio: $3.99 → $4.99");
});

test("cambios: nada si ya coincide, y un archivado sin bodegas no borra la ubicación", () => {
  assert.deepEqual(cambiosDesdeDropi({ ubicacion: "bodega_ecomfive", precioVenta: 9.99, tipo: "publico", estadoPublicacion: "activo" }, prod(1), HOY).cambios, {});
  const r = cambiosDesdeDropi({ ubicacion: "bodega_dropi", precioVenta: 9.99, tipo: "publico", estadoPublicacion: "activo" }, prod(1, { archivado: true, bodegas: [], stock: 0 }), HOY);
  assert.deepEqual(r.cambios, { estado_publicacion: "archivado" });
});
