import assert from "node:assert/strict";
import test from "node:test";
import { APAGAR_JS, armarApagado, CONCEPTO_APAGAR, grupoDe, nombreDelPublico, normalizarDatosDevolver, normalizarUnidades, privadasDe, type PublicacionParaApagar } from "./apagar-dropi";
import { ARMAR_JS, marcadorAplicarDropi } from "./marcador-aplicar-dropi";
import { PRIVATIZAR_JS } from "./privatizar-dropi";
import { REPUBLICAR_JS } from "./republicar-dropi";

type Obj = Record<string, unknown>;
const delFavorito = new Function(`${ARMAR_JS};${REPUBLICAR_JS};${PRIVATIZAR_JS};${APAGAR_JS}; return { apagado };`)() as { apagado: (o: Obj, bp: Obj[], q: boolean) => Obj };
const igual = (a: unknown, b: unknown) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

const bp = [{ id: 81, name: "Proveedor Ecomfive", address: "Ave Centenario, Costa del Este", warehouse_white_brand: false }];
const bodega81 = { id: 81, name: "Proveedor Ecomfive", address: "Ave Centenario, Costa del Este", warehouse_white_brand: false };
// Un producto como lo devuelve `GET api/products/<id>` (lo que usa el armado).
const producto = (extra: Obj = {}): Obj => ({
  id: 8406, name: "Aceite de Semilla de Calabaza", description: "<p>x</p>", dropi_app_description: null, type: "SIMPLE", sale_price: "5.90", suggested_price: "5.90",
  user_id: 2094, privated_product: false, active: true, sku: "ACEITE/CALABAZA", weight: "1.00", length: "1.00", width: "1.00", height: "1.00", variations: [],
  categories: [{ id: 4, name: "Belleza" }], add_stock_in_return: false, private_product_inventories: [], user_profit_percentage_product: [], is_warehouse_white_brand: false,
  name_in_guide: "ACEITE/CALABAZA", shipping_method: null, bar_code: null, dropi_product_supplier_increment_fixed: false, archived: null,
  warehouse_product: [{ warehouse_id: 81, stock: 300, warehouse: bodega81 }], gallery: [], ...extra,
});

const pub = (id: string, nombre: string, tipo: "publico" | "privado" | null, archivada = false): PublicacionParaApagar => ({ id, nombre, tipo, dropiId: id, archivada });

test("un producto privado se reconoce por su nombre sin el «P-XX»; las privadas de una pública salen del mismo nombre", () => {
  assert.equal(nombreDelPublico("P-MA Aceite de semilla de calabaza."), nombreDelPublico("Aceite de Semilla de Calabaza"));
  assert.equal(nombreDelPublico("P-D CREMA HIDRATANTE NIDA"), "crema hidratante nida");
  const todas = [
    pub("8406", "Aceite de Semilla de Calabaza", "publico"),
    pub("11178", "P-MA Aceite de semilla de calabaza.", "privado"),
    pub("8770", "P-SR Aceite de Semilla de Calabaza", "privado", true),
    pub("8506", "CREMA HIDRATANTE NIDA", "publico"),
    pub("8509", "P-D CREMA HIDRATANTE NIDA", "privado"),
    pub("9634", "Cutting Mix", "publico"),
  ];
  assert.deepEqual(privadasDe(todas[0], todas).map((x) => x.id), ["11178", "8770"]);
  assert.deepEqual(privadasDe(todas[3], todas).map((x) => x.id), ["8509"]);
  assert.deepEqual(privadasDe(todas[5], todas), []);
  // Una privada no tiene privadas; un público con otro nombre parecido no se confunde.
  assert.deepEqual(privadasDe(todas[1], todas), []);
  assert.deepEqual(privadasDe(pub("1", "Aceite de Semilla", "publico"), todas), []);
});

test("el grupo de un producto: desde el público, sus privadas; desde una privada, el público y las otras privadas", () => {
  const todas = [
    pub("8406", "Aceite de Semilla de Calabaza", "publico"),
    pub("11178", "P-MA Aceite de semilla de calabaza.", "privado"),
    pub("8770", "P-SR Aceite de Semilla de Calabaza", "privado", true),
    pub("9634", "Cutting Mix", "publico"),
  ];
  assert.deepEqual(grupoDe(todas[0], todas).map((x) => x.id), ["11178", "8770"]);
  assert.deepEqual(grupoDe(todas[1], todas).map((x) => x.id).sort(), ["8406", "8770"]);
  assert.deepEqual(grupoDe(todas[3], todas), []);
});

test("apagar el público: salida de todo el stock con el concepto «stock» y sin tocar privatizaciones", () => {
  const r = armarApagado(producto(), bp, false);
  assert.ok("cuerpo" in r && r.cuerpo);
  assert.equal(r.unidades, 300);
  const b = (r.cuerpo!.warehouselected as Obj[])[0];
  assert.deepEqual([b.warehouse_id, b.quantity, b.type_movement, b.concept], [81, 300, "SALIDA", CONCEPTO_APAGAR]);
  assert.equal(r.cuerpo!.id, 8406);
});

test("apagar un privado: además de sacar el stock, deja sin privatización; sin quitarlas, las deja", () => {
  const privado = producto({ id: 11178, private_product_inventories: [{ id: 77, product_id: 11178, user_id: 5, stock: 5, deleted_at: null, email: "a@b.c" }] });
  const con = armarApagado(privado, bp, true);
  assert.ok("cuerpo" in con && con.cuerpo);
  // Como lo hace la pantalla de Dropi: la reserva no se borra de la lista, va marcada como quitada.
  const quitadas = con.cuerpo!.private_product_inventories as Obj[];
  assert.equal(quitadas.length, 1);
  assert.deepEqual([quitadas[0].id, quitadas[0].user_id, quitadas[0].deleted_at, quitadas[0].change, quitadas[0].email], [77, 5, true, true, "a@b.c"]);
  assert.equal(con.privadas, 1);
  const sin = armarApagado(privado, bp, false);
  assert.ok("cuerpo" in sin && sin.cuerpo);
  assert.equal((sin.cuerpo!.private_product_inventories as Obj[]).length, 1);
});

test("si ya está en cero solo se archiva (nada que guardar); si queda solo la privatización, se guarda sin movimiento", () => {
  const cero = armarApagado(producto({ warehouse_product: [] }), bp, true);
  assert.ok("cuerpo" in cero);
  assert.equal(cero.cuerpo, null);
  const soloPrivada = armarApagado(producto({ warehouse_product: [], private_product_inventories: [{ stock: 2, deleted_at: null }] }), bp, true);
  assert.ok("cuerpo" in soloPrivada && soloPrivada.cuerpo);
  assert.equal((soloPrivada.cuerpo!.private_product_inventories as Obj[])[0].deleted_at, true);
  assert.equal(soloPrivada.unidades, 0);
  // Una privatización ya borrada no cuenta.
  const borrada = armarApagado(producto({ warehouse_product: [], private_product_inventories: [{ stock: 2, deleted_at: "2026-10-01" }] }), bp, true);
  assert.ok("cuerpo" in borrada);
  assert.equal(borrada.cuerpo, null);
});

test("no se apaga con variaciones ni con stock en la bodega de Dropi (B280)", () => {
  assert.ok("error" in armarApagado(producto({ type: "VARIABLE" }), bp, false));
  const b280 = armarApagado(producto({ warehouse_product: [{ warehouse_id: 280, stock: 10, warehouse: { id: 280, name: "Bodega Dropi Panama" } }] }), bp, false);
  assert.ok("error" in b280);
  assert.match((b280 as { error: string }).error, /B280/);
});

test("el favorito arma exactamente lo mismo que el sistema", () => {
  const casos: Obj[] = [
    producto(),
    producto({ warehouse_product: [] }),
    producto({ private_product_inventories: [{ stock: 5, deleted_at: null }] }),
    producto({ warehouse_product: [], private_product_inventories: [{ stock: 2, deleted_at: null }] }),
    producto({ type: "VARIABLE" }),
    producto({ warehouse_product: [{ warehouse_id: 280, stock: 10, warehouse: { id: 280, name: "Bodega Dropi Panama" } }] }),
  ];
  for (const o of casos) for (const q of [true, false]) igual(delFavorito.apagado(o, bp, q), armarApagado(o, bp, q));
});

test("el favorito apaga lo marcado «apagar», archiva con el endpoint de Dropi y reintenta solo el archivado", () => {
  const codigo = decodeURIComponent(marcadorAplicarDropi("https://sistema.ecomfive.io").slice("javascript:".length));
  assert.ok(codigo.includes("if(c.tipo==='apagar')return apagar(c,bp);"));
  assert.ok(codigo.includes("/archiveProduct"));
  // Sin archivar por órdenes pendientes: ok con archivado false (queda pendiente), no un error.
  assert.ok(codigo.includes("return R({ok:true,archivado:false,error:"));
  assert.doesNotThrow(() => new Function(codigo));
});

test("quitar privatización: los datos de devolver se limpian (sin público no hay devolución)", () => {
  assert.equal(normalizarDatosDevolver(null), null);
  assert.equal(normalizarDatosDevolver({ publico: "abc" }), null);
  assert.deepEqual(normalizarDatosDevolver({ publico: 8406, publicacionId: "x", unidades: { "81": 50, "82": 0, malo: 3, "83": 1.5 }, devuelto: "sí" }), { publico: 8406, publicacionId: null, unidades: { "81": 50 }, devuelto: false });
  assert.equal(normalizarUnidades({ "81": 0 }), null);
  assert.deepEqual(normalizarUnidades({ "81": "12" }), { "81": 12 });
});
