import assert from "node:assert/strict";
import test from "node:test";
import { armarGuardadoProducto } from "./dropi-guardado";
import { ARMAR_JS, marcadorAplicarDropi, origenDropi } from "./marcador-aplicar-dropi";

type Cambio = { nombre: string | null; nombreGuia: string | null; precio?: number | null; precioSugerido?: number | null };
type Armar = (o: object, bp: object[], c: Cambio) => object;
const armarDelFavorito = new Function(`${ARMAR_JS}; return armar;`)() as Armar;

const ciudad = { id: 501, name: "CIUDAD DE PANAMA" };
const base = {
  id: 7587, name: "URO/PROBIOTIC (B280)", description: "<p>x</p>", dropi_app_description: null, type: "SIMPLE", sale_price: "5.49", suggested_price: "5.49", user_id: 2094,
  privated_product: false, active: true, sku: "URO/PROBIOTIC (B280)", weight: "1.00", length: "1.00", width: "1.00", height: "1.00", variations: [],
  categories: [{ id: 4, name: "Salud" }], add_stock_in_return: false, private_product_inventories: [], user_profit_percentage_product: [], is_warehouse_white_brand: false,
  name_in_guide: null, shipping_method: null, bar_code: null, dropi_product_supplier_increment_fixed: false,
  warehouse_product: [{ warehouse_id: 280, stock: 185, warehouse: { id: 280, name: "Bodega Dropi Panama", city: ciudad, warehouse_white_brand: true } }],
};
const bp = [{ id: 81, name: "Proveedor Ecomfive", address: "Ave Centenario, Costa del Este", warehouse_white_brand: false }];

test("el favorito arma exactamente el mismo guardado que el sistema (el probado con Dropi)", () => {
  const casos: [object, Cambio][] = [
    [base, { nombre: "Probióticos URO", nombreGuia: "URO/PROBIOTIC" }],
    [{ ...base, warehouse_product: [] }, { nombre: "Extracto de ajo sin olor", nombreGuia: null }],
    [{ ...base, name_in_guide: "VIEJA" }, { nombre: "Otro nombre", nombreGuia: null }],
    [{ ...base, type: "VARIABLE" }, { nombre: "X", nombreGuia: null }],
    [base, { nombre: "x".repeat(41), nombreGuia: null }],
    // Precios (22 oct 2026): solo el precio, el precio y el sugerido, un sugerido menor que el precio y un precio en cero.
    [base, { nombre: null, nombreGuia: null, precio: 5.29 }],
    [{ ...base, suggested_price: "12.99" }, { nombre: null, nombreGuia: null, precio: 5.29, precioSugerido: 13.99 }],
    [base, { nombre: null, nombreGuia: null, precio: 6.99 }],
    [base, { nombre: "Otro", nombreGuia: null, precio: 0 }],
  ];
  for (const [p, c] of casos) assert.deepEqual(JSON.parse(JSON.stringify(armarDelFavorito(p, bp, c))), JSON.parse(JSON.stringify(armarGuardadoProducto(p as Record<string, unknown>, bp, c))));
});

test("el favorito lleva el origen de la plataforma, abre la ventana de aplicar y solo acepta https (o localhost)", () => {
  const codigo = decodeURIComponent(marcadorAplicarDropi("https://sistema.ecomfive.io/x").slice("javascript:".length));
  assert.ok(codigo.includes('var O="https://sistema.ecomfive.io"'));
  assert.ok(codigo.includes("/publicaciones-dropi/aplicar-dropi?p="));
  assert.ok(codigo.includes("e.origin!==O||e.source!==W"));
  // La sesión no viaja: el favorito no manda el token a la plataforma.
  assert.equal(/postMessage\([^)]*T[,)]/.test(codigo), false);
  assert.throws(() => marcadorAplicarDropi("http://sistema.ecomfive.io"));
  assert.equal(origenDropi("pa"), "https://app.dropi.pa");
  assert.equal(origenDropi("xyz"), null);
});
