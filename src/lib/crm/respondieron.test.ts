import assert from "node:assert/strict";
import { test } from "node:test";
import { areaDeModulos, cargoDePersona, quienesRespondieron } from "./respondieron";

test("el área de una persona es la de más arriba que tiene", () => {
  assert.equal(areaDeModulos(["crm-dropshippers"]), "atencion");
  assert.equal(areaDeModulos(["crm-dropshippers", "crm-comercial"]), "comercial");
  assert.equal(areaDeModulos(["crm-comercial", "crm-direccion", "crm-dropshippers"]), "direccion");
  assert.equal(areaDeModulos(["retiros"]), null);
});

test("el cargo es el puesto principal activo; sin puesto, el área del CRM", () => {
  const puestos = [
    { id: "p1", nombre: "Líder comercial", activo: true },
    { id: "p2", nombre: "Atención al cliente", activo: true },
    { id: "p3", nombre: "Puesto viejo", activo: false },
  ];
  const ocupantes = [
    { puestoId: "p2", usuarioId: "ana", principal: false },
    { puestoId: "p1", usuarioId: "jhok", principal: false },
    { puestoId: "p2", usuarioId: "jhok", principal: true },
    { puestoId: "p3", usuarioId: "luis", principal: true },
  ];
  assert.equal(cargoDePersona("ana", puestos, ocupantes, "direccion"), "Atención al cliente");
  assert.equal(cargoDePersona("jhok", puestos, ocupantes, "direccion"), "Atención al cliente");
  assert.equal(cargoDePersona("luis", puestos, ocupantes, "comercial"), "Líder comercial");
  assert.equal(cargoDePersona("nadie", puestos, ocupantes, "atencion"), "Atención");
  assert.equal(cargoDePersona("nadie", puestos, ocupantes, null), null);
});

test("quién respondió: una vez por persona, la más reciente primero, sin notas ni mensajes sin autor", () => {
  const r = quienesRespondieron([
    { direccion: "entrante", autor: null, momento: "2026-10-29T10:00:00Z" },
    { direccion: "saliente", autor: "Ana", autorCargo: "Atención", momento: "2026-10-29T10:01:00Z" },
    { direccion: "nota", autor: "Jhokser", autorCargo: "Líder comercial", momento: "2026-10-29T10:02:00Z" },
    { direccion: "saliente", autor: "Jhokser", autorCargo: "Líder comercial", momento: "2026-10-29T10:05:00Z" },
    { direccion: "saliente", autor: "Ana", autorCargo: "Atención", momento: "2026-10-29T10:03:00Z" },
    { direccion: "saliente", autor: null, momento: "2026-10-29T10:06:00Z" },
  ]);
  assert.deepEqual(r, [
    { nombre: "Jhokser", cargo: "Líder comercial", mensajes: 1, ultimo: "2026-10-29T10:05:00Z" },
    { nombre: "Ana", cargo: "Atención", mensajes: 2, ultimo: "2026-10-29T10:03:00Z" },
  ]);
  assert.deepEqual(quienesRespondieron([]), []);
});
