import { test } from "node:test";
import assert from "node:assert/strict";
import { claveFecha, masReciente } from "./cambio-precio";

test("claveFecha pasa la hora UTC al día de Panamá y una fecha sin hora al empezar el día", () => {
  // 01:08 UTC del 30 es el 29 a las 20:08 en Panamá.
  assert.equal(claveFecha("2026-10-30T01:08:35.075+00:00"), "2026-10-29T20:08:35");
  assert.equal(claveFecha("2026-10-29"), "2026-10-29T00:00:00");
});

test("masReciente elige el último cambio, con el mismo día gana el que tiene hora", () => {
  const catalogo = { fecha: "2026-10-23T20:02:15.731+00:00", despues: 4.99 };
  const sistema = { fecha: "2026-10-29T04:16:19.728+00:00", despues: 5.29 };
  const anotado = { fecha: "2026-10-28", despues: null };
  assert.equal(masReciente([catalogo, sistema, anotado]), sistema);
  assert.equal(masReciente([catalogo, null, undefined]), catalogo);
  assert.equal(masReciente([null, undefined]), null);
  // El 28 de Panamá con hora le gana a la fecha sin hora del 28.
  const mismoDia = { fecha: "2026-10-28T15:00:00Z", despues: 3 };
  assert.equal(masReciente([anotado, mismoDia]), mismoDia);
  // La fecha anotada más nueva gana (al actualizar desde Dropi, sin montos).
  assert.equal(masReciente([sistema, { fecha: "2026-10-30", despues: null }])?.fecha, "2026-10-30");
});
