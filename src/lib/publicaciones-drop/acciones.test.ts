import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCIONES_FILA_DROP, accionDeEstado, motivoCambioEstado, motivoEliminar, motivoLiquidacion } from "./acciones";

describe("acciones de Drop", () => {
  it("el mismo botón inactiva una activa y activa una inactiva", () => {
    assert.deepEqual(accionDeEstado({ estado: "activo" }), { accion: "inactivar", texto: "Inactivar publicación" });
    assert.deepEqual(accionDeEstado({ estado: "inactivo" }), { accion: "activar", texto: "Activar publicación" });
  });
  it("sin ID de Drop no se puede inactivar, activar ni eliminar", () => {
    assert.equal(motivoCambioEstado({ estado: "activo", idDrop: " " }), "Sin ID de Drop");
    assert.equal(motivoEliminar({ estado: "inactivo", idDrop: "" }), "Sin ID de Drop");
    assert.equal(motivoCambioEstado({ estado: "activo", idDrop: "123" }), null);
    assert.equal(motivoEliminar({ estado: "activo", idDrop: "123" }), null);
  });
  it("la liquidación siempre queda pendiente", () => {
    assert.match(motivoLiquidacion(), /Pendiente/);
  });
  it("la fila no tiene republicar ni archivar", () => {
    assert.deepEqual([...ACCIONES_FILA_DROP], ["estado", "liquidacion", "eliminar"]);
  });
});
