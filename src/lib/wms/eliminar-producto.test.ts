import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mensajeBloqueos, nombreBloqueo } from "./eliminar-producto";

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
