import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCIONES_FILA_DROP, accionDeEstado, motivoAccesoPrivado, motivoCambioEstado, motivoEliminar, motivoGestionarInventario, motivoLiquidacion, validarAccesoPrivado, validarSolicitudIngreso } from "./acciones";

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
    assert.deepEqual([...ACCIONES_FILA_DROP], ["estado", "inventario", "privatizar", "liquidacion", "eliminar"]);
  });

  it("sin ID de Drop no se pide inventario ni se da acceso privado", () => {
    assert.equal(motivoGestionarInventario({ estado: "activo", idDrop: "" }), "Sin ID de Drop");
    assert.equal(motivoAccesoPrivado({ estado: "activo", idDrop: "" }), "Sin ID de Drop");
    assert.equal(motivoGestionarInventario({ estado: "inactivo", idDrop: "77" }), null);
    assert.equal(motivoAccesoPrivado({ estado: "activo", idDrop: "77" }), null);
  });
  it("la solicitud de ingreso pide unidades enteras de 1 en adelante", () => {
    assert.deepEqual(validarSolicitudIngreso("200"), { unidades: 200 });
    assert.ok("error" in validarSolicitudIngreso("0"));
    assert.ok("error" in validarSolicitudIngreso("1.5"));
    assert.ok("error" in validarSolicitudIngreso(""));
  });
  it("el acceso privado pide el correo; el precio es opcional (sin él, el mismo)", () => {
    assert.deepEqual(validarAccesoPrivado(" Cliente@Correo.com ", ""), { correo: "cliente@correo.com", precio: null });
    assert.deepEqual(validarAccesoPrivado("a@b.co", "9500"), { correo: "a@b.co", precio: 9500 });
    assert.ok("error" in validarAccesoPrivado("sin-arroba", ""));
    assert.ok("error" in validarAccesoPrivado("a@b.co", "-5"));
  });
});
