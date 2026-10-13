import assert from "node:assert/strict";
import { test } from "node:test";
import { eventoVisible } from "../auditoria-visible";

const sinPais = () => undefined;

test("un evento solo se ve con el módulo de su entidad", () => {
  const u = { modulos: ["notificaciones", "retiros"], paisesPermitidos: null };
  assert.equal(eventoVisible({ accion: "crear_retiro", entidad: "retiros", entidad_id: "1" }, u, sinPais), true);
  assert.equal(eventoVisible({ accion: "crear_usuario", entidad: "perfiles", entidad_id: "1" }, u, sinPais), false);
  assert.equal(eventoVisible({ accion: "editar_campo_compra", entidad: "wms_compras", entidad_id: "1" }, u, sinPais), false);
});

test("una entidad desconocida solo la ve quien tiene Usuarios y roles", () => {
  assert.equal(eventoVisible({ accion: "x", entidad: "tabla_nueva", entidad_id: null }, { modulos: ["notificaciones"], paisesPermitidos: null }, sinPais), false);
  assert.equal(eventoVisible({ accion: "x", entidad: "tabla_nueva", entidad_id: null }, { modulos: ["notificaciones", "usuarios"], paisesPermitidos: null }, sinPais), true);
});

test("las acciones del CRM Comercial piden crm-comercial", () => {
  const ev = { accion: "crear_seguimiento_dropshipper", entidad: "dropshippers", entidad_id: "1" };
  assert.equal(eventoVisible(ev, { modulos: ["crm-dropshippers"], paisesPermitidos: null }, sinPais), false);
  assert.equal(eventoVisible(ev, { modulos: ["crm-dropshippers", "crm-comercial"], paisesPermitidos: null }, sinPais), true);
  assert.equal(eventoVisible({ accion: "registrar_interaccion", entidad: "dropshippers", entidad_id: "1" }, { modulos: ["crm-dropshippers"], paisesPermitidos: null }, sinPais), true);
});

test("una compra de un país no permitido no se ve (ni una de país desconocido)", () => {
  const u = { modulos: ["compras"], paisesPermitidos: ["CR"] };
  const ev = { accion: "editar_campo_compra", entidad: "wms_compras", entidad_id: "c1" };
  assert.equal(eventoVisible(ev, u, () => "CR"), true);
  assert.equal(eventoVisible(ev, u, () => "PA"), false);
  assert.equal(eventoVisible(ev, u, () => undefined), false);
  assert.equal(eventoVisible(ev, u, () => null), false);
  assert.equal(eventoVisible(ev, { modulos: ["compras"], paisesPermitidos: ["importacion"] }, () => null), true);
});
