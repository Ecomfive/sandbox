import assert from "node:assert/strict";
import { test } from "node:test";
import { diasSinStock, sinCompraUrgente } from "./sin-stock";

const ahora = new Date("2026-11-06T12:00:00Z");
const base = { estado: "abierta", detectadaEn: "2026-11-01T12:00:00Z", enCamino: 0, cotizando: 0, decision: null };

test("días sin stock", () => assert.equal(diasSinStock(base.detectadaEn, ahora), 5));
test("sin nada en camino tras 3 días es urgente", () => assert.equal(sinCompraUrgente(base, ahora), true));
test("con algo en camino o cotizando no", () => {
  assert.equal(sinCompraUrgente({ ...base, enCamino: 10 }, ahora), false);
  assert.equal(sinCompraUrgente({ ...base, cotizando: 5 }, ahora), false);
});
test("recién detectada, cerrada o decidida no", () => {
  assert.equal(sinCompraUrgente({ ...base, detectadaEn: "2026-11-05T12:00:00Z" }, ahora), false);
  assert.equal(sinCompraUrgente({ ...base, estado: "cerrada" }, ahora), false);
  assert.equal(sinCompraUrgente({ ...base, decision: "no_reponer" }, ahora), false);
  assert.equal(sinCompraUrgente({ ...base, decision: "comprar" }, ahora), true);
});
