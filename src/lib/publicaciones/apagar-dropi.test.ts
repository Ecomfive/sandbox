import assert from "node:assert/strict";
import test from "node:test";
import { APAGAR_JS, armarApagado, armarApagadoVariable, armarEntradaVariable, armarProductoNuevoVariable, CONCEPTO_APAGAR, emparejarDevolucion, firmaVariacion, grupoDe, nombreDelPublico, normalizarDatosDevolver, normalizarUnidades, privadasDe, unidadesDeVariable, unidadesTotales, variacionesVivas, type PublicacionParaApagar } from "./apagar-dropi";
import { ARMAR_JS, marcadorAplicarDropi } from "./marcador-aplicar-dropi";
import { PRIVATIZAR_JS } from "./privatizar-dropi";
import { REPUBLICAR_JS } from "./republicar-dropi";

type Obj = Record<string, unknown>;
const delFavorito = new Function(`${ARMAR_JS};${REPUBLICAR_JS};${PRIVATIZAR_JS};${APAGAR_JS}; return { apagado, apagadoV, emparejarV, entradaV, unidadesV, firmaV, nuevoV };`)() as {
  nuevoV: (o: Obj, bp: Obj[]) => Obj;
  apagado: (o: Obj, bp: Obj[], q: boolean) => Obj;
  apagadoV: (o: Obj, bp: Obj[], q: boolean, en: Obj[][], cp?: string) => Obj;
  emparejarV: (o: Obj, u: Record<string, number>) => Obj;
  entradaV: (o: Obj, bp: Obj[], pv: Record<string, Record<string, number>>, en: Obj[][], k: string) => Obj;
  unidadesV: (o: Obj) => Record<string, number>;
  firmaV: (v: Obj) => string;
};
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

// ---- productos con variaciones ----
const talla = (n: number, v: string) => ({ id: 100 + n, value: v, attribute_id: 10, attribute_name: "Talla", deleted_at: null });
const conTallas = (id: number, stocks: Record<string, number>, extra: Obj = {}): Obj =>
  producto({
    id, type: "VARIABLE", warehouse_product: [],
    attributes: [{ id: 10, product_id: id, description: "Talla", isVariation: true, deleted_at: null, values: Object.keys(stocks).map((v, i) => talla(i, v)) }],
    variations: Object.keys(stocks).map((v, i) => ({
      id: id * 10 + i, sale_price: "9.90", suggested_price: "9.90", product_id: id, stock: 0, sku: `BODY/${v}`, deleted_at: null, attribute_values: [talla(i, v)],
      warehouse_product_variation: [{ variation_id: id * 10 + i, warehouse_id: 81, stock: stocks[v] }],
    })),
    ...extra,
  });
/** Lo que Dropi devuelve de `get_warehouses_stock` por variación. */
const entradasDe = (o: Obj): Obj[][] => variacionesVivas(o).map((v) => (v.warehouse_product_variation as Obj[]).map((w) => ({ variation_id: v.id, warehouse_id: w.warehouse_id, stock: w.stock, fullName: "Proveedor Ecomfive(Ave)" })));

test("variaciones: cada variación se reconoce por sus atributos (o su SKU) y las unidades salen por bodega y variación", () => {
  const o = conTallas(7263, { S: 5, M: 0, L: 3 });
  assert.equal(firmaVariacion(variacionesVivas(o)[0]), "talla=s");
  assert.equal(firmaVariacion({ sku: "BODY/ÚNICA", attribute_values: [] }), "body unica");
  assert.deepEqual(unidadesDeVariable(o), { "81|talla=s": 5, "81|talla=l": 3 });
  assert.equal(unidadesTotales(o), 8);
  // Una variación borrada no cuenta.
  const borrada = conTallas(7263, { S: 5, M: 4 });
  (borrada.variations as Obj[])[1].deleted_at = "2026-10-01";
  assert.deepEqual(unidadesDeVariable(borrada), { "81|talla=s": 5 });
  assert.equal(variacionesVivas(borrada).length, 1);
  // Un producto simple se cuenta como siempre.
  assert.equal(unidadesTotales(producto()), 300);
});

test("variaciones: apagar saca todo el stock de cada variación con el concepto «stock», manda atributos y variaciones y deja los correos quitados", () => {
  const o = conTallas(7263, { S: 5, M: 3 }, { private_product_inventories: [{ id: 77, product_id: 7263, variation_id: 72630, user_id: 5, stock: 5, deleted_at: null, email: "a@b.c" }] });
  const r = armarApagadoVariable(o, bp, true, entradasDe(o));
  assert.ok("cuerpo" in r && r.cuerpo);
  assert.equal(r.unidades, 8);
  assert.equal(r.privadas, 1);
  const b = r.cuerpo!;
  assert.equal(b.type, "VARIABLE");
  assert.equal((b.attribute as Obj[]).length, 1);
  assert.equal(((b.attribute as Obj[])[0].values as Obj[]).length, 2);
  assert.equal((b.variations as Obj[]).length, 2);
  assert.deepEqual(((b.variations as Obj[])[0].attribute_values as Obj[])[0].value, "S");
  // Una lista de bodegas por variación; cada bodega con unidades lleva su movimiento.
  const bodegas = b.warehouselected as Obj[][];
  assert.equal(bodegas.length, 2);
  assert.deepEqual([bodegas[0][0].variation_id, bodegas[0][0].quantity, bodegas[0][0].type_movement, bodegas[0][0].concept], [72630, 5, "SALIDA", CONCEPTO_APAGAR]);
  assert.deepEqual([bodegas[1][0].variation_id, bodegas[1][0].quantity, bodegas[1][0].type_movement], [72631, 3, "SALIDA"]);
  const reservas = b.private_product_inventories as Obj[];
  assert.deepEqual([reservas[0].variation_id, reservas[0].deleted_at, reservas[0].change], [72630, true, true]);
});

test("variaciones: las bodegas sin unidades no llevan movimiento y, sin nada que sacar ni quitar, no hay nada que guardar", () => {
  const o = conTallas(7000, { S: 0, M: 4 });
  const r = armarApagadoVariable(o, bp, false, entradasDe(o));
  assert.ok("cuerpo" in r && r.cuerpo);
  const bodegas = r.cuerpo!.warehouselected as Obj[][];
  assert.equal(bodegas[0][0].type_movement, undefined);
  assert.equal(bodegas[1][0].type_movement, "SALIDA");
  const cero = conTallas(7000, { S: 0, M: 0 });
  const nada = armarApagadoVariable(cero, bp, false, entradasDe(cero));
  assert.ok("cuerpo" in nada);
  assert.equal(nada.cuerpo, null);
});

test("variaciones: sin atributos o con stock en la B280, no se arma nada (y sigue sin servir el apagado de un producto simple)", () => {
  const sinAtributos = conTallas(7000, { S: 4 }, { attributes: [] });
  const e1 = armarApagadoVariable(sinAtributos, bp, false, entradasDe(sinAtributos));
  assert.ok("error" in e1);
  assert.match((e1 as { error: string }).error, /no devolvió los atributos/);
  const b280 = conTallas(7000, { S: 4 });
  const ent = entradasDe(b280);
  ent[0][0].warehouse_id = 280;
  const e2 = armarApagadoVariable(b280, bp, false, ent);
  assert.ok("error" in e2);
  assert.match((e2 as { error: string }).error, /B280/);
  assert.ok("error" in armarApagado(conTallas(7000, { S: 4 }), bp, false), "el apagado de siempre sigue rechazando un producto con variaciones");
});

test("variaciones: las unidades de un privado se emparejan con las tallas del público; una talla que falta se dice sin tocar nada", () => {
  const publico = conTallas(7000, { S: 100, M: 80 });
  const ok = emparejarDevolucion(publico, { "81|talla=m": 3, "81|talla=s": 5 });
  assert.deepEqual(ok, { porVariacion: { "0": { "81": 5 }, "1": { "81": 3 } } });
  const falta = emparejarDevolucion(publico, { "81|talla=xl": 2 });
  assert.ok("error" in falta);
  assert.match((falta as { error: string }).error, /talla=xl/);
  const simple = emparejarDevolucion(publico, { "81": 4 });
  assert.ok("error" in simple);
  assert.match((simple as { error: string }).error, /tiene variaciones y este privado no/);
  assert.deepEqual(emparejarDevolucion(publico, {}), { porVariacion: {} });
});

test("variaciones: devolver unidades al público es una entrada por variación y bodega; si una bodega no está, se dice", () => {
  const publico = conTallas(7000, { S: 100, M: 80 });
  const r = armarEntradaVariable(publico, bp, { "0": { "81": 5 }, "1": { "81": 3 } }, entradasDe(publico), "Privatización quitada del ID 7263");
  assert.ok("cuerpo" in r);
  const bodegas = r.cuerpo!.warehouselected as Obj[][];
  assert.deepEqual([bodegas[0][0].quantity, bodegas[0][0].type_movement, bodegas[0][0].concept], [5, "ENTRADA", "Privatización quitada del ID 7263"]);
  assert.deepEqual([bodegas[1][0].quantity, bodegas[1][0].type_movement], [3, "ENTRADA"]);
  const mal = armarEntradaVariable(publico, bp, { "0": { "82": 5 } }, entradasDe(publico), "x");
  assert.ok("error" in mal);
});

test("variaciones: el producto nuevo al republicar va sin IDs, con solo lo vivo, el stock de cada variación y sus bodegas en el mismo orden", () => {
  const o = conTallas(7000, { S: 100, M: 80, L: 0 }, { private_product_inventories: [{ id: 5, stock: 0, deleted_at: null }] });
  (o.variations as Obj[]).push({ id: 99, sale_price: "1", suggested_price: "1", product_id: 7000, stock: 0, sku: "BODY/XL", deleted_at: "2026-10-01", attribute_values: [talla(3, "XL")], warehouse_product_variation: [{ variation_id: 99, warehouse_id: 81, stock: 7 }] });
  const r = armarProductoNuevoVariable(o, bp);
  assert.ok("cuerpo" in r);
  const c = r.cuerpo;
  assert.equal(c.id, null);
  assert.deepEqual(c.private_product_inventories, []);
  const atributos = c.attribute as Obj[];
  assert.equal(atributos.length, 1);
  assert.deepEqual([atributos[0].id, atributos[0].product_id], [null, null]);
  assert.ok((atributos[0].values as Obj[]).every((v) => v.id === null && v.attribute_id === null));
  const variaciones = c.variations as Obj[];
  assert.equal(variaciones.length, 3, "la variación borrada no se copia");
  assert.ok(variaciones.every((v) => v.id === null && v.product_id === null));
  assert.deepEqual(variaciones.map((v) => v.stock), [100, 80, 0]);
  assert.deepEqual(variaciones.map((v) => v.sku), ["BODY/S", "BODY/M", "BODY/L"]);
  const bodegas = c.warehouselected as Obj[][];
  assert.equal(bodegas.length, 3);
  assert.deepEqual(bodegas[0], [{ warehouse_id: 81, fullName: "()", stock: 100 }]);
  assert.deepEqual(bodegas[2], [], "sin unidades no lleva bodega");
});

test("variaciones: no se republica con stock en la B280, unidades privatizadas, porcentajes por dropshipper ni sin atributos", () => {
  const b280 = conTallas(7000, { S: 4 });
  ((b280.variations as Obj[])[0].warehouse_product_variation as Obj[])[0].warehouse_id = 280;
  assert.match((armarProductoNuevoVariable(b280, bp) as { error: string }).error, /B280/);
  assert.match((armarProductoNuevoVariable(conTallas(7000, { S: 4 }, { private_product_inventories: [{ stock: 3, deleted_at: null }] }), bp) as { error: string }).error, /privatizadas/);
  assert.match((armarProductoNuevoVariable(conTallas(7000, { S: 4 }, { user_profit_percentage_product: [{ id: 1 }] }), bp) as { error: string }).error, /porcentajes/);
  assert.match((armarProductoNuevoVariable(conTallas(7000, { S: 4 }, { attributes: [] }), bp) as { error: string }).error, /no devolvió los atributos/);
});

test("variaciones: el favorito arma exactamente lo mismo que el sistema", () => {
  const o = conTallas(7263, { S: 5, M: 3 }, { private_product_inventories: [{ id: 77, product_id: 7263, variation_id: 72630, user_id: 5, stock: 5, deleted_at: null, email: "a@b.c" }] });
  const publico = conTallas(7000, { S: 100, M: 80 });
  for (const q of [true, false]) igual(delFavorito.apagadoV(o, bp, q, entradasDe(o)), armarApagadoVariable(o, bp, q, entradasDe(o)));
  const cero = conTallas(7000, { S: 0 });
  igual(delFavorito.apagadoV(cero, bp, false, entradasDe(cero)), armarApagadoVariable(cero, bp, false, entradasDe(cero)));
  const sinAtr = conTallas(7000, { S: 4 }, { attributes: [] });
  igual(delFavorito.apagadoV(sinAtr, bp, false, entradasDe(sinAtr)), armarApagadoVariable(sinAtr, bp, false, entradasDe(sinAtr)));
  igual(delFavorito.unidadesV(o), unidadesDeVariable(o));
  const nueva = conTallas(7000, { S: 100, M: 0 });
  igual(delFavorito.nuevoV(nueva, bp), armarProductoNuevoVariable(nueva, bp));
  const b280 = conTallas(7000, { S: 4 });
  ((b280.variations as Obj[])[0].warehouse_product_variation as Obj[])[0].warehouse_id = 280;
  igual(delFavorito.nuevoV(b280, bp), armarProductoNuevoVariable(b280, bp));
  igual(delFavorito.apagadoV(o, bp, false, entradasDe(o), "Republicado como ID 9"), armarApagadoVariable(o, bp, false, entradasDe(o), "Republicado como ID 9"));
  igual(delFavorito.firmaV(variacionesVivas(o)[0]), firmaVariacion(variacionesVivas(o)[0]));
  const casosU: Record<string, number>[] = [{ "81|talla=m": 3, "81|talla=s": 5 }, { "81|talla=xl": 2 }, { "81": 4 }, {}];
  for (const u of casosU) igual(delFavorito.emparejarV(publico, u), emparejarDevolucion(publico, u));
  const pv = { "0": { "81": 5 }, "1": { "81": 3 } };
  igual(delFavorito.entradaV(publico, bp, pv, entradasDe(publico), "k"), armarEntradaVariable(publico, bp, pv, entradasDe(publico), "k"));
  igual(delFavorito.entradaV(publico, bp, { "0": { "82": 5 } }, entradasDe(publico), "k"), armarEntradaVariable(publico, bp, { "0": { "82": 5 } }, entradasDe(publico), "k"));
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
  // De un producto con variaciones: por bodega y variación.
  assert.deepEqual(normalizarUnidades({ "81|talla=s": 5, "81|color=rojo,talla=m": "3", "81|raro;drop": 2, "81|": 1 }), { "81|talla=s": 5, "81|color=rojo,talla=m": 3, "81|": 1 });
  assert.deepEqual(normalizarUnidades({ "81": "12" }), { "81": 12 });
});
