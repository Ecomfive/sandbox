import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { elegirConservado, lineasUnidas, mensajeErrorUnir } from "./unir-productos";

const p = (id: string, numero: number | null, creado_en: string) => ({ id, numero, creado_en });

describe("elegirConservado", () => {
  it("se queda el más viejo por fecha, venga en el orden que venga", () => {
    const viejo = p("b", 141, "2026-09-25T12:39:58.301718+00:00");
    const nuevo = p("a", 347, "2026-10-13T17:25:37.26486+00:00");
    assert.equal(elegirConservado(viejo, nuevo).conservar.id, "b");
    assert.equal(elegirConservado(nuevo, viejo).conservar.id, "b");
    assert.equal(elegirConservado(nuevo, viejo).eliminar.id, "a");
  });
  it("con la misma fecha (los que se cargaron de una vez) decide el N.º correlativo", () => {
    const x = p("x", 27, "2026-09-25T12:39:58.301718+00:00");
    const y = p("y", 33, "2026-09-25T12:39:58.301718+00:00");
    assert.equal(elegirConservado(y, x).conservar.id, "x");
    assert.equal(elegirConservado(x, y).conservar.id, "x");
  });
  it("un producto sin N.º va después del que sí lo tiene", () => {
    const con = p("con", 10, "2026-09-25T12:00:00+00:00");
    const sin = p("sin", null, "2026-09-25T12:00:00+00:00");
    assert.equal(elegirConservado(sin, con).conservar.id, "con");
  });
  it("si todo empata, decide el id y el resultado no depende del orden", () => {
    const x = p("aaa", 5, "2026-09-25T12:00:00+00:00");
    const y = p("bbb", 5, "2026-09-25T12:00:00+00:00");
    assert.equal(elegirConservado(x, y).conservar.id, "aaa");
    assert.equal(elegirConservado(y, x).conservar.id, "aaa");
  });
  it("una fecha que no se entiende cuenta como la más nueva", () => {
    const bien = p("bien", 9, "2026-10-01T00:00:00+00:00");
    const mal = p("mal", 1, "no es fecha");
    assert.equal(elegirConservado(mal, bien).conservar.id, "bien");
  });
});

describe("lineasUnidas", () => {
  it("dice con palabras del equipo lo que pasó al producto que queda", () => {
    assert.deepEqual(lineasUnidas({ "wms_productos_test.sku_maestro_id": 1, "dropi_publicaciones.sku_maestro_id": 1 }), ["1 test de Test productos", "1 publicación de Dropi"]);
  });
  it("ordena de más a menos, usa el plural y cuenta las líneas de compra como líneas", () => {
    assert.deepEqual(lineasUnidas({ "dropi_publicaciones.sku_maestro_id": 2, "wms_compra_items.sku_maestro_id": 5 }), ["5 líneas de compra", "2 publicaciones de Dropi"]);
    assert.deepEqual(lineasUnidas({ "wms_compra_items.sku_maestro_id": 1 }), ["1 línea de compra"]);
  });
  it("lo que se llama igual se suma", () => {
    assert.deepEqual(lineasUnidas({ "wms_stock.sku_maestro_id": 1, "wms_stock_ubicacion.sku_maestro_id": 2 }), ["3 registros de stock"]);
  });
  it("los componentes de un combo se dicen como tales", () => {
    assert.deepEqual(lineasUnidas({ "sku_maestro_componentes.combo_id": 2 }), ["2 componentes del combo"]);
    assert.deepEqual(lineasUnidas({ "sku_maestro_componentes.componente_id": 1 }), ["1 combo que lo usa"]);
  });
  it("la foto va al final y solo si de verdad pasó", () => {
    assert.deepEqual(lineasUnidas({ foto: true, "wms_productos_test.sku_maestro_id": 1 }), ["1 test de Test productos", "la foto del producto"]);
    assert.deepEqual(lineasUnidas({ foto: false }), []);
  });
  it("sin nada movido (o con datos raros) la lista queda vacía", () => {
    assert.deepEqual(lineasUnidas({}), []);
    assert.deepEqual(lineasUnidas(null), []);
    assert.deepEqual(lineasUnidas({ "x.y": 0, "z.w": "nada" }), []);
  });
});

describe("mensajeErrorUnir", () => {
  it("muestra tal cual el motivo que da la base cuando se niega", () => {
    const m = "No se unen X: tiene movimientos de inventario. Mueve su stock con un ajuste antes de unirlo.";
    assert.equal(mensajeErrorUnir(m), m);
    assert.equal(mensajeErrorUnir("Elige dos productos distintos."), "Elige dos productos distintos.");
  });
  it("cualquier otro error de la base no se enseña", () => {
    assert.equal(mensajeErrorUnir('relation "algo" does not exist'), "No se pudieron unir los productos.");
    assert.equal(mensajeErrorUnir(null), "No se pudieron unir los productos.");
  });
});
