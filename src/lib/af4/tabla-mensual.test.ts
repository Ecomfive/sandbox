import { test } from "node:test";
import assert from "node:assert/strict";
import { desdeTablaMensual } from "./tabla-mensual";
import { filasVisibles, seccionesConDetalle, totalFila } from "./tabla-financiera";

const meses = ["2026-01-01", "2026-02-01"];

test("desdeTablaMensual: grupos, detalle con su padre, resultado y saldo", () => {
  const filas = desdeTablaMensual(
    [
      { clave: "a", etiqueta: "Socio A · saldo", tipo: "grupo", valores: { "2026-01-01": 100, "2026-02-01": 150 }, total: 150 },
      { clave: "a-parte", etiqueta: "Parte", tipo: "detalle", valores: { "2026-01-01": 100, "2026-02-01": 50 } },
      { clave: "b", etiqueta: "Socio B · saldo", tipo: "grupo", valores: { "2026-02-01": 20 }, total: 20 },
      { clave: "b-parte", etiqueta: "Parte", tipo: "detalle", valores: { "2026-02-01": 20 } },
      { clave: "sin", etiqueta: "Sin atribuir", tipo: "resultado", valores: { "2026-01-01": -5 } },
      { clave: "caja", etiqueta: "Caja final", tipo: "resultado", valores: { "2026-01-01": 9 }, total: null },
    ],
    meses,
    { grupos: "seccion" },
  );
  assert.deepEqual(
    filas.map((f) => [f.clave, f.tipo, f.padre]),
    [
      ["a", "seccion", undefined],
      ["a-parte", "detalle", "a"],
      ["b", "seccion", undefined],
      ["b-parte", "detalle", "b"],
      ["sin", "subtotal", undefined],
      ["caja", "saldo", undefined],
    ],
  );
  // Un mes sin valor es cero, el total explícito se respeta y el saldo no se suma.
  assert.deepEqual(filas[2].valores, [0, 20]);
  assert.equal(totalFila(filas[0]), 150);
  assert.equal(totalFila(filas[1]), 150);
  assert.equal(totalFila(filas[4]), -5);
  assert.equal(totalFila(filas[5]), null);
  assert.deepEqual(seccionesConDetalle(filas), ["a", "b"]);
  assert.deepEqual(
    filasVisibles(filas, new Set(["b"])).map((f) => f.clave),
    ["a", "b", "b-parte", "sin", "caja"],
  );
});

test("desdeTablaMensual: por defecto un grupo sigue siendo grupo", () => {
  const filas = desdeTablaMensual([{ clave: "g", etiqueta: "Entradas", tipo: "grupo", valores: {} }], meses);
  assert.equal(filas[0].tipo, "grupo");
  assert.equal(filas[0].total, undefined);
});
