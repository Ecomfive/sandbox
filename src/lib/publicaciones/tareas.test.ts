import assert from "node:assert/strict";
import { test } from "node:test";
import { cuandoTarea, diaSiguiente, iniciales, normalizarCambio, normalizarTarea, ordenarTareas, pendiente, tareasDe, vencimiento, type TareaVista } from "./tareas";

const HOY = "2026-10-28";
const ID = "01a1762a-aa25-7b92-aec5-44512678bd04";
const t = (extra: Partial<TareaVista>): TareaVista => ({
  id: "1", origen: "manual", publicacionId: "p", titulo: "Verificar inventario", nota: null, estado: "por_hacer", prioridad: null, responsableId: "yo", responsableNombre: "Yo",
  plazo: null, creadoPor: "yo", creadoPorNombre: "Yo", creadoEn: "2026-10-20T10:00:00Z", hechaEn: null, hechaPor: null, hechaNota: null, archivadaEn: null, ...extra,
});

test("vencimiento por la fecha: atrasada, hoy, próxima y sin fecha; una hecha no vence", () => {
  assert.equal(vencimiento(t({ plazo: "2026-10-27" }), HOY), "atrasada");
  assert.equal(vencimiento(t({ plazo: HOY }), HOY), "hoy");
  assert.equal(vencimiento(t({ plazo: "2026-10-29" }), HOY), "proxima");
  assert.equal(vencimiento(t({}), HOY), "sin_fecha");
  assert.equal(vencimiento(t({ plazo: "2026-10-27", estado: "hecha" }), HOY), null);
  assert.equal(diaSiguiente("2026-10-31"), "2026-11-01");
  assert.equal(pendiente(t({})), true);
  assert.equal(pendiente(t({ estado: "hecha" })), false);
  assert.equal(pendiente(t({ archivadaEn: "2026-10-28T00:00:00Z" })), false);
});

test("crear: título obligatorio; estado, prioridad, fecha y responsable con forma válida", () => {
  assert.deepEqual(normalizarTarea({ titulo: "  " }), { error: "Escribe qué hay que hacer." });
  assert.deepEqual(normalizarTarea({ titulo: " Verificar   el inventario ", nota: "  ", responsableId: "nada", plazo: "mañana", estado: "otro", prioridad: "x" }), {
    titulo: "Verificar el inventario", nota: null, estado: "por_hacer", prioridad: null, responsableId: null, plazo: null,
  });
  assert.deepEqual(normalizarTarea({ titulo: "X", nota: "ver bodega", responsableId: ID, plazo: "2026-10-29", estado: "en_curso", prioridad: "alta" }), {
    titulo: "X", nota: "ver bodega", estado: "en_curso", prioridad: "alta", responsableId: ID, plazo: "2026-10-29",
  });
});

test("cambiar: solo viaja lo que cambió; null borra fecha y prioridad; lo inválido se rechaza", () => {
  assert.deepEqual(normalizarCambio({ estado: "en_revision" }), { estado: "en_revision" });
  assert.deepEqual(normalizarCambio({ plazo: null, prioridad: null }), { plazo: null, prioridad: null });
  assert.deepEqual(normalizarCambio({ nota: "   " }), { nota: null });
  assert.deepEqual(normalizarCambio({ archivar: true, publicacionId: ID }), { archivar: true, publicacionId: ID });
  assert.ok("error" in normalizarCambio({ estado: "terminada" }));
  assert.ok("error" in normalizarCambio({ titulo: "" }));
  assert.ok("error" in normalizarCambio({ plazo: "29/10" }));
  assert.ok("error" in normalizarCambio({ publicacionId: "x" }));
  assert.ok("error" in normalizarCambio({}));
});

test("orden: por estado (Por hacer, En curso, En revisión, Hecha); dentro, por fecha (sin fecha al final) y prioridad", () => {
  const lista = ordenarTareas([
    t({ id: "hecha", estado: "hecha", hechaEn: "2026-10-28T01:00:00Z" }),
    t({ id: "curso", estado: "en_curso", plazo: "2026-10-30" }),
    t({ id: "sin" }),
    t({ id: "prox", plazo: "2026-11-05" }),
    t({ id: "atr-baja", plazo: "2026-10-01", prioridad: "baja" }),
    t({ id: "atr-urg", plazo: "2026-10-01", prioridad: "urgente" }),
    t({ id: "rev", estado: "en_revision" }),
  ]);
  assert.deepEqual(lista.map((x) => x.id), ["atr-urg", "atr-baja", "prox", "sin", "curso", "rev", "hecha"]);
});

test("cada persona ve las suyas (o las que creó sin responsable); con «todas», todas", () => {
  const lista = [t({ id: "mia" }), t({ id: "otra", responsableId: "nicole" }), t({ id: "creada", responsableId: null, creadoPor: "yo" }), t({ id: "ajena", responsableId: null, creadoPor: "nicole" })];
  assert.deepEqual(tareasDe(lista, "yo", false).map((x) => x.id), ["mia", "creada"]);
  assert.deepEqual(tareasDe(lista, "nicole", false).map((x) => x.id), ["otra", "ajena"]);
  assert.equal(tareasDe(lista, "yo", true).length, 4);
});

test("la fecha se dice en relación con hoy y las iniciales de una persona", () => {
  assert.equal(cuandoTarea("2026-10-28", HOY), "Hoy");
  assert.equal(cuandoTarea("2026-10-29", HOY), "Mañana");
  assert.equal(cuandoTarea("2026-10-27", HOY), "Ayer");
  assert.equal(cuandoTarea("2026-10-25", HOY), "Hace 3 días");
  assert.equal(cuandoTarea("2026-11-02", HOY), "En 5 días");
  assert.equal(cuandoTarea(null, HOY), "Sin fecha");
  assert.match(cuandoTarea("2026-11-20", HOY), /20 nov/);
  assert.equal(iniciales("Nicole Pérez Gómez"), "NG");
  assert.equal(iniciales("alcides"), "A");
  assert.equal(iniciales(null), "?");
});
