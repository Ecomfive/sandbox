import { test } from "node:test";
import assert from "node:assert/strict";
import { desdeTablaMensual, filasVisibles, marcaNegativo, totalFila, type FilaMensualAF4 } from "./tabla-financiera";

const M = ["2026-01-01", "2026-02-01"];
const v = (a: number, b: number) => ({ [M[0]]: a, [M[1]]: b });

test("desdeTablaMensual: secciones con detalle, saldos, subtotal y total final", () => {
  const filas: FilaMensualAF4[] = [
    { clave: "caja-inicial", etiqueta: "Caja inicial", tipo: "resultado", valores: v(100, 150), total: 100 },
    { clave: "operativo", etiqueta: "Operativo", tipo: "seccion", valores: v(50, -20) },
    { clave: "operativo-ventas", etiqueta: "Ventas", tipo: "detalle", valores: v(80, 10) },
    { clave: "neto", etiqueta: "Flujo neto", tipo: "resultado", valores: v(50, -20) },
    { clave: "diferencia-cambio", etiqueta: "Diferencia de cambio", tipo: "detalle", valores: v(0, 1) },
    { clave: "caja-final", etiqueta: "Caja final", tipo: "resultado", valores: v(150, 131), total: 131 },
  ];
  const r = desdeTablaMensual(filas, M, { saldos: ["caja-inicial"], totalFinal: "caja-final" });
  assert.deepEqual(
    r.map((f) => f.tipo),
    ["saldo", "seccion", "detalle", "subtotal", "detalle", "total"],
  );
  assert.equal(r[2].padre, "operativo");
  // La diferencia de cambio va después de un resultado: no depende de ninguna sección.
  assert.equal(r[4].padre, undefined);
  assert.deepEqual(r[1].valores, [50, -20]);
  assert.equal(totalFila(r[0]), 100);
  assert.equal(totalFila(r[3]), 30);
  assert.equal(totalFila(r[5]), 131);
  // Con todo cerrado se ve todo menos el detalle de la sección.
  assert.deepEqual(
    filasVisibles(r, new Set()).map((f) => f.clave),
    ["caja-inicial", "operativo", "neto", "diferencia-cambio", "caja-final"],
  );
});

test("desdeTablaMensual: grupos plegables (cuentas) con su negativo en rojo", () => {
  const filas: FilaMensualAF4[] = [
    { clave: "a-final", etiqueta: "Banco A", tipo: "grupo", valores: v(10, -5), total: -5 },
    { clave: "a-inicial", etiqueta: "Saldo inicial", tipo: "detalle", valores: v(0, 10), total: 0 },
  ];
  const plegable = desdeTablaMensual(filas, M, { gruposPlegables: true });
  assert.equal(plegable[0].tipo, "seccion");
  assert.equal(marcaNegativo(plegable[0]), true);
  assert.equal(plegable[1].padre, "a-final");
  const fijo = desdeTablaMensual(filas, M);
  assert.equal(fijo[0].tipo, "grupo");
  assert.equal(marcaNegativo(fijo[0]), false);
  assert.equal(fijo[1].padre, undefined);
  // Un mes que falta cuenta como cero.
  assert.deepEqual(desdeTablaMensual([{ clave: "x", etiqueta: "X", tipo: "seccion", valores: { [M[0]]: 3 } }], M)[0].valores, [3, 0]);
});
