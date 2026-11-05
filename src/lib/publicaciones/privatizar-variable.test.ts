import assert from "node:assert/strict";
import test from "node:test";
import { APAGAR_JS, firmaVariacion } from "./apagar-dropi";
import { ARMAR_JS } from "./marcador-aplicar-dropi";
import { normalizarDatosPrivatizar, PRIVATIZAR_JS, type DatosPrivatizar } from "./privatizar-dropi";
import {
  armarAsignacionVariable,
  armarPrivadoVariable,
  armarSalidaVariable,
  errorDeVariable,
  faltantesVariaciones,
  PRIVATIZAR_VARIABLE_JS,
  textoVariaciones,
  unidadesPedidas,
  variacionesDeLectura,
  yaReservado,
} from "./privatizar-variable";
import { REPUBLICAR_JS } from "./republicar-dropi";

type Obj = Record<string, unknown>;
const delFavorito = new Function(`${ARMAR_JS};${REPUBLICAR_JS};${PRIVATIZAR_JS};${APAGAR_JS};${PRIVATIZAR_VARIABLE_JS}; return { errorVar, privadoV, asignacionV, salidaV, yaReservado, unidadesP };`)() as {
  errorVar: (o: Obj, bp: Obj[], d: DatosPrivatizar) => string | null;
  privadoV: (o: Obj, bp: Obj[], d: DatosPrivatizar) => Obj;
  asignacionV: (o: Obj, bp: Obj[], u: Obj, d: DatosPrivatizar) => Obj;
  salidaV: (o: Obj, bp: Obj[], d: DatosPrivatizar, en: Obj[][], id: number) => Obj;
  yaReservado: (o: Obj, id: number, d: DatosPrivatizar) => boolean;
  unidadesP: (d: DatosPrivatizar) => Record<string, number>;
};

const BODEGA = { id: 81, name: "Proveedor Ecomfive", address: "Costa del Este" };
const bp = [BODEGA];
const valor = (i: number, v: string) => ({ id: 100 + i, value: v, attribute_id: 10, attribute_name: "Graduación", deleted_at: null });
const GRADUACIONES = ["+1.00", "+1.50", "+2.00"];

/** Un público con una variación por graduación, como lo devuelve `GET api/products/<id>`. */
function publico(extra: Obj = {}): Obj {
  return {
    id: 6577, name: "LENTES TR90", type: "VARIABLE", user_id: 1, privated_product: false, active: true, sku: "LENTES", sale_price: "5.99", suggested_price: "9.99", description: "d", weight: "1", length: "1", width: "1", height: "1",
    categories: [], warehouse_product: [], private_product_inventories: [], user_profit_percentage_product: [{ id: 1 }],
    attributes: [{ id: 10, product_id: 6577, description: "Graduación", isVariation: true, deleted_at: null, values: GRADUACIONES.map((v, i) => valor(i, v)) }],
    variations: GRADUACIONES.map((v, i) => ({
      id: 700 + i, product_id: 6577, sale_price: "5.99", suggested_price: "9.99", stock: 0, sku: `LENTES/${i}`, deleted_at: null, attribute_values: [valor(i, v)],
      warehouse_product_variation: [{ variation_id: 700 + i, warehouse_id: 81, stock: 100 + i, warehouse: BODEGA }],
    })),
    ...extra,
  };
}
const firma = (i: number) => firmaVariacion((publico().variations as Obj[])[i]);
const datos = (extra: Obj = {}): DatosPrivatizar =>
  normalizarDatosPrivatizar({
    correo: "david@correo.com", dropshipper: "David", iniciales: "DR", bodega: 81, precio: 5.99, nombre: "P-DR LENTES TR90", origen: "01a15c02-b394-73c1-8507-2e97a68c89cc",
    variaciones: [{ firma: firma(0), etiqueta: "+1.00", unidades: 10 }, { firma: firma(2), etiqueta: "+2.00", unidades: 5 }, { firma: firma(1), etiqueta: "+1.50", unidades: 0 }],
    ...extra,
  });

test("normalizar: las unidades son la suma de las variaciones, las vacías se quitan y no van correos extra", () => {
  const d = datos({ unidades: 999, extras: [{ correo: "otro@correo.com", unidades: 3 }] });
  assert.equal(d.unidades, 15);
  assert.deepEqual(d.variaciones?.map((x) => x.etiqueta), ["+1.00", "+2.00"]);
  assert.equal(d.extras, undefined);
  assert.equal(textoVariaciones(d), "+1.00: 10 · +2.00: 5");
  assert.equal(normalizarDatosPrivatizar({ unidades: 7 }).variaciones, undefined, "un producto simple no lleva variaciones");
  assert.equal(normalizarDatosPrivatizar({ unidades: 7 }).unidades, 7);
});

test("la lectura guarda cada variación viva con su etiqueta y su stock por bodega", () => {
  const o = publico();
  (o.variations as Obj[])[1].deleted_at = "2026-11-01";
  assert.deepEqual(variacionesDeLectura(o), [
    { firma: firma(0), etiqueta: "+1.00", sku: "LENTES/0", bodegas: [{ id: 81, stock: 100 }] },
    { firma: firma(2), etiqueta: "+2.00", sku: "LENTES/2", bodegas: [{ id: 81, stock: 102 }] },
  ]);
  assert.equal(variacionesDeLectura({ id: 1 }), null, "sin variaciones en la lectura no se inventa ninguna");
});

test("lo pedido se compara con la lectura: una variación que no está o sin tantas unidades", () => {
  const leidas = variacionesDeLectura(publico())!;
  assert.deepEqual(faltantesVariaciones(datos(), leidas), []);
  assert.match(faltantesVariaciones(datos({ variaciones: [{ firma: firma(0), etiqueta: "+1.00", unidades: 101 }] }), leidas)[0], /solo hay 100/);
  assert.match(faltantesVariaciones(datos({ variaciones: [{ firma: "x", etiqueta: "+9.00", unidades: 1 }] }), leidas)[0], /ya no muestra la variación \+9\.00/);
});

test("el privado nace solo con las variaciones pedidas, sin IDs, con su precio y sus unidades", () => {
  const r = armarPrivadoVariable(publico(), bp, datos());
  assert.ok("cuerpo" in r);
  const c = r.cuerpo;
  assert.equal(c.id, null);
  assert.equal(c.privated_product, true);
  assert.equal(c.name, "P-DR LENTES TR90");
  assert.equal(c.sale_price, 5.99);
  assert.deepEqual(c.private_product_inventories, []);
  assert.deepEqual(c.user_profit_percentage_product, []);
  const variaciones = c.variations as Obj[];
  assert.deepEqual(variaciones.map((v) => [v.id, v.product_id, v.sku, v.sale_price, v.suggested_price, v.stock]), [[null, null, "LENTES/0", 5.99, 5.99, 10], [null, null, "LENTES/2", 5.99, 5.99, 5]]);
  assert.deepEqual((variaciones[1].attribute_values as Obj[]).map((a) => [a.id, a.value]), [[null, "+2.00"]]);
  const atributos = c.attribute as Obj[];
  assert.deepEqual([atributos[0].id, (atributos[0].values as Obj[]).map((x) => [x.id, x.value])], [null, [[null, "+1.00"], [null, "+2.00"]]]);
  assert.deepEqual(c.warehouselected, [[{ warehouse_id: 81, fullName: "Proveedor Ecomfive(Costa del Este)", stock: 10 }], [{ warehouse_id: 81, fullName: "Proveedor Ecomfive(Costa del Este)", stock: 5 }]]);
});

test("no se privatiza un privado, una bodega ajena, una variación que ya no está ni más de lo que hay", () => {
  assert.match(String(errorDeVariable(publico({ privated_product: true }), bp, datos())), /ya es privado/);
  assert.match(String(errorDeVariable(publico(), bp, datos({ bodega: 280 }))), /no es de ECOMFIVE/);
  assert.match(String(errorDeVariable(publico(), bp, datos({ variaciones: [{ firma: "x", etiqueta: "+9.00", unidades: 1 }] }))), /ya no tiene la variación \+9\.00/);
  const mucho = datos({ variaciones: [{ firma: firma(0), etiqueta: "+1.00", unidades: 101 }] });
  assert.match(String(errorDeVariable(publico(), bp, mucho)), /De \+1\.00 el público solo tiene 100/);
  assert.equal(errorDeVariable(publico(), bp, { ...mucho, salida: true }), null, "si ya se le sacó el stock, el reintento no lo vuelve a exigir");
});

test("una reserva por variación, con el ID de la variación del privado, y un reintento no las repite", () => {
  const privado = publico({ id: 9001, private_product_inventories: [] });
  const d = datos();
  const usuario = { id: 55, email: "david@correo.com" };
  const r = armarAsignacionVariable(privado, bp, usuario, d);
  assert.ok("cuerpo" in r);
  const reservas = r.cuerpo.private_product_inventories as Obj[];
  assert.deepEqual(reservas.map((x) => [x.product_id, x.variation_id, x.user_id, x.stock, x.email, x.change]), [[9001, 700, 55, 10, "david@correo.com", true], [9001, 702, 55, 5, "david@correo.com", true]]);
  assert.equal(yaReservado(privado, 55, d), false);
  const parcial = { ...privado, private_product_inventories: [{ id: 1, product_id: 9001, variation_id: 700, user_id: 55, stock: 10, deleted_at: null }] };
  assert.equal(yaReservado(parcial, 55, d), false);
  const r2 = armarAsignacionVariable(parcial, bp, usuario, d);
  assert.ok("cuerpo" in r2);
  assert.deepEqual((r2.cuerpo.private_product_inventories as Obj[]).filter((x) => x.change).map((x) => x.variation_id), [702], "solo la que falta");
  const completo = { ...privado, private_product_inventories: [{ user_id: 55, variation_id: 700, deleted_at: null }, { user_id: 55, variation_id: 702, deleted_at: null }] };
  assert.equal(yaReservado(completo, 55, d), true);
});

test("la salida del público es por variación, solo en la bodega elegida y no pasa de lo que hay", () => {
  const entradas = GRADUACIONES.map((_, i) => [{ variation_id: 700 + i, warehouse_id: 81, stock: 100 + i }, { variation_id: 700 + i, warehouse_id: 280, stock: 3 }]);
  const r = armarSalidaVariable(publico(), bp, datos(), entradas, 9001);
  assert.ok("cuerpo" in r);
  const wh = r.cuerpo.warehouselected as Obj[][];
  assert.deepEqual([wh[0][0].quantity, wh[0][0].type_movement, wh[0][0].concept], [10, "SALIDA", "Privatizado en el ID 9001"]);
  assert.equal(wh[0][1].quantity, undefined, "la otra bodega no se toca");
  assert.equal(wh[1][0].quantity, undefined, "la variación no pedida no se toca");
  assert.equal(wh[2][0].quantity, 5);
  assert.match(String((armarSalidaVariable(publico(), bp, datos(), [[{ warehouse_id: 81, stock: 9 }], [], [{ warehouse_id: 81, stock: 9 }]], 9001) as { error: string }).error), /ya no tiene esas unidades/);
  assert.match(String((armarSalidaVariable(publico(), bp, datos(), [[], [], []], 9001) as { error: string }).error), /no tiene esa bodega/);
});

test("el favorito arma exactamente lo mismo", () => {
  const d = datos();
  assert.deepEqual(delFavorito.privadoV(publico(), bp, d), armarPrivadoVariable(publico(), bp, d));
  assert.deepEqual(delFavorito.unidadesP(d), unidadesPedidas(d));
  const usuario = { id: 55, email: "david@correo.com" };
  const privado = publico({ id: 9001 });
  assert.deepEqual(delFavorito.asignacionV(privado, bp, usuario, d), armarAsignacionVariable(privado, bp, usuario, d));
  assert.equal(delFavorito.yaReservado(privado, 55, d), yaReservado(privado, 55, d));
  const entradas = GRADUACIONES.map((_, i) => [{ variation_id: 700 + i, warehouse_id: 81, stock: 100 + i }]);
  assert.deepEqual(delFavorito.salidaV(publico(), bp, d, entradas, 9001), armarSalidaVariable(publico(), bp, d, entradas, 9001));
  for (const caso of [datos({ bodega: 280 }), datos({ variaciones: [{ firma: "x", etiqueta: "+9.00", unidades: 1 }] }), datos({ variaciones: [{ firma: firma(0), etiqueta: "+1.00", unidades: 5000 }] })])
    assert.equal(delFavorito.errorVar(publico(), bp, caso), errorDeVariable(publico(), bp, caso));
});
