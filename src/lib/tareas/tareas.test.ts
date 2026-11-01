import assert from "node:assert/strict";
import { test } from "node:test";
import { atrasada, motivoNoPuede, normalizarCambio, numeroTarea, puedeVerTarea } from "./tareas";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("número de la tarea", () => assert.equal(numeroTarea(7), "TAR-0007"));

test("normalizar: solo lo que viene, con su forma", () => {
  assert.deepEqual(normalizarCambio({ titulo: "  Revisar   precios " }), { cambio: { titulo: "Revisar precios" } });
  assert.deepEqual(normalizarCambio({ titulo: " " }), { error: "La tarea necesita un título." });
  assert.deepEqual(normalizarCambio({ estado: "volando" }), { error: "Estado no válido." });
  assert.deepEqual(normalizarCambio({ prioridad: "" }), { cambio: { prioridad: null } });
  assert.deepEqual(normalizarCambio({ responsableId: "x" }), { error: "Persona no válida." });
  assert.deepEqual(normalizarCambio({ fechaInicio: "2026-11-05", fechaLimite: "2026-11-01" }), { error: "La fecha de inicio va antes de la fecha límite." });
  assert.deepEqual(normalizarCambio({ modulo: "publicaciones-dropi", descripcion: "" }), { cambio: { modulo: "publicaciones-dropi", descripcion: null } });
});

test("quién ve y quién cambia", () => {
  const t = { responsableId: A, creadoPor: B };
  assert.equal(puedeVerTarea(t, { id: A, admin: false }), true);
  assert.equal(puedeVerTarea(t, { id: B, admin: false }), true);
  assert.equal(puedeVerTarea({ responsableId: null, creadoPor: B }, { id: A, admin: false }), false);
  assert.equal(puedeVerTarea({ responsableId: null, creadoPor: B }, { id: A, admin: true }), true);
  assert.equal(motivoNoPuede(t, { estado: "hecho" }, { id: A, admin: false }), null);
  assert.match(motivoNoPuede(t, { responsableId: B }, { id: A, admin: false }) ?? "", /administrador/);
  assert.match(motivoNoPuede(t, { responsableId: null }, { id: A, admin: false }) ?? "", /no puedes soltar/i);
  assert.equal(motivoNoPuede(t, { responsableId: null }, { id: B, admin: false }), null, "quien la creó la puede soltar");
  assert.equal(motivoNoPuede({ responsableId: null, creadoPor: B }, { titulo: "x" }, { id: A, admin: false }), "Esa tarea no es tuya.");
  assert.equal(motivoNoPuede(t, { responsableId: B }, { id: A, admin: true }), null);
});

test("atrasada", () => {
  assert.equal(atrasada({ estado: "pendiente", fechaLimite: "2026-10-30" }, "2026-10-31"), true);
  assert.equal(atrasada({ estado: "hecho", fechaLimite: "2026-10-30" }, "2026-10-31"), false);
  assert.equal(atrasada({ estado: "pendiente", fechaLimite: null }, "2026-10-31"), false);
});
