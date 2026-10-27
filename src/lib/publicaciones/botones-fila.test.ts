import assert from "node:assert/strict";
import { test } from "node:test";
import { motivoApagar, motivoArchivar, motivoPausar, motivoPrivatizar, motivoRepublicar, type EstadoBotones } from "./botones-fila";

const base: EstadoBotones = {
  dropiId: "8406",
  archivada: false,
  sinPublicar: false,
  apagadoPendiente: false,
  duplicada: false,
  pausada: false,
  archivadaEnDropi: false,
  tipo: "publico",
  bodegaId: 81,
  stock: 40,
  privado: 0,
  stockPropio: true,
};

test("una pública activa con stock: todo se puede, menos pausar", () => {
  assert.equal(motivoRepublicar(base), null);
  assert.equal(motivoPrivatizar(base), null);
  assert.equal(motivoApagar(base), null);
  assert.equal(motivoArchivar(base), null);
  assert.equal(motivoPausar(base), "Todavía tiene stock");
});

test("sin stock se pausa y se sigue pudiendo archivar", () => {
  const e = { ...base, stock: 0, stockPropio: false };
  assert.equal(motivoPausar(e), null);
  assert.equal(motivoArchivar(e), null);
  assert.equal(motivoPrivatizar(e), "Sin stock en una bodega de ECOMFIVE");
  assert.equal(motivoPausar({ ...e, stock: null }), "Sin dato de stock en Dropi");
});

test("una pausada: el botón de pausa la reactiva y archivar dice por qué no", () => {
  const e = { ...base, archivada: true, pausada: true, stock: 0 };
  assert.equal(motivoPausar(e), null);
  assert.match(motivoArchivar(e)!, /pausada/);
  assert.equal(motivoRepublicar(e), "Está archivada");
});

test("duplicada, sin publicar o sin ID: lo dicen primero", () => {
  assert.match(motivoRepublicar({ ...base, duplicada: true })!, /duplicada/);
  assert.match(motivoArchivar({ ...base, duplicada: true })!, /duplicada/);
  assert.equal(motivoApagar({ ...base, sinPublicar: true }), "Todavía no está en Dropi");
  assert.equal(motivoPrivatizar({ ...base, dropiId: "" }), "Sin ID de Dropi");
});

test("privada y bodega B280", () => {
  assert.equal(motivoRepublicar({ ...base, tipo: "privado" }), "Una privada no se republica");
  assert.equal(motivoPrivatizar({ ...base, tipo: "privado" }), "Ya es privada");
  assert.match(motivoApagar({ ...base, bodegaId: 280 })!, /B280/);
  assert.equal(motivoApagar({ ...base, apagadoPendiente: true }), null, "con un apagado pendiente el botón lo deshace");
});
