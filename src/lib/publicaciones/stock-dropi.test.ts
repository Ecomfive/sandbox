import assert from "node:assert/strict";
import test from "node:test";
import { ARMAR_JS } from "./marcador-aplicar-dropi";
import { REPUBLICAR_JS } from "./republicar-dropi";
import { armarAjusteStock, CONCEPTO_STOCK, faltantesStock, normalizarDatosStock, productoDelCambio, STOCK_JS, type DatosStock } from "./stock-dropi";

type Obj = Record<string, unknown>;
const delFavorito = new Function(`${ARMAR_JS};${REPUBLICAR_JS};${STOCK_JS}; return { ajuste };`)() as { ajuste: (o: Obj, bp: Obj[], d: DatosStock) => Obj };
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
