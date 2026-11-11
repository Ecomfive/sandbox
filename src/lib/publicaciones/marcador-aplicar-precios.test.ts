import assert from "node:assert/strict";
import test from "node:test";
import { ARMAR_DROP_JS, CODIGO_APLICAR_PRECIOS, INVENTARIO_DUNAMIXFY_JS, marcadorAplicarPrecios, VERSION_FAVORITO_PRECIOS } from "./marcador-aplicar-precios";

// Las funciones del favorito, sacadas de su JavaScript tal cual va en el favorito.
const drop = new Function(`${ARMAR_DROP_JS}; return { armarDrop, comprobarDrop };`)() as {
  armarDrop: (p: Record<string, unknown>, c: { precio?: number | null; sugerido?: number | null }) => { cuerpo?: Record<string, unknown>; error?: string };
  comprobarDrop: (p: Record<string, unknown>, n: Record<string, unknown>, c: { precio?: number | null; sugerido?: number | null }) => Record<string, unknown>;
};
const dmx = new Function(`${INVENTARIO_DUNAMIXFY_JS}; return { inventarioDmx, cuerpoDmx, comprobarDmx };`)() as {
  inventarioDmx: (p: Record<string, unknown>) => Record<string, unknown> | null;
  cuerpoDmx: (c: { precio?: number | null; sugerido?: number | null }) => Record<string, unknown>;
  comprobarDmx: (i: Record<string, unknown>, n: Record<string, unknown> | null, c: { precio?: number | null; sugerido?: number | null }) => Record<string, unknown>;
};

// Un producto de Drop como lo devuelve GET /products/:id (la Rhodiola Rosea, 9 nov 2026).
const rhodiola = {
  id: "6ae5e72d907fa0ea62f7ff79",
  name: "Rhodiola Rosea",
  description: "Rhodiola Rosea",
  categoryId: "cat1",
  vendorId: "ven1",
  active: true,
  quantity: 240,
  serviceFee: 0,
  warehouse: "BOXFUL",
  variants: [],
  exclusiveSellerIds: [],
  dropPrice: 5449,
  price: 5721.45,
  suggestedPrice: 11673.5,
  suggestedPriceByVendor: false,
};

test("Drop: el guardado es el de su pantalla, con el precio sin comisión y el sugerido solo si lo pusimos", () => {
  assert.deepEqual(drop.armarDrop(rhodiola, { precio: 5999 }).cuerpo, {
    name: "Rhodiola Rosea",
    categoryId: "cat1",
    description: "Rhodiola Rosea",
    quantity: 0,
    vendorId: "ven1",
    active: true,
    serviceFee: 0,
    variants: [],
    price: 5999,
    exclusiveSellerIds: [],
    warehouse: "BOXFUL",
  });
  const conSugerido = drop.armarDrop(rhodiola, { sugerido: 12000 }).cuerpo!;
  assert.equal(conSugerido.price, 5449);
  assert.equal(conSugerido.suggestedPrice, 12000);
  // Un sugerido que ya había puesto el proveedor se conserva.
  assert.equal(drop.armarDrop({ ...rhodiola, suggestedPriceByVendor: true }, { precio: 6000 }).cuerpo!.suggestedPrice, 11673.5);
});

test("Drop: con variantes, otra bodega o exclusivo no se toca", () => {
  assert.ok(drop.armarDrop({ ...rhodiola, variants: [{ id: "v1" }] }, { precio: 6000 }).error);
  assert.ok(drop.armarDrop({ ...rhodiola, warehouse: "VENDOR_ADDRESS" }, { precio: 6000 }).error);
  assert.ok(drop.armarDrop({ ...rhodiola, exclusiveSellerIds: ["s1"] }, { precio: 6000 }).error);
});

test("Drop: confirma el precio nuevo y avisa si cambió otra cosa", () => {
  const ok = drop.comprobarDrop(rhodiola, { ...rhodiola, dropPrice: 5999, price: 6298.95 }, { precio: 5999 });
  assert.equal(ok.ok, true);
  assert.equal(ok.precioProveedor, 5999);
  assert.equal(ok.precio, 6298.95);
  assert.equal(ok.aviso, undefined);
  assert.equal(drop.comprobarDrop(rhodiola, rhodiola, { precio: 5999 }).ok, false);
  const raro = drop.comprobarDrop(rhodiola, { ...rhodiola, dropPrice: 5999, quantity: 0 }, { precio: 5999 });
  assert.equal(raro.ok, true);
  assert.match(String(raro.aviso), /inventario/);
});

// Un producto de Dunamixfy como lo devuelve GET /api/products/:id (el #837: un inventario activo y otro inactivo).
const p837 = {
  productNumberId: 837,
  inventories: [
    { id: "inv-b", isActive: false, price: 5499, suggestedPrice: 17300, stock: 200, cost: 1, warehouse: { isPrincipal: true } },
    { id: "inv-a", isActive: true, price: 5889, suggestedPrice: 0, stock: 3, cost: 1, warehouse: { isPrincipal: true } },
    { id: "inv-p", isActive: true, price: 4000, suggestedPrice: 0, stock: 5, cost: 1, privateUserId: "u1", warehouse: { isPrincipal: true } },
  ],
};

test("Dunamixfy: cambia el inventario activo de nuestra bodega, el mismo que lee el sistema", () => {
  assert.equal(dmx.inventarioDmx(p837)?.id, "inv-a");
  assert.equal(dmx.inventarioDmx({ inventories: [] }), null);
  assert.deepEqual(dmx.cuerpoDmx({ precio: 5999 }), { price: 5999 });
  assert.deepEqual(dmx.cuerpoDmx({ precio: 5999, sugerido: 18000 }), { price: 5999, suggestedPrice: 18000 });
});

test("Dunamixfy: confirma y avisa si cambió el stock", () => {
  const i = p837.inventories[1];
  assert.equal(dmx.comprobarDmx(i, { ...i, price: 5999 }, { precio: 5999 }).ok, true);
  assert.equal(dmx.comprobarDmx(i, i, { precio: 5999 }).ok, false);
  assert.equal(dmx.comprobarDmx(i, null, { precio: 5999 }).ok, false);
  assert.match(String(dmx.comprobarDmx(i, { ...i, price: 5999, stock: 0 }, { precio: 5999 }).aviso), /stock/);
});

test("el favorito es JavaScript válido, con su origen y su versión", () => {
  assert.doesNotThrow(() => new Function(CODIGO_APLICAR_PRECIOS.replace("__ORIGEN__", '"https://x.test"').replace("__VERSION__", '"abc"')));
  const m = marcadorAplicarPrecios("https://mom-beta-proveduria.vercel.app");
  assert.ok(m.startsWith("javascript:"));
  assert.ok(decodeURIComponent(m).includes('"https://mom-beta-proveduria.vercel.app"'));
  assert.ok(decodeURIComponent(m).includes(JSON.stringify(VERSION_FAVORITO_PRECIOS)));
  assert.throws(() => marcadorAplicarPrecios("http://ejemplo.com"));
});
