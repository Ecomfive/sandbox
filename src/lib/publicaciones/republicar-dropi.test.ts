import assert from "node:assert/strict";
import test from "node:test";
import { ARMAR_JS, marcadorAplicarDropi } from "./marcador-aplicar-dropi";
import { armarMovimientoStock, armarProductoNuevo, CDN_FOTOS_DROPI, fotosParaCopiar, REPUBLICAR_JS, stockPorBodega } from "./republicar-dropi";

type Obj = Record<string, unknown>;
const delFavorito = new Function(`${ARMAR_JS};${REPUBLICAR_JS}; return { nuevo, mover, stockDe, fotosDe };`)() as {
  nuevo: (o: Obj, bp: Obj[], p?: { precio?: number | null; precioSugerido?: number | null }) => Obj;
  mover: (o: Obj, bp: Obj[], m: Record<string, number>, k: string) => Obj;
  stockDe: (o: Obj) => Record<string, number>;
  fotosDe: (o: Obj) => Obj[];
};
const igual = (a: unknown, b: unknown) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

const bp = [{ id: 81, name: "Proveedor Ecomfive", address: "Ave Centenario, Costa del Este", warehouse_white_brand: false }];
// El 8751 (Aceite Veganic) como lo devuelve `GET api/products/8751` el 23 oct 2026 (lo que usa el armado).
const veganic: Obj = {
  id: 8751, name: "Aceite Veganic Crecimiento de Cabello", description: "<h2>ACEITE NATURAL VEGANIC</h2>", dropi_app_description: null, type: "SIMPLE",
  sale_price: "5.90", suggested_price: "5.90", user_id: 2094, privated_product: false, active: true, sku: "ACEITE/VEGANIC/OIL", weight: "1.00", length: "1.00",
  width: "1.00", height: "1.00", variations: [], categories: [{ id: 4, name: "Belleza" }], add_stock_in_return: false, private_product_inventories: [],
  user_profit_percentage_product: [], is_warehouse_white_brand: false, name_in_guide: "ACEITE/VEGANIC/OIL", shipping_method: null, bar_code: null,
  dropi_product_supplier_increment_fixed: false, archived: null,
  warehouse_product: [{ warehouse_id: 81, stock: 224, warehouse: { id: 81, name: "Proveedor Ecomfive", address: "Ave Centenario, Costa del Este", warehouse_white_brand: false } }],
  gallery: [
    { id: 15766, main: false, urlS3: "panama/products/8751/1779932274veganic 4.png", url: null, variation_id: null },
    { id: 15765, main: true, urlS3: "panama/products/8751/1779932274veganic.jpg", url: null, variation_id: null },
  ],
};

test("el producto nuevo: el mismo guardado sin ID, sin reservas a privados y con el stock de hoy en cada bodega", () => {
  const r = armarProductoNuevo(veganic, bp);
  assert.ok("cuerpo" in r);
  assert.equal(r.cuerpo.id, null);
  assert.equal(r.cuerpo.name, "Aceite Veganic Crecimiento de Cabello");
  assert.equal(r.cuerpo.name_in_guide, "ACEITE/VEGANIC/OIL");
  assert.equal(r.cuerpo.sale_price, 5.9);
  assert.deepEqual(r.cuerpo.private_product_inventories, []);
  assert.deepEqual(
    (r.cuerpo.warehouselected as Obj[]).map((b) => [b.warehouse_id, b.stock]),
    [[81, 224]],
  );
});

test("no se republica: con variaciones, con stock en la B280, con privados o con porcentajes por dropshipper", () => {
  assert.ok("error" in armarProductoNuevo({ ...veganic, type: "VARIABLE" }, bp));
  assert.match(String((armarProductoNuevo({ ...veganic, warehouse_product: [{ warehouse_id: 280, stock: 10, warehouse: { id: 280, name: "Bodega Dropi Panama" } }] }, bp) as { error: string }).error), /B280/);
  assert.match(String((armarProductoNuevo({ ...veganic, private_product_inventories: [{ stock: 5, deleted_at: null }] }, bp) as { error: string }).error), /privatizadas/);
  assert.ok("cuerpo" in armarProductoNuevo({ ...veganic, private_product_inventories: [{ stock: 5, deleted_at: "2026-10-01" }] }, bp));
  assert.ok("error" in armarProductoNuevo({ ...veganic, user_profit_percentage_product: [{ user_id: 9 }] }, bp));
});

test("mover stock: salida del viejo con su concepto, entrada en el nuevo aunque la bodega no tenga stock todavía", () => {
  const salida = armarMovimientoStock(veganic, bp, { "81": -224 }, "Republicado como ID 9001");
  assert.ok("cuerpo" in salida);
  igual(salida.cuerpo.warehouselected, [{ warehouse_id: 81, fullName: "Proveedor Ecomfive(Ave Centenario, Costa del Este)", stock: 224, warehouse_white_brand: false, quantity: 224, type_movement: "SALIDA", concept: "Republicado como ID 9001" }]);
  assert.equal(salida.cuerpo.id, 8751);
  const entrada = armarMovimientoStock({ ...veganic, id: 9001, warehouse_product: [] }, bp, { "81": 224 }, "Republicado desde el ID 8751");
  assert.ok("cuerpo" in entrada);
  assert.deepEqual((entrada.cuerpo.warehouselected as Obj[]).map((b) => [b.warehouse_id, b.quantity, b.type_movement]), [[81, 224, "ENTRADA"]]);
  assert.ok("error" in armarMovimientoStock(veganic, bp, { "999": 5 }, "x"));
});

test("las fotos: la principal primero, desde el CDN de Dropi (con los espacios codificados)", () => {
  assert.deepEqual(fotosParaCopiar(veganic), [
    { url: `${CDN_FOTOS_DROPI}/panama/products/8751/1779932274veganic.jpg`, nombre: "1779932274veganic.jpg", main: true, alternas: [] },
    { url: `${CDN_FOTOS_DROPI}/panama/products/8751/1779932274veganic%204.png`, nombre: "1779932274veganic 4.png", main: false, alternas: [] },
  ]);
  assert.deepEqual(stockPorBodega(veganic), { "81": 224 });
});

test("el favorito arma exactamente lo mismo que el sistema", () => {
  const casos: Obj[] = [veganic, { ...veganic, type: "VARIABLE" }, { ...veganic, warehouse_product: [] }, { ...veganic, private_product_inventories: [{ stock: 2, deleted_at: null }] }];
  for (const o of casos) {
    igual(delFavorito.nuevo(o, bp), armarProductoNuevo(o, bp));
    // Con el precio elegido al republicar, los dos lo ponen igual (precio y sugerido).
    igual(delFavorito.nuevo(o, bp, { precio: 5.99, precioSugerido: 5.99 }), armarProductoNuevo(o, bp, { precio: 5.99, precioSugerido: 5.99 }));
    igual(delFavorito.mover(o, bp, { "81": -224 }, "k"), armarMovimientoStock(o, bp, { "81": -224 }, "k"));
    igual(delFavorito.mover(o, bp, { "81": 7 }, "k"), armarMovimientoStock(o, bp, { "81": 7 }, "k"));
    igual(delFavorito.stockDe(o), stockPorBodega(o));
    igual(delFavorito.fotosDe(o), fotosParaCopiar(o));
  }
});

test("el favorito republica solo lo que viene marcado «republicar» y sube fotos al mismo endpoint de Dropi", () => {
  const codigo = decodeURIComponent(marcadorAplicarDropi("https://sistema.ecomfive.io").slice("javascript:".length));
  assert.ok(codigo.includes("if(c.tipo==='republicar')return republicar(c,bp);"));
  assert.ok(codigo.includes("/products/photos/upload"));
  assert.ok(codigo.includes("/archiveProduct"));
  // El código entero se puede leer como JavaScript.
  assert.doesNotThrow(() => new Function(codigo));
});

test("una foto sin urlS3 se intenta también desde el CDN de Dropi (en el favorito igual)", () => {
  const o: Obj = { ...veganic, id: 10474, gallery: [
    { id: 1, main: true, urlS3: "panama/products/10474/a.jpg", url: null, variation_id: null },
    { id: 2, main: false, urlS3: null, url: "https://dropi-bucket.s3.amazonaws.com/panama/products/10474/6bc9.png", variation_id: null },
    { id: 3, main: false, urlS3: "", url: "https://otro.example/x/6bca.png", variation_id: null },
  ] };
  const fotos = fotosParaCopiar(o);
  assert.deepEqual(fotos[1].alternas, [`${CDN_FOTOS_DROPI}/panama/products/10474/6bc9.png`]);
  assert.deepEqual(fotos[2].alternas, [`${CDN_FOTOS_DROPI}/panama/products/10474/6bca.png`]);
  igual(delFavorito.fotosDe(o), fotos);
});

test("si ninguna foto dice la carpeta del CDN, se usa la del país (en el favorito igual)", () => {
  const o: Obj = { ...veganic, id: 10474, gallery: [{ id: 2, main: true, urlS3: null, url: "http://otro.example/x/6bc9.png", variation_id: null }] };
  assert.deepEqual(fotosParaCopiar(o, "pa")[0].alternas, [`${CDN_FOTOS_DROPI}/panama/products/10474/6bc9.png`]);
  assert.deepEqual(fotosParaCopiar(o)[0].alternas, []);
  const conPais = new Function(`var P="pa";${ARMAR_JS};${REPUBLICAR_JS}; return fotosDe;`)() as (o: Obj) => Obj[];
  igual(conPais(o), fotosParaCopiar(o, "pa"));
});
