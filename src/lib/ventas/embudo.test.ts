import test from "node:test";
import assert from "node:assert/strict";
import { embudo, csvEmbudo } from "./embudo";

const h = (n: number) => new Date(Date.UTC(2026, 10, 1, n)).toISOString();

test("embudo: conversión y horas entre fases", () => {
  const ords = [{ id: "a", creado_en: h(0) }, { id: "b", creado_en: h(0) }, { id: "c", creado_en: h(0) }];
  const ev = [
    { orden_id: "a", fase_despues: "confirmada", creado_en: h(2) },
    { orden_id: "b", fase_despues: "confirmada", creado_en: h(4) },
    { orden_id: "a", fase_despues: "despachada", creado_en: h(12) },
    { orden_id: "a", fase_despues: "entregada", creado_en: h(36) },
    { orden_id: "c", fase_despues: "cancelada", creado_en: h(1) },
  ];
  const r = embudo(ords, ev);
  assert.deepEqual(r.etapas.map((e) => e.ordenes), [3, 2, 1, 1]);
  assert.equal(r.etapas[1].conversion, 66.7);
  assert.equal(r.etapas[1].horasPromedio, 3);
  assert.equal(r.etapas[2].conversion, 50);
  assert.equal(r.salidas.find((s) => s.fase === "cancelada")?.ordenes, 1);
});

test("embudo: la primera entrada a una fase manda y el CSV trae todo", () => {
  const r = embudo([{ id: "a", creado_en: h(0) }], [
    { orden_id: "a", fase_despues: "confirmada", creado_en: h(5) },
    { orden_id: "a", fase_despues: "confirmada", creado_en: h(1) },
  ]);
  assert.equal(r.etapas[1].horasPromedio, 1);
  assert.match(csvEmbudo(r), /^﻿Fase,Órdenes/);
});
