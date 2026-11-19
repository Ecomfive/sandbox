import assert from "node:assert/strict";
import test from "node:test";
import { formatoDuracion } from "./duracion";

test("la duración se escribe en minutos y segundos", () => {
  assert.equal(formatoDuracion(34), "0:34");
  assert.equal(formatoDuracion(65), "1:05");
  assert.equal(formatoDuracion(0), "0:00");
  assert.equal(formatoDuracion(33.6), "0:34");
});

test("lo que no es una duración válida no se escribe", () => {
  assert.equal(formatoDuracion(null), null);
  assert.equal(formatoDuracion(undefined), null);
  assert.equal(formatoDuracion(-3), null);
  assert.equal(formatoDuracion(Number.NaN), null);
});
