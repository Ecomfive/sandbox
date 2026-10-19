import assert from "node:assert/strict";
import { test } from "node:test";
import { resumir, tiempoPorEtapa } from "./tiempo-etapas";

const ev = (compraId: string, valor: string, ocurridoEn: string) => ({ compraId, campo: "etapa", valor, ocurridoEn });

test("resumen: mediana, promedio, 9 de cada 10 y máximo", () => {
  assert.deepEqual(resumir([1, 2, 3, 4, 10]), { n: 5, mediana: 3, promedio: 4, p90: 10, max: 10 });
  assert.equal(resumir([]).mediana, null);
});

test("estancias cerradas y la etapa en que está hoy", () => {
  const compras = [
    { id: "a", etapa: "tracking" },
    { id: "b", etapa: "completado" },
  ];
  const eventos = [
    ev("a", "cotizar", "2026-09-01T10:00:00Z"),
    ev("a", "cotizar", "2026-09-02T10:00:00Z"), // repetido: la misma estancia
    ev("a", "produccion", "2026-09-05T10:00:00Z"),
    ev("a", "tracking", "2026-09-25T10:00:00Z"),
    ev("b", "cotizar", "2026-08-01T10:00:00Z"),
    ev("b", "produccion", "2026-08-11T10:00:00Z"),
    ev("b", "completado", "2026-09-01T10:00:00Z"),
    { compraId: "b", campo: "estado", valor: "pendiente", ocurridoEn: "2026-08-01" }, // otro campo: no cuenta
  ];
  const r = tiempoPorEtapa(eventos, compras, ["cotizar", "produccion", "tracking", "completado"], "2026-10-05");
  const de = (e: string) => r.find((x) => x.etapa === e)!;
  assert.deepEqual(de("cotizar").pasadas, { n: 2, mediana: 7, promedio: 7, p90: 10, max: 10 });
  assert.equal(de("produccion").pasadas.n, 2);
  assert.equal(de("tracking").pasadas.n, 0);
  assert.deepEqual(de("tracking").ahora.map((x) => [x.compra.id, x.dias]), [["a", 10]]);
  // La etapa final abierta de una compra cerrada no se cuenta como «ahora» de otra etapa.
  assert.deepEqual(de("completado").ahora.map((x) => x.compra.id), ["b"]);
});

test("volver a una etapa es otra estancia", () => {
  const r = tiempoPorEtapa(
    [ev("a", "cotizar", "2026-09-01"), ev("a", "cotizado", "2026-09-03"), ev("a", "cotizar", "2026-09-04"), ev("a", "produccion", "2026-09-10")],
    [{ id: "a", etapa: "produccion" }],
    ["cotizar"],
    "2026-09-20",
  );
  assert.deepEqual(r[0].pasadas, { n: 2, mediana: 4, promedio: 4, p90: 6, max: 6 });
});
