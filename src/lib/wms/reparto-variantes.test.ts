import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeErrorReparto, revisarReparto } from "./reparto-variantes";

const general = [
  { bodegaId: "b1", nombre: "Despacho", fisico: 30 },
  { bodegaId: "b2", nombre: "Oficina", fisico: 10 },
];

test("un reparto exacto por bodega está completo", () => {
  const r = revisarReparto(general, [
    { varianteId: "v1", bodegaId: "b1", cantidad: 18 },
    { varianteId: "v2", bodegaId: "b1", cantidad: 12 },
    { varianteId: "v1", bodegaId: "b2", cantidad: 10 },
    { varianteId: "v2", bodegaId: "b2", cantidad: 0 },
  ]);
  assert.equal(r.completo, true);
  assert.equal(r.error, null);
  assert.deepEqual(r.porBodega.map((b) => b.falta), [0, 0]);
});

test("dice cuánto falta o se pasó en cada bodega", () => {
  const falta = revisarReparto(general, [{ varianteId: "v1", bodegaId: "b1", cantidad: 20 }, { varianteId: "v1", bodegaId: "b2", cantidad: 10 }]);
  assert.equal(falta.completo, false);
  assert.equal(falta.error, "En Despacho faltan 10 por repartir.");
  const pasa = revisarReparto(general, [{ varianteId: "v1", bodegaId: "b1", cantidad: 30 }, { varianteId: "v1", bodegaId: "b2", cantidad: 12 }]);
  assert.equal(pasa.error, "En Oficina te pasaste por 2.");
  assert.deepEqual(pasa.porBodega.map((b) => b.falta), [0, -2]);
});

test("rechaza cantidades inválidas, bodegas sin stock general y saldos negativos", () => {
  assert.match(revisarReparto(general, [{ varianteId: "v1", bodegaId: "b1", cantidad: -1 }]).error ?? "", /enteros de 0 o más/);
  assert.match(revisarReparto(general, [{ varianteId: "v1", bodegaId: "b1", cantidad: 1.5 }]).error ?? "", /enteros de 0 o más/);
  assert.match(revisarReparto(general, [{ varianteId: "v1", bodegaId: "zz", cantidad: 3 }]).error ?? "", /no tiene stock general/);
  assert.match(revisarReparto([{ bodegaId: "b1", nombre: "Despacho", fisico: -4 }], []).error ?? "", /en negativo \(-4\)/);
});

test("sin stock general no hay nada que repartir y todo cuadra", () => {
  assert.equal(revisarReparto([], []).completo, true);
});

test("el motivo de la base se muestra solo si es de los que escribió para el equipo", () => {
  assert.equal(mensajeErrorReparto("En Despacho hay que repartir exactamente 30 unidades y se repartieron 20."), "En Despacho hay que repartir exactamente 30 unidades y se repartieron 20.");
  assert.equal(mensajeErrorReparto('relation "x" does not exist'), "No se pudo hacer el reparto.");
});
