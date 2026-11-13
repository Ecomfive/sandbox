import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mensajeBloqueos, mensajeBloqueosVariante, mensajeErrorQuitarVariante, nombreBloqueo } from "./eliminar-producto";

describe("nombreBloqueo", () => {
  it("dice con palabras del equipo qué tabla lo bloquea", () => {
    assert.deepEqual(nombreBloqueo("wms_compra_items.sku_maestro_id"), ["compra", "compras"]);
    assert.deepEqual(nombreBloqueo("dropi_publicaciones.sku_maestro_id"), ["publicación de Dropi", "publicaciones de Dropi"]);
    assert.deepEqual(nombreBloqueo("skus_maestros.padre_id"), ["variante", "variantes"]);
    assert.deepEqual(nombreBloqueo("sku_maestro_componentes.componente_id"), ["compuesto que lo usa", "compuestos que lo usan"]);
  });
  it("una tabla que no se conoce sale con su nombre, sin guiones bajos", () => {
    assert.deepEqual(nombreBloqueo("tabla_nueva_rara.sku_maestro_id"), ["tabla nueva rara", "tabla nueva rara"]);
  });
});

describe("mensajeBloqueos", () => {
  it("lista lo que lo bloquea, de más a menos, en singular o plural", () => {
    const m = mensajeBloqueos("ABC/123", { "dropi_publicaciones.sku_maestro_id": 1, "wms_compra_items.sku_maestro_id": 3 });
    assert.equal(m, "No se puede eliminar ABC/123: lo usan 3 compras, 1 publicación de Dropi. Quita esos vínculos o pásalo a Inactivo o Descontinuado.");
  });
  it("junta lo que se llama igual (el stock y el stock por ubicación)", () => {
    const m = mensajeBloqueos("X", { "wms_stock.sku_maestro_id": 1, "wms_stock_ubicacion.sku_maestro_id": 2 });
    assert.match(m, /lo usan 3 registros de stock\./);
  });
  it("sin bloqueos conocidos, un aviso simple", () => {
    assert.equal(mensajeBloqueos("X", {}), "No se pudo eliminar X.");
  });
});

describe("mensajeBloqueosVariante", () => {
  it("los movimientos que no suman cero se dicen como tales; lo demás, como lo que la usa", () => {
    assert.equal(
      mensajeBloqueosVariante("BOTAS/47", { "wms_movimientos.sku_maestro_id": 2, "wms_stock.sku_maestro_id": 1 }),
      "No se puede quitar la variante BOTAS/47: la usan 1 registro de stock y sus movimientos de inventario no suman cero (todavía tiene unidades o se movieron entre bodegas). Si ya no se usa, déjala en 0 o pásala a Inactivo.",
    );
    assert.match(mensajeBloqueosVariante("X", { "wms_compra_items.sku_maestro_id": 2 }), /la usan 2 compras\. /);
    assert.equal(mensajeBloqueosVariante("X", {}), "No se pudo quitar la variante X.");
  });
});

describe("mensajeErrorQuitarVariante", () => {
  it("el error de la base al quitar una variante dice qué la usa", () => {
  assert.equal(
    mensajeErrorQuitarVariante('update or delete on table "skus_maestros" violates foreign key constraint "x_sku_fkey" on table "wms_compra_items"'),
    "No se pudo quitar la variante: todavía la usa «compra» (wms_compra_items).",
  );
  assert.match(mensajeErrorQuitarVariante("canceling statement due to statement timeout"), /^No se pudo quitar la variante: canceling/);
  assert.equal(mensajeErrorQuitarVariante(null), "No se pudo quitar la variante.");
});
});
