import assert from "node:assert/strict";
import test from "node:test";
import { contarFuentes, cuandoFue, estadoFuente, masNueva, pasaFiltro } from "./estado";

const AHORA = Date.parse("2026-11-19T15:00:00Z"); // 10:00 a. m. en Panamá

test("estado de una fuente: corriendo, error, nunca, atrasada y al día", () => {
  assert.equal(estadoFuente({ fecha: null, corriendo: true }, 26, AHORA), "corriendo");
  assert.equal(estadoFuente({ fecha: "2026-11-19T14:00:00Z", error: true }, 26, AHORA), "error");
  assert.equal(estadoFuente({ fecha: null }, 26, AHORA), "nunca");
  assert.equal(estadoFuente({ fecha: "2026-11-18T12:00:00Z" }, 26, AHORA), "atrasada");
  assert.equal(estadoFuente({ fecha: "2026-11-18T16:00:00Z" }, 26, AHORA), "aldia");
  // Sin plazo (un conteo de inventario) nunca se atrasa.
  assert.equal(estadoFuente({ fecha: "2026-01-01T00:00:00Z" }, null, AHORA), "aldia");
});

test("la fecha más nueva", () => {
  assert.equal(masNueva(null, "2026-11-18T10:00:00Z", undefined, "2026-11-19T01:00:00Z"), "2026-11-19T01:00:00Z");
  assert.equal(masNueva(null, "no es fecha"), null);
});

test("cuándo fue, en hora de Panamá", () => {
  assert.equal(cuandoFue("2026-11-19T13:12:00Z", AHORA), "Hoy 8:12 a. m.");
  // 1:00 a. m. UTC del 19 es el 18 a las 8:00 p. m. en Panamá: ayer.
  assert.equal(cuandoFue("2026-11-19T01:00:00Z", AHORA), "Ayer 8:00 p. m.");
  assert.equal(cuandoFue("2026-11-16T15:00:00Z", AHORA), "Hace 3 días");
  assert.match(cuandoFue("2026-11-02T15:00:00Z", AHORA), /^2 nov/);
  assert.equal(cuandoFue(null, AHORA), "Sin registro todavía");
});

test("tarjetas y filtros: las que no tienen registro no cuentan como atrasadas", () => {
  const f = [
    { estado: "aldia" as const, automatica: "Sola" },
    { estado: "corriendo" as const, automatica: null },
    { estado: "atrasada" as const, automatica: null },
    { estado: "nunca" as const, automatica: null },
    { estado: "error" as const, automatica: "Sola" },
  ];
  assert.deepEqual(contarFuentes(f), { total: 5, aldia: 2, atrasadas: 1, fallaron: 1, automaticas: 2 });
  assert.equal(f.filter((x) => pasaFiltro(x, "atrasadas")).length, 1);
  assert.equal(f.filter((x) => pasaFiltro(x, "todas")).length, 5);
});
