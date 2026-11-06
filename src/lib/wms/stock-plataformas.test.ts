import assert from "node:assert/strict";
import { test } from "node:test";
import { armarStockPlataformas, lecturaVieja, textoPlataformas } from "./stock-plataformas";

const vacio = { dropi: [], productosDropi: [], effi: [], drop: [] };
const pub = (sku: string, dropi_id: string | null, estado_publicacion: string | null = "activo") => ({ sku_maestro_id: sku, dropi_id, nombre: `Pub ${sku}`, estado_publicacion });
const prod = (dropi_producto_id: number, bodegas: { id: number; stock: number }[] | null, stock: number | null = null, leido_en: string | null = null) => ({ dropi_producto_id, stock, bodegas, leido_en });
const effi = (sku: string | null, stock_principal: number, stock_garantias = 0, en_effi = true) => ({ sku_maestro_id: sku, effi_id: 7, nombre: "E", stock_principal, stock_garantias, en_effi, ultima_vez: null });
const drop = (sku: string | null, inventario: number | null, en_drop = true) => ({ sku_maestro_id: sku, codigo: "D1", nombre: "D", inventario, en_drop, ultima_vez: null });

test("junta las tres plataformas por producto", () => {
  const { porProducto } = armarStockPlataformas({ ...vacio, dropi: [pub("a", "1001")], productosDropi: [prod(1001, [{ id: 15, stock: 100 }])], effi: [effi("a", 30)], drop: [drop("a", 44)] });
  const a = porProducto.get("a");
  assert.deepEqual([a?.dropi, a?.effi, a?.drop, a?.total], [100, 30, 44, 174]);
  assert.equal(a?.lineas.length, 3);
});

test("Dropi: solo cuenta su bodega; lo de otra es referencial y sin detalle todo lo es", () => {
  const { porProducto } = armarStockPlataformas({
    ...vacio,
    dropi: [pub("a", "1001"), pub("b", "1002")],
    productosDropi: [prod(1001, [{ id: 15, stock: 100 }, { id: 36, stock: 9 }]), prod(1002, null, 50)],
  });
  assert.equal(porProducto.get("a")?.dropi, 100);
  assert.equal(porProducto.get("a")?.lineas[0].aparte, 9);
  assert.equal(porProducto.get("b")?.dropi, 0);
  assert.equal(porProducto.get("b")?.total, 0);
  assert.equal(porProducto.get("b")?.lineas[0].aparte, 50);
});

test("un ID de Dropi cuenta una sola vez, y un borrador no cuenta", () => {
  const { porProducto } = armarStockPlataformas({ ...vacio, dropi: [pub("z", "1001", "borrador"), pub("a", "1001"), pub("a", "1001")], productosDropi: [prod(1001, [{ id: 15, stock: 100 }])] });
  assert.equal(porProducto.get("a")?.dropi, 100);
  assert.equal(porProducto.has("z"), false);
});

test("una publicación con dos IDs suma los dos", () => {
  const { porProducto } = armarStockPlataformas({ ...vacio, dropi: [pub("a", "1001 / 1002")], productosDropi: [prod(1001, [{ id: 15, stock: 10 }]), prod(1002, [{ id: 15, stock: 5 }])] });
  assert.equal(porProducto.get("a")?.dropi, 15);
});

test("sin vincular, fuera de la plataforma o en cero no sale; las garantías no suman", () => {
  const { porProducto } = armarStockPlataformas({ ...vacio, effi: [effi(null, 30), effi("a", 30, 0, false), effi("b", 0), effi("c", 10, 2)], drop: [drop(null, 5), drop("d", 5, false), drop("e", null)] });
  assert.deepEqual([...porProducto.keys()], ["c"]);
  assert.equal(porProducto.get("c")?.total, 10);
  assert.equal(porProducto.get("c")?.lineas[0].aparte, 2);
});

test("la última lectura de cada plataforma, y cuándo está vieja", () => {
  const { lecturas } = armarStockPlataformas({ ...vacio, productosDropi: [prod(1, [], 0, "2026-11-01T10:00:00Z"), prod(2, [], 0, "2026-11-03T10:00:00Z"), prod(3, [], 0, null)] });
  assert.deepEqual(lecturas, { dropi: "2026-11-03T10:00:00Z", effi: null, drop: null });
  const ahora = Date.parse("2026-11-06T10:00:00Z");
  assert.equal(lecturaVieja("2026-11-05T10:00:00Z", ahora), false);
  assert.equal(lecturaVieja("2026-11-03T10:00:00Z", ahora), true);
  assert.equal(lecturaVieja(null, ahora), true);
});

test("el texto solo dice las plataformas con algo", () => {
  assert.equal(textoPlataformas({ dropi: 120, effi: 0, drop: 44 }), "Dropi 120 · Drop 44");
  assert.equal(textoPlataformas(null), "");
});
