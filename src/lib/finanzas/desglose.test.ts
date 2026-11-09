import { strict as assert } from "node:assert";
import { test } from "node:test";
import { desglosar, seccionesDeFila, signoVista, type MovimientoDesglose } from "./desglose";

const mov = (p: Partial<MovimientoDesglose>): MovimientoDesglose => ({
  id: "m1",
  periodo: "2026-03-01",
  fecha: null,
  unidad_id: "a",
  unidad: "Tienda A",
  clase: "tienda",
  entidad_id: "pa",
  tipo: "Sistemas",
  seccion: "administracion",
  signo: -1,
  descripcion: "Licencia",
  monto: 100,
  intercompania: false,
  ...p,
});

test("la clave de la fila dice qué secciones y qué tipo la forman", () => {
  assert.deepEqual(seccionesDeFila("costo_ventas"), { secciones: ["costo_ventas"], tipo: null, resultado: false });
  assert.deepEqual(seccionesDeFila("costo_ventas-Packaging"), { secciones: ["costo_ventas"], tipo: "Packaging", resultado: false });
  assert.equal(seccionesDeFila("margen-bruto")!.resultado, true);
  assert.equal(seccionesDeFila("ebitda-pct"), null);
});

test("el signo como en la tabla", () => {
  assert.equal(signoVista("administracion", -1, false), 1);
  assert.equal(signoVista("administracion", -1, true), -1);
  assert.equal(signoVista("ingresos", -1, false), -1);
});

test("directo de la tienda y su parte de A DISTRIBUIR, sin lo intercompañía", () => {
  const movs = [
    mov({ id: "d", monto: 100 }),
    mov({ id: "otra", unidad_id: "b", monto: 999 }),
    mov({ id: "r", unidad_id: "dist", clase: "reparto", monto: 200 }),
    mov({ id: "ic", monto: 50, intercompania: true }),
  ];
  const r = desglosar(movs, { unidadId: "a", participacion: () => 0.25, sinIntercompania: true, resultado: false });
  assert.deepEqual(r.lineas.map((l) => [l.id, l.aporte]), [["d", 100], ["r", 50]]);
  assert.equal(r.total, 150);
  const todo = desglosar(movs, { unidadId: null, participacion: () => 1, sinIntercompania: false, resultado: true });
  assert.equal(todo.total, -(100 + 999 + 200 + 50));
});
