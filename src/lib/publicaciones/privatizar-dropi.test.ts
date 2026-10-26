import assert from "node:assert/strict";
import test from "node:test";
import { ARMAR_JS } from "./marcador-aplicar-dropi";
import {
  armarAsignacion,
  armarPrivado,
  armarSalidaDelPublico,
  errorDeOrigen,
  faltantesPrivatizar,
  inicialesDe,
  limpiarIniciales,
  nombrePrivado,
  normalizarDatosPrivatizar,
  PRIVATIZAR_JS,
  reservasQuitadas,
  sinPrefijoPrivado,
  yaAsignado,
  type DatosPrivatizar,
} from "./privatizar-dropi";
import { REPUBLICAR_JS } from "./republicar-dropi";

type Obj = Record<string, unknown>;
const delFavorito = new Function(`${ARMAR_JS};${REPUBLICAR_JS};${PRIVATIZAR_JS}; return { privado, asignacion, errorOrigen, reservasQuitadas, yaAsignado, salidaPublico };`)() as {
  privado: (o: Obj, bp: Obj[], d: DatosPrivatizar) => Obj;
  asignacion: (o: Obj, bp: Obj[], u: Obj, d: DatosPrivatizar) => Obj;
  errorOrigen: (o: Obj, bp: Obj[], d: DatosPrivatizar) => string | null;
  reservasQuitadas: (l: unknown) => Obj[];
  yaAsignado: (o: Obj, id: number) => boolean;
  salidaPublico: (o: Obj, bp: Obj[], d: DatosPrivatizar, id: number) => Obj;
};
const igual = (a: unknown, b: unknown) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

const bodega81 = { id: 81, name: "Proveedor Ecomfive", address: "Ave Centenario, Costa del Este", warehouse_white_brand: false };
const bp = [bodega81];
const publico = (extra: Obj = {}): Obj => ({
  id: 8406, name: "Aceite de Semilla de Calabaza", description: "<p>x</p>", dropi_app_description: null, type: "SIMPLE", sale_price: "5.90", suggested_price: "5.90",
  user_id: 2094, privated_product: false, active: true, sku: "ACEITE/CALABAZA", weight: "1.00", length: "1.00", width: "1.00", height: "1.00", variations: [],
  categories: [{ id: 4, name: "Belleza" }], add_stock_in_return: false, private_product_inventories: [], user_profit_percentage_product: [{ user_id: 9, percentage: 5 }], is_warehouse_white_brand: false,
  name_in_guide: "ACEITE/CALABAZA", shipping_method: null, bar_code: null, dropi_product_supplier_increment_fixed: false, archived: null,
  warehouse_product: [{ warehouse_id: 81, stock: 300, warehouse: bodega81 }], gallery: [], ...extra,
});
const datos = (extra: Partial<DatosPrivatizar> = {}): DatosPrivatizar => ({
  correo: "maria@correo.com", dropshipper: "María Álvarez", dropshipperId: null, iniciales: "MA", unidades: 50, bodega: 81, precio: 5.5,
  nombre: "P-MA Aceite de Semilla de Calabaza", origen: "4f0d6f56-1b68-4f4a-a5c0-7a1b0e3f9c11", salida: false, ...extra,
});
const usuario = { id: 5521, email: "maria@correo.com", name: "María", role_user: { name: "DROPSHIPPER" } };

test("las iniciales salen del nombre del dropshipper y se limpian a lo que admite el «P-XX»", () => {
  assert.equal(inicialesDe("María Álvarez Soto"), "MAS");
  assert.equal(inicialesDe("María Álvarez"), "MA");
  assert.equal(inicialesDe("Sofía"), "SO");
  assert.equal(inicialesDe("  "), "");
  assert.equal(inicialesDe("HYPER MODA PTY 2 extra"), "HMP");
  assert.equal(limpiarIniciales("m-a!"), "MA");
  assert.equal(limpiarIniciales("abcdefghij"), "ABCDEF");
});

test("el nombre del privado lleva «P-XX» y cabe en los 40 caracteres de Dropi, cortado en una palabra", () => {
  assert.equal(nombrePrivado("ma", "Aceite de Semilla de Calabaza"), "P-MA Aceite de Semilla de Calabaza");
  const largo = nombrePrivado("MAS", "Crema hidratante facial con ácido hialurónico y vitamina C");
  assert.ok(largo.length <= 40, largo);
  assert.ok(largo.startsWith("P-MAS "));
  assert.ok(!/\s$/.test(largo));
  // Si el público ya era un privado, no se repite el prefijo.
  assert.equal(nombrePrivado("SR", "P-MA Aceite de semilla"), "P-SR Aceite de semilla");
  assert.equal(sinPrefijoPrivado("P-D CREMA HIDRATANTE NIDA"), "CREMA HIDRATANTE NIDA");
  assert.equal(sinPrefijoPrivado("Pack 2 Cutting Mix"), "Pack 2 Cutting Mix");
});

test("los datos que llegan se limpian y dicen qué falta", () => {
  const d = normalizarDatosPrivatizar({ correo: " MARIA@Correo.com ", dropshipper: "María", iniciales: "m a", unidades: "50", bodega: "81", precio: "5,5", nombre: "P-MA X", origen: "4f0d6f56-1b68-4f4a-a5c0-7a1b0e3f9c11" });
  assert.deepEqual([d.correo, d.iniciales, d.unidades, d.bodega, d.precio, d.salida], ["maria@correo.com", "MA", 50, 81, 5.5, false]);
  assert.deepEqual(faltantesPrivatizar(d, 300), []);
  const vacio = normalizarDatosPrivatizar({ correo: "no-es-correo", unidades: -3, precio: 0, origen: "x" });
  assert.equal(vacio.correo, "");
  assert.equal(vacio.origen, "");
  assert.ok(faltantesPrivatizar(vacio, null).length >= 6);
  // Más unidades de las que hay.
  assert.match(faltantesPrivatizar(datos({ unidades: 400 }), 300).join(" "), /Solo hay 300/);
  assert.deepEqual(faltantesPrivatizar(datos({ unidades: 400 }), null), []);
});

test("el producto privado: copia del público, marcado privado, sin ID, sin reservas ni porcentajes y con el stock solo en la bodega elegida", () => {
  const r = armarPrivado(publico(), bp, datos());
  assert.ok("cuerpo" in r);
  const c = r.cuerpo;
  assert.equal(c.id, null);
  assert.equal(c.privated_product, true);
  assert.equal(c.name, "P-MA Aceite de Semilla de Calabaza");
  assert.equal(c.sale_price, 5.5);
  assert.equal(c.suggested_price, 5.5);
  assert.equal(c.name_in_guide, "ACEITE/CALABAZA");
  assert.equal(c.sku, "ACEITE/CALABAZA");
  assert.deepEqual(c.private_product_inventories, []);
  assert.deepEqual(c.user_profit_percentage_product, []);
  assert.deepEqual((c.warehouselected as Obj[]).map((b) => [b.warehouse_id, b.stock]), [[81, 50]]);
});

test("no se privatiza con variaciones, un producto que ya es privado, una bodega ajena ni más unidades de las que hay", () => {
  assert.match(String(errorDeOrigen(publico({ type: "VARIABLE" }), bp, datos())), /variaciones/);
  assert.match(String(errorDeOrigen(publico({ privated_product: true }), bp, datos())), /ya es privado/);
  assert.match(String(errorDeOrigen(publico(), bp, datos({ bodega: 280 }))), /no es de ECOMFIVE/);
  assert.match(String(errorDeOrigen(publico(), bp, datos({ unidades: 301 }))), /solo tiene 300/);
  assert.equal(errorDeOrigen(publico(), bp, datos({ unidades: 300 })), null);
  // Si ya se le sacó el stock al público (un reintento), no se vuelve a pedir que alcance.
  assert.equal(errorDeOrigen(publico({ warehouse_product: [] }), bp, datos({ salida: true })), null);
  assert.ok("error" in armarPrivado(publico({ type: "VARIABLE" }), bp, datos()));
});

test("la asignación al dropshipper: una reserva nueva con su usuario, el correo y las unidades, junto a las que ya había", () => {
  const nuevo = publico({ id: 11500, privated_product: true, warehouse_product: [{ warehouse_id: 81, stock: 50, warehouse: bodega81 }] });
  const r = armarAsignacion(nuevo, bp, usuario, datos());
  assert.ok("cuerpo" in r);
  const lista = r.cuerpo.private_product_inventories as Obj[];
  assert.equal(lista.length, 1);
  assert.deepEqual([lista[0].id, lista[0].product_id, lista[0].user_id, lista[0].stock, lista[0].email, lista[0].change, lista[0].deleted_at], [null, 11500, 5521, 50, "maria@correo.com", true, null]);
  assert.deepEqual(lista[0].user, usuario);
  assert.equal(r.cuerpo.id, 11500);
  // No se puede reservar más de lo que tiene.
  assert.match(String((armarAsignacion(publico({ id: 11500, warehouse_product: [{ warehouse_id: 81, stock: 20, warehouse: bodega81 }] }), bp, usuario, datos()) as { error: string }).error), /tiene 20 unidades/);
  // Con otra reserva activa, las dos cuentan contra el stock.
  const otra = publico({ id: 11500, warehouse_product: [{ warehouse_id: 81, stock: 60, warehouse: bodega81 }], private_product_inventories: [{ id: 9, product_id: 11500, user_id: 7, stock: 20, email: "otro@correo.com", deleted_at: null }] });
  assert.ok("error" in armarAsignacion(otra, bp, usuario, datos()));
  assert.equal(yaAsignado(otra, 7), true);
  assert.equal(yaAsignado(otra, 5521), false);
  assert.equal(yaAsignado(publico({ private_product_inventories: [{ user_id: 7, deleted_at: "2026-10-01" }] }), 7), false);
});

test("la salida del público: las unidades de la bodega con el concepto del ID privado", () => {
  const r = armarSalidaDelPublico(publico(), bp, datos(), 11500);
  assert.ok("cuerpo" in r);
  const b = (r.cuerpo.warehouselected as Obj[])[0];
  assert.deepEqual([b.warehouse_id, b.quantity, b.type_movement, b.concept], [81, 50, "SALIDA", "Privatizado en el ID 11500"]);
});

test("quitar una reserva es mandarla marcada como quitada, no borrarla de la lista", () => {
  const l = reservasQuitadas([
    { id: 1, product_id: 3, user_id: 5, stock: 4, email: "a@b.c", deleted_at: null, user: { id: 5 } },
    { id: 2, product_id: 3, user_id: 6, stock: 1, email: "d@e.f", deleted_at: "2026-10-01" },
  ]);
  assert.deepEqual(l.map((x) => [x.id, x.deleted_at, x.change]), [[1, true, true], [2, true, null]]);
  assert.deepEqual(reservasQuitadas(undefined), []);
});

test("el favorito arma exactamente lo mismo que el sistema", () => {
  const nuevo = publico({ id: 11500, privated_product: true, warehouse_product: [{ warehouse_id: 81, stock: 50, warehouse: bodega81 }] });
  const casos: [Obj, DatosPrivatizar][] = [
    [publico(), datos()],
    [publico(), datos({ unidades: 301 })],
    [publico({ type: "VARIABLE" }), datos()],
    [publico({ privated_product: true }), datos()],
    [publico(), datos({ bodega: 280 })],
    [publico({ warehouse_product: [] }), datos({ salida: true })],
  ];
  for (const [o, d] of casos) {
    igual(delFavorito.errorOrigen(o, bp, d), errorDeOrigen(o, bp, d));
    igual(delFavorito.privado(o, bp, d), armarPrivado(o, bp, d));
  }
  igual(delFavorito.asignacion(nuevo, bp, usuario, datos()), armarAsignacion(nuevo, bp, usuario, datos()));
  const llena = publico({ id: 11500, warehouse_product: [{ warehouse_id: 81, stock: 60, warehouse: bodega81 }], private_product_inventories: [{ id: 9, product_id: 11500, user_id: 7, stock: 20, email: "o@c.com", deleted_at: null }] });
  igual(delFavorito.asignacion(llena, bp, usuario, datos()), armarAsignacion(llena, bp, usuario, datos()));
  igual(delFavorito.salidaPublico(publico(), bp, datos(), 11500), armarSalidaDelPublico(publico(), bp, datos(), 11500));
  igual(delFavorito.reservasQuitadas(llena.private_product_inventories), reservasQuitadas(llena.private_product_inventories));
  assert.equal(delFavorito.yaAsignado(llena, 7), yaAsignado(llena, 7));
});
