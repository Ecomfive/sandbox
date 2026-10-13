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

test("la orden de compra o el movimiento de un producto se filtran por el país de su detalle", () => {
  const paises = [{ codigo: "PA", nombre: "Panamá" }, { codigo: "CR", nombre: "Costa Rica" }];
  const u = { modulos: ["producto"], paisesPermitidos: ["CR"] };
  const mov = (detalle: string) => ({ accion: "movimiento_inventario", entidad: "skus_maestros", entidad_id: "1", detalle });
  assert.equal(eventoVisible(mov("entrada 5 de X · Costa Rica"), u, sinPais, paises), true);
  assert.equal(eventoVisible(mov("entrada 5 de X · Panamá"), u, sinPais, paises), false);
  assert.equal(eventoVisible(mov("entrada 5 de X"), u, sinPais, paises), false);
  assert.equal(eventoVisible({ accion: "crear_compra", entidad: "skus_maestros", entidad_id: "1", detalle: "OC-0001 · X · Panamá (al pasar a Activo)" }, u, sinPais, paises), false);
  assert.equal(eventoVisible({ accion: "cambiar_clase", entidad: "skus_maestros", entidad_id: "1", detalle: "x" }, u, sinPais, paises), true);
  assert.equal(eventoVisible(mov("entrada 5 de X"), { modulos: ["producto"], paisesPermitidos: null }, sinPais, paises), true);
});
