import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Ocupante, PuestoBase } from "../puestos/organigrama";
import { MAX_MOTIVO, motivoLimpio, motivoValido, puedeCancelar, puedeResolver, quienAutoriza, vistaPreviaTexto } from "./borrado";

const puesto = (id: string, reportaA: string | null): PuestoBase => ({ id, nombre: id, area: "x", reportaA, plazas: 1, activo: true });
// Jefe de Atención reporta al Gerente, que reporta al CEO.
const puestos = [puesto("ceo", null), puesto("gerente", "ceo"), puesto("atencion", "gerente")];
const ocupante = (puestoId: string, usuarioId: string): Ocupante => ({ puestoId, usuarioId, principal: true });

describe("quienAutoriza", () => {
  it("pide la autorización al jefe de quien lo pide", () => {
    const o = [ocupante("atencion", "nicole"), ocupante("gerente", "ana"), ocupante("ceo", "hernan")];
    assert.deepEqual(quienAutoriza("nicole", puestos, o, new Set(["ana", "hernan"]), ["hernan"]), { ids: ["ana"], origen: "jefe" });
  });
  it("si el puesto del jefe está vacante, sube al siguiente", () => {
    const o = [ocupante("atencion", "nicole"), ocupante("ceo", "hernan")];
    assert.deepEqual(quienAutoriza("nicole", puestos, o, new Set(["hernan"]), []), { ids: ["hernan"], origen: "jefe" });
  });
  it("si el jefe no puede abrir el CRM, lo autoriza un administrador", () => {
    const o = [ocupante("atencion", "nicole"), ocupante("gerente", "ana")];
    assert.deepEqual(quienAutoriza("nicole", puestos, o, new Set(["hernan"]), ["hernan"]), { ids: ["hernan"], origen: "administrador" });
  });
  it("quien no tiene puesto ni jefe lo pide a un administrador, nunca a sí misma", () => {
    assert.deepEqual(quienAutoriza("nicole", puestos, [], new Set(["hernan", "nicole"]), ["nicole", "hernan"]), { ids: ["hernan"], origen: "administrador" });
  });
  it("el CEO no se autoriza a sí mismo: si es el único administrador, no hay a quién pedirlo", () => {
    const o = [ocupante("ceo", "hernan")];
    assert.equal(quienAutoriza("hernan", puestos, o, new Set(["hernan"]), ["hernan"]), null);
  });
  it("sin jefe ni administradores con acceso, no hay a quién pedirlo", () => {
    assert.equal(quienAutoriza("nicole", puestos, [], new Set(), []), null);
  });
});

describe("quién resuelve y quién cancela", () => {
  it("resuelve quien está en la lista y no es quien lo pidió", () => {
    assert.equal(puedeResolver("ana", ["ana"], "nicole"), true);
    assert.equal(puedeResolver("pedro", ["ana"], "nicole"), false);
    assert.equal(puedeResolver("nicole", ["nicole"], "nicole"), false);
    assert.equal(puedeResolver("", [""], null), false);
  });
  it("cancela quien lo pidió o un administrador", () => {
    assert.equal(puedeCancelar("nicole", "nicole", false), true);
    assert.equal(puedeCancelar("pedro", "nicole", false), false);
    assert.equal(puedeCancelar("pedro", "nicole", true), true);
  });
});

describe("motivo y vista previa", () => {
  it("limpia el motivo y lo exige de al menos 5 letras", () => {
    assert.equal(motivoLimpio("  se envió\n por   error  "), "se envió por error");
    assert.equal(motivoLimpio("x".repeat(500)).length, MAX_MOTIVO);
    assert.equal(motivoLimpio(null), "");
    assert.equal(motivoValido("error"), true);
    assert.equal(motivoValido("ok"), false);
  });
  it("acorta el mensaje en una línea", () => {
    assert.equal(vistaPreviaTexto("hola\n  mundo"), "hola mundo");
    assert.equal(vistaPreviaTexto("a".repeat(200), 10), "aaaaaaaaa…");
    assert.equal(vistaPreviaTexto(null), "");
  });
});
