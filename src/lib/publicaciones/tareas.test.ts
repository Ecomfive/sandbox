import assert from "node:assert/strict";
import { test } from "node:test";
import { diaSiguiente, estadoTarea, normalizarTarea, ordenarTareas, tareasDe, type TareaVista } from "./tareas";

const HOY = "2026-10-28";
const t = (extra: Partial<TareaVista>): TareaVista => ({
  id: "1", origen: "manual", publicacionId: "p", titulo: "Verificar inventario", nota: null, responsableId: "yo", responsableNombre: "Yo",
  plazo: null, creadoPor: "yo", creadoEn: "2026-10-20T10:00:00Z", hechaEn: null, hechaPor: null, hechaNota: null, ...extra,
});

test("estado por la fecha: atrasada, hoy, próxima, sin fecha y hecha", () => {
  assert.equal(estadoTarea(t({ plazo: "2026-10-27" }), HOY), "atrasada");
  assert.equal(estadoTarea(t({ plazo: HOY }), HOY), "hoy");
  assert.equal(estadoTarea(t({ plazo: "2026-10-29" }), HOY), "proxima");
  assert.equal(estadoTarea(t({}), HOY), "sin_fecha");
  assert.equal(estadoTarea(t({ plazo: "2026-10-27", hechaEn: "2026-10-28T09:00:00Z" }), HOY), "hecha");
  assert.equal(diaSiguiente("2026-10-31"), "2026-11-01");
});

test("lo que llega del navegador se limpia: título obligatorio, fecha y responsable con forma válida", () => {
  assert.deepEqual(normalizarTarea({ titulo: "  " }), { error: "Escribe qué hay que hacer." });
  assert.deepEqual(normalizarTarea({ titulo: " Verificar   el inventario ", nota: "  ", responsableId: "nada", plazo: "mañana" }), { titulo: "Verificar el inventario", nota: null, responsableId: null, plazo: null });
  const id = "01a1762a-aa25-7b92-aec5-44512678bd04";
  assert.deepEqual(normalizarTarea({ titulo: "X", nota: "ver bodega", responsableId: id, plazo: "2026-10-29" }), { titulo: "X", nota: "ver bodega", responsableId: id, plazo: "2026-10-29" });
});

test("orden: atrasadas, hoy, próximas por fecha, sin fecha y al final las hechas", () => {
  const lista = ordenarTareas(
    [t({ id: "sin" }), t({ id: "hecha", hechaEn: "2026-10-28T01:00:00Z" }), t({ id: "prox2", plazo: "2026-11-05" }), t({ id: "prox1", plazo: "2026-10-30" }), t({ id: "hoy", plazo: HOY }), t({ id: "atr", plazo: "2026-10-01" })],
    HOY,
  );
  assert.deepEqual(lista.map((x) => x.id), ["atr", "hoy", "prox1", "prox2", "sin", "hecha"]);
});

test("cada persona ve las suyas (o las que creó sin responsable); con «todas», todas", () => {
  const lista = [t({ id: "mia" }), t({ id: "otra", responsableId: "nicole" }), t({ id: "creada", responsableId: null, creadoPor: "yo" }), t({ id: "ajena", responsableId: null, creadoPor: "nicole" })];
  assert.deepEqual(tareasDe(lista, "yo", false).map((x) => x.id), ["mia", "creada"]);
  assert.deepEqual(tareasDe(lista, "nicole", false).map((x) => x.id), ["otra", "ajena"]);
  assert.equal(tareasDe(lista, "yo", true).length, 4);
});

test("la fecha se dice en relación con hoy", async () => {
  const { cuandoTarea } = await import("./tareas");
  assert.equal(cuandoTarea("2026-10-28", HOY), "Hoy");
  assert.equal(cuandoTarea("2026-10-29", HOY), "Mañana");
  assert.equal(cuandoTarea("2026-10-27", HOY), "Ayer");
  assert.equal(cuandoTarea("2026-10-25", HOY), "Hace 3 días");
  assert.equal(cuandoTarea("2026-11-02", HOY), "En 5 días");
  assert.equal(cuandoTarea(null, HOY), "Sin fecha");
  assert.match(cuandoTarea("2026-11-20", HOY), /20 nov/);
});
