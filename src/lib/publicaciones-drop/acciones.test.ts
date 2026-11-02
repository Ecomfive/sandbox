import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCIONES_FILA_DROP, MOTIVO_SOLO_DROPI, accionDeEstado, motivoAccesoPrivado, motivoCambioEstado, motivoEliminar, motivoGestionarInventario, motivoLiquidacion, validarAccesoPrivado, validarSolicitudIngreso } from "./acciones";

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
  it("la fila lleva los íconos de Dropi en su orden, más eliminar", () => {
    assert.deepEqual([...ACCIONES_FILA_DROP], ["republicar", "privatizar", "inventario", "estado", "pausar", "liquidacion", "archivar", "eliminar", "tareas"]);
  });
  it("lo que Drop no tiene va apagado y dice por qué", () => {
    assert.match(MOTIVO_SOLO_DROPI.republicar, /no republica/);
    assert.match(MOTIVO_SOLO_DROPI.archivar, /elimina/);
    for (const m of Object.values(MOTIVO_SOLO_DROPI)) assert.ok(m.length > 5);
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
  it("el acceso privado pide el correo y las unidades a apartar; el precio es opcional (sin él, el mismo)", () => {
    assert.deepEqual(validarAccesoPrivado(" Cliente@Correo.com ", "", "20"), { correo: "cliente@correo.com", precio: null, unidades: 20 });
    assert.deepEqual(validarAccesoPrivado("a@b.co", "9500", "5"), { correo: "a@b.co", precio: 9500, unidades: 5 });
    assert.ok("error" in validarAccesoPrivado("sin-arroba", "", "5"));
    assert.ok("error" in validarAccesoPrivado("a@b.co", "-5", "5"));
  });
  it("las unidades apartadas son enteras, de 1 en adelante y no pasan de las que hay", () => {
    for (const malo of ["", "0", "1.5", "-2", "abc"]) assert.ok("error" in validarAccesoPrivado("a@b.co", "", malo), malo);
    assert.deepEqual(validarAccesoPrivado("a@b.co", "", "10", 10), { correo: "a@b.co", precio: null, unidades: 10 });
    assert.ok("error" in validarAccesoPrivado("a@b.co", "", "11", 10));
    assert.deepEqual(validarAccesoPrivado("a@b.co", "", "11", null), { correo: "a@b.co", precio: null, unidades: 11 });
  });
});
