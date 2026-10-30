import assert from "node:assert/strict";
import { test } from "node:test";
import { chatVisibleParaAtencion, mensajeVisibleParaAtencion } from "./borrados-atencion";

const corte = "2026-10-30T12:00:00.000Z";

test("un chat sin marca de borrado se ve", () => {
  assert.equal(chatVisibleParaAtencion("2026-10-30T10:00:00.000Z", null), true);
});

test("un chat borrado en la app desaparece para Atención, salvo que llegue un mensaje después", () => {
  assert.equal(chatVisibleParaAtencion("2026-10-30T11:59:00.000Z", corte), false);
  assert.equal(chatVisibleParaAtencion(null, corte), false);
  assert.equal(chatVisibleParaAtencion("2026-10-30T12:05:00.000Z", corte), true);
});

test("un mensaje eliminado en WhatsApp no se ve", () => {
  assert.equal(mensajeVisibleParaAtencion({ id: "a", momento: "2026-10-30T10:00:00.000Z" }, new Set(["a"]), null), false);
  assert.equal(mensajeVisibleParaAtencion({ id: "b", momento: "2026-10-30T10:00:00.000Z" }, new Set(["a"]), null), true);
});

test("con el chat borrado, solo se ven los mensajes de después", () => {
  assert.equal(mensajeVisibleParaAtencion({ id: "a", momento: "2026-10-30T11:00:00.000Z" }, new Set(), corte), false);
  assert.equal(mensajeVisibleParaAtencion({ id: "b", momento: "2026-10-30T12:30:00.000Z" }, new Set(), corte), true);
});
