import assert from "node:assert/strict";
import test from "node:test";
import { APAGAR_JS } from "./apagar-dropi";
import { pesoCambio } from "./cambios-dropi";
import { ARMAR_JS } from "./marcador-aplicar-dropi";
import { PRIVATIZAR_JS } from "./privatizar-dropi";
import { REPUBLICAR_JS } from "./republicar-dropi";
import { armarAjusteStock, armarAjusteStockVariable, CONCEPTO_STOCK, faltantesStock, normalizarDatosStock, productoDelCambio, STOCK_JS, textoVariacion, type DatosStock } from "./stock-dropi";

type Obj = Record<string, unknown>;
const delFavorito = new Function(`${ARMAR_JS};${REPUBLICAR_JS};${STOCK_JS};${PRIVATIZAR_JS};${APAGAR_JS}; return { ajuste, ajusteV };`)() as {
  ajuste: (o: Obj, bp: Obj[], d: DatosStock) => Obj;
  ajusteV: (o: Obj, bp: Obj[], d: DatosStock, en: Obj[]) => Obj;
};
const igual = (a: unknown, b: unknown) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

const b81 = { id: 81, name: "Proveedor Ecomfive", address: "Ave Centenario", warehouse_white_brand: false };
const b90 = { id: 90, name: "Ecomfive Colón", address: "Colón", warehouse_white_brand: false };
const bp = [b81, b90];
const producto = (extra: Obj = {}): Obj => ({
  id: 8406,
  name: "Aceite de Orégano",
  description: "<p>x</p>",
  type: "SIMPLE",
  sale_price: "5.90",
  suggested_price: "5.90",
  user_id: 2094,
  privated_product: false,
  active: true,
  sku: "ACEITE/OREGANO",
  weight: "1",
  length: "1",
  width: "1",
  height: "1",
  variations: [],
  categories: [],
  private_product_inventories: [],
  user_profit_percentage_product: [],
  warehouse_product: [
    { warehouse_id: 81, stock: 120, warehouse: b81 },
    { warehouse_id: 280, stock: 30, warehouse: { id: 280, name: "Bodega Dropi Panama" } },
  ],
  ...extra,
});
const datos = (extra: Partial<DatosStock> = {}): DatosStock => ({
  producto: null,
  bodega: 81,
  nombreBodega: "Proveedor Ecomfive",
  unidades: 200,
  antes: 120,
  concepto: CONCEPTO_STOCK,
  ...extra,
});
const movimiento = (cuerpo: Obj, bodega: number) => (cuerpo.warehouselected as Obj[]).find((w) => w.warehouse_id === bodega);

test("subir el stock: una entrada por la diferencia en esa bodega, sin tocar la B280", () => {
  const r = armarAjusteStock(producto(), bp, datos());
  assert.ok("cuerpo" in r && r.cuerpo);
  assert.equal(r.antes, 120);
  const m = movimiento(r.cuerpo!, 81)!;
  assert.equal(m.type_movement, "ENTRADA");
  assert.equal(m.quantity, 80);
  assert.equal(m.concept, CONCEPTO_STOCK);
  assert.equal(movimiento(r.cuerpo!, 280)?.type_movement, undefined);
  igual(delFavorito.ajuste(producto(), bp, datos()), r);
});

test("bajar el stock: una salida; dejarlo en cero también", () => {
  const r = armarAjusteStock(producto(), bp, datos({ unidades: 0, concepto: "Conteo físico" }));
  assert.ok("cuerpo" in r && r.cuerpo);
  const m = movimiento(r.cuerpo!, 81)!;
  assert.equal(m.type_movement, "SALIDA");
  assert.equal(m.quantity, 120);
  assert.equal(m.concept, "Conteo físico");
  igual(delFavorito.ajuste(producto(), bp, datos({ unidades: 0, concepto: "Conteo físico" })), r);
});

test("darle stock a una bodega de ECOMFIVE sin stock (Dropi no la lista)", () => {
  const r = armarAjusteStock(producto(), bp, datos({ bodega: 90, unidades: 50 }));
  assert.ok("cuerpo" in r && r.cuerpo);
  assert.equal(r.antes, 0);
  assert.equal(movimiento(r.cuerpo!, 90)?.quantity, 50);
  igual(delFavorito.ajuste(producto(), bp, datos({ bodega: 90, unidades: 50 })), r);
});

test("si ya tiene esas unidades no guarda nada (un reintento no mueve dos veces)", () => {
  const r = armarAjusteStock(producto(), bp, datos({ unidades: 120 }));
  igual(r, { cuerpo: null, antes: 120 });
  igual(delFavorito.ajuste(producto(), bp, datos({ unidades: 120 })), r);
});

test("no se toca la B280 ni una bodega que no es del proveedor; no se deja menos que lo reservado a privados; no con variaciones", () => {
  for (const d of [datos({ bodega: 280 }), datos({ bodega: 999 })]) {
    const r = armarAjusteStock(producto(), bp, d);
    assert.ok("error" in r);
    igual(delFavorito.ajuste(producto(), bp, d), r);
  }
  const conReservas = producto({
    private_product_inventories: [
      { user_id: 1, stock: 100, deleted_at: null },
      { user_id: 2, stock: 500, deleted_at: "2026-10-01" },
    ],
  });
  const r = armarAjusteStock(conReservas, bp, datos({ unidades: 60 }));
  assert.ok("error" in r && /100 unidades reservadas/.test(r.error));
  igual(delFavorito.ajuste(conReservas, bp, datos({ unidades: 60 })), r);
  assert.ok("cuerpo" in armarAjusteStock(conReservas, bp, datos({ unidades: 70 })));
  const variable = producto({ type: "VARIABLE" });
  assert.ok("error" in armarAjusteStock(variable, bp, datos()));
  assert.ok("error" in delFavorito.ajuste(variable, bp, datos()));
});

test("un stock negativo se lee como está: dejarlo en 0 es una entrada por la diferencia (el 8822 en -96)", () => {
  const negativo = producto({ warehouse_product: [{ warehouse_id: 81, stock: -96, warehouse: { id: 81, name: "Proveedor Ecomfive", address: "x" } }] });
  const r = armarAjusteStock(negativo, bp, datos({ unidades: 0 }));
  assert.ok("cuerpo" in r && r.cuerpo);
  assert.equal(r.antes, -96);
  const m = movimiento(r.cuerpo!, 81)!;
  assert.equal(m.type_movement, "ENTRADA");
  assert.equal(m.quantity, 96);
  igual(delFavorito.ajuste(negativo, bp, datos({ unidades: 0 })), r);
});

test("lo que llega se limpia y se revisa antes de encolar", () => {
  const d = normalizarDatosStock({ bodega: "81", unidades: "35", antes: 12, concepto: "   ", nombreBodega: "  B  " });
  igual(d, { producto: null, bodega: 81, nombreBodega: "B", unidades: 35, antes: 12, concepto: CONCEPTO_STOCK });
  assert.equal(normalizarDatosStock({ producto: "8295", bodega: 81, unidades: 50 }).producto, 8295);
  assert.equal(normalizarDatosStock({ producto: 0, bodega: 81, unidades: 50 }).producto, null);
  assert.equal(normalizarDatosStock({}).unidades, -1);
  assert.deepEqual(faltantesStock(d, [{ id: 81 }]), []);
  assert.equal(faltantesStock({ ...d, bodega: 280 }, [{ id: 81 }]).length, 1);
  assert.equal(faltantesStock({ ...d, bodega: 7 }, [{ id: 81 }]).length, 1);
  assert.equal(faltantesStock({ ...d, unidades: -1 }, [{ id: 81 }]).length, 1);
  assert.equal(faltantesStock({ ...d, unidades: 12 }, [{ id: 81 }]).length, 1, "mismo stock que tiene");
  assert.deepEqual(faltantesStock({ ...d, antes: null, unidades: 0 }, [{ id: 81 }]), []);
});

test("con dos IDs el stock va al que se eligió, no al primero (6667-8295)", () => {
  assert.equal(productoDelCambio([6667, 8295], 8295), 8295);
  assert.equal(productoDelCambio([6667, 8295], null), 6667, "sin elegir, el primero (lo de antes)");
  assert.ok(typeof productoDelCambio([6667, 8295], 8595) === "object", "un ID que no es de la publicación no se acepta");
  assert.ok(typeof productoDelCambio([], null) === "object");
});

// ---------- Con variaciones (5 nov 2026): el cuerpo es el de la pantalla de Dropi, atrapado sin enviarlo con la Rodillera 8559 ----------
const valor = (id: number, value: string) => ({ id, value, attribute_id: 1795, attribute_name: "talla", deleted_at: null });
const variacion = (id: number, value: string, stock: number | null, extra: Obj = {}): Obj => ({
  id,
  sale_price: "4.99",
  suggested_price: "4.99",
  product_id: 8559,
  stock: stock ?? 0,
  sku: `Rodillera-${value}`,
  deleted_at: null,
  attribute_values: [valor(id - 1568, value)],
  warehouse_product_variation: stock === null ? [] : [{ id: 1, warehouse_id: 81, variation_id: id, stock, warehouse: b81 }],
  ...extra,
});
const rodillera = (extra: Obj = {}): Obj =>
  producto({
    id: 8559,
    name: "Rodillera Deportiva",
    type: "VARIABLE",
    sku: null,
    warehouse_product: [],
    attributes: [{ id: 1795, product_id: 8559, description: "talla", isVariation: true, deleted_at: null, values: [valor(4766, "S"), valor(4767, "M")] }],
    variations: [variacion(6334, "S", null), variacion(6335, "M", 9), variacion(6336, "L", 20)],
    ...extra,
  });
/** Lo que devuelve `get_warehouses_stock`. */
const entrada = (variationId: number, stock: number, w: Obj = b81): Obj => ({
  variation_id: variationId,
  warehouse_id: w.id,
  fullName: `${w.name}(${w.address})`,
  stock,
  warehouse_white_brand: false,
});
const deVariacion = (firma: string, extra: Partial<DatosStock> = {}): DatosStock => datos({ firma, etiqueta: firma.split("=")[1].toUpperCase(), unidades: 10, antes: 9, ...extra });
const cuerpo = (r: unknown) => (r as { cuerpo: Obj }).cuerpo;

test("variación: una entrada va en su posición de variations, con null en las anteriores (como la pantalla de Dropi)", () => {
  const r = armarAjusteStockVariable(rodillera(), [b81], deVariacion("talla=m"), [entrada(6335, 9)]);
  assert.ok(!("error" in r));
  igual(r.antes, 9);
  igual(cuerpo(r).warehouselected, [null, [{ ...entrada(6335, 9), quantity: "1", type_movement: "ENTRADA", concept: CONCEPTO_STOCK }]]);
  assert.equal((cuerpo(r).variations as Obj[])[1].stock, 9, "variations no cambia: Dropi aplica el movimiento");
  assert.equal(cuerpo(r).type, "VARIABLE");
  assert.equal((cuerpo(r).attribute as Obj[]).length, 1);
});

test("variación sin esa bodega (en cero): la fila va sin stock, como la pantalla", () => {
  const r = armarAjusteStockVariable(rodillera(), [b81], deVariacion("talla=s", { unidades: 5, antes: 0 }), []);
  igual(cuerpo(r).warehouselected, [
    [{ warehouse_id: 81, fullName: "Proveedor Ecomfive(Ave Centenario)", variation_id: 6334, warehouse_white_brand: false, quantity: "5", type_movement: "ENTRADA", concept: CONCEPTO_STOCK }],
  ]);
});

test("variación: una salida por la diferencia; las otras bodegas van sin movimiento", () => {
  const r = armarAjusteStockVariable(rodillera(), bp, deVariacion("talla=l", { unidades: 12, antes: 20 }), [entrada(6336, 20)]);
  igual(cuerpo(r).warehouselected, [
    null,
    null,
    [
      { ...entrada(6336, 20), quantity: "8", type_movement: "SALIDA", concept: CONCEPTO_STOCK },
      { warehouse_id: 90, fullName: "Ecomfive Colón(Colón)", variation_id: 6336, warehouse_white_brand: false },
    ],
  ]);
});

test("variación: la posición cuenta las borradas, que van en variations", () => {
  const o = rodillera({ variations: [variacion(6333, "XS", null, { deleted_at: "2026-01-01" }), variacion(6335, "M", 9)] });
  const r = armarAjusteStockVariable(o, [b81], deVariacion("talla=m"), [entrada(6335, 9)]);
  assert.equal((cuerpo(r).warehouselected as unknown[]).length, 2);
  assert.equal((cuerpo(r).warehouselected as unknown[])[0], null);
});

test("variación: ya en el objetivo no guarda nada (un reintento no mueve dos veces)", () => {
  const r = armarAjusteStockVariable(rodillera(), [b81], deVariacion("talla=m", { unidades: 9 }), [entrada(6335, 9)]);
  assert.deepEqual(r, { cuerpo: null, antes: 9 });
});

test("variación: se detiene en la B280, una bodega ajena, una variación que ya no está o por debajo de lo reservado", () => {
  const o = rodillera();
  assert.match(String((armarAjusteStockVariable(o, [b81], deVariacion("talla=m", { bodega: 280 }), []) as Obj).error), /no es de ECOMFIVE/);
  assert.match(String((armarAjusteStockVariable(o, [b81], deVariacion("talla=m", { bodega: 7 }), []) as Obj).error), /no es de ECOMFIVE/);
  assert.match(String((armarAjusteStockVariable(o, [b81], deVariacion("talla=xl"), []) as Obj).error), /ya no tiene la variación XL/);
  const reservado = rodillera({ private_product_inventories: [{ variation_id: 6335, stock: 5, deleted_at: null }, { variation_id: 6336, stock: 90, deleted_at: null }, { variation_id: 6335, stock: 50, deleted_at: "2026-01-01" }] });
  assert.match(String((armarAjusteStockVariable(reservado, [b81], deVariacion("talla=m", { unidades: 4 }), [entrada(6335, 9)]) as Obj).error), /M tiene 5 unidades reservadas/);
  assert.ok(!("error" in armarAjusteStockVariable(reservado, [b81], deVariacion("talla=m", { unidades: 5 }), [entrada(6335, 9)])), "lo reservado de otra variación no cuenta");
});

test("el favorito arma lo mismo que armarAjusteStockVariable", () => {
  const casos: [Obj, Obj[], DatosStock, Obj[]][] = [
    [rodillera(), [b81], deVariacion("talla=m"), [entrada(6335, 9)]],
    [rodillera(), [b81], deVariacion("talla=s", { unidades: 5, antes: 0 }), []],
    [rodillera(), bp, deVariacion("talla=l", { unidades: 12, concepto: "Conteo" }), [entrada(6336, 20)]],
    [rodillera(), bp, deVariacion("talla=l", { bodega: 90, unidades: 7 }), [entrada(6336, 20)]],
    [rodillera(), [b81], deVariacion("talla=m", { unidades: 9 }), [entrada(6335, 9)]],
    [rodillera(), [b81], deVariacion("talla=m", { bodega: 280 }), []],
    [rodillera(), [b81], deVariacion("talla=xl"), []],
    [rodillera({ private_product_inventories: [{ variation_id: 6335, stock: 5, deleted_at: null }] }), [b81], deVariacion("talla=m", { unidades: 4 }), [entrada(6335, 9)]],
    [rodillera({ attributes: [] }), [b81], deVariacion("talla=m"), [entrada(6335, 9)]],
  ];
  for (const [o, b, d, en] of casos) igual(delFavorito.ajusteV(o, b, d, en), armarAjusteStockVariable(o, b, d, en));
});

test("la variación se conserva al normalizar y un producto simple queda como antes", () => {
  const d = normalizarDatosStock({ bodega: 81, unidades: 5, firma: " talla=m ", etiqueta: " M ", concepto: "" });
  assert.equal(d.firma, "talla=m");
  assert.equal(d.etiqueta, "M");
  assert.equal(textoVariacion(d), " · M");
  assert.equal(textoVariacion({ firma: "talla=m", etiqueta: null }), " · talla=m");
  const simple = normalizarDatosStock({ bodega: 81, unidades: 5 });
  assert.ok(!("firma" in simple));
  assert.equal(textoVariacion(simple), "");
});

test("la ficha no tapa lo que sigue sin resolver: una republicación con error pesa más que un stock aplicado o pendiente", () => {
  assert.ok(pesoCambio("republicar", "error") > pesoCambio("stock", "aplicado"));
  assert.ok(pesoCambio("republicar", "error") > pesoCambio("stock", "pendiente"));
  assert.ok(pesoCambio("stock", "pendiente") > pesoCambio("cambio", "aplicado"));
  assert.equal(pesoCambio("cambio", "pendiente"), pesoCambio("republicar", "error"), "entre dos sin resolver gana el más reciente");
});
