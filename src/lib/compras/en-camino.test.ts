import assert from "node:assert/strict";
import { test } from "node:test";
import { enCaminoPorPais, lineaEnCamino, type LineaEnCamino } from "./en-camino";

const l = (extra: Partial<LineaEnCamino>): LineaEnCamino => ({ pais: "Panamá", unidades: 100, etapa: "tracking", fechaEnvio: "2026-10-01", fechaLlegada: null, anulada: false, ...extra });

test("en camino: abierta, con fecha de envío y sin llegada", () => {
  assert.equal(lineaEnCamino(l({})), true);
  assert.equal(lineaEnCamino(l({ fechaEnvio: null })), false); // todavía no salió
  assert.equal(lineaEnCamino(l({ fechaLlegada: "2026-10-20" })), false); // ya llegó
  assert.equal(lineaEnCamino(l({ etapa: "completado" })), false);
  assert.equal(lineaEnCamino(l({ etapa: "descartado" })), false);
  assert.equal(lineaEnCamino(l({ anulada: true })), false);
});

test("suma las unidades por país, el que más trae primero, y cuenta las compras", () => {
  const r = enCaminoPorPais([l({ unidades: 300 }), l({ unidades: 200, pais: "México" }), l({ unidades: 400, pais: "México" }), l({ unidades: 50, etapa: "arribo_mercancia" }), l({ unidades: 999, fechaEnvio: null })]);
  assert.deepEqual(r, [
    { pais: "México", unidades: 600, compras: 2 },
    { pais: "Panamá", unidades: 350, compras: 2 },
  ]);
});

test("sin nada en camino, lista vacía; una línea sin país va a «—»; las cantidades en cero no cuentan", () => {
  assert.deepEqual(enCaminoPorPais([]), []);
  assert.deepEqual(enCaminoPorPais([l({ fechaEnvio: null })]), []);
  assert.deepEqual(enCaminoPorPais([l({ pais: null, unidades: 10 }), l({ unidades: 0 })]), [{ pais: "—", unidades: 10, compras: 1 }]);
});
