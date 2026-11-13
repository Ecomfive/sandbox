import assert from "node:assert/strict";
import { test } from "node:test";
import { ventanaVentas, ventasPorDia } from "./ventas";

const fila = (articulo: string, cantidad: string, fecha: string, extra: Record<string, unknown> = {}) => ({ id_remision_v: "100", articulo, cantidad, fecha_trans: fecha, vigente: "1", nombre_bodega: "Principal", ...extra });

test("junta las remisiones por artículo y día, y cada devolución resta en el día de su remisión", () => {
  const r = ventasPorDia(
    [fila("42", "2.000", "2026-11-07 08:30:22", { id_remision_v: "500" }), fila("42", "1.000", "2026-11-07 09:00:00", { id_remision_v: "501" }), fila("7", "1.000", "2026-11-06 23:59:00", { id_remision_v: "499" })],
    // La devolución de la remisión 500 se hizo semanas después: cuenta el 7 de noviembre, no el día en que se hizo.
    [fila("42", "1.000", "2026-11-28 10:00:00", { id_remision_v: "500" })],
  );
  assert.deepEqual(r, [
    { productoId: "7", dia: "2026-11-06", salidas: 1, devueltas: 0 },
    { productoId: "42", dia: "2026-11-07", salidas: 3, devueltas: 1 },
  ]);
});

test("una devolución de una remisión que no está entre las leídas (de antes de la ventana) no cuenta", () => {
  const r = ventasPorDia([fila("42", "3", "2026-11-07", { id_remision_v: "500" })], [fila("42", "5", "2026-11-08", { id_remision_v: "12" }), fila("42", "1", "2026-11-08", { id_remision_v: "" })]);
  assert.deepEqual(r, [{ productoId: "42", dia: "2026-11-07", salidas: 3, devueltas: 0 }]);
});

test("no cuenta lo anulado, lo de bodegas de dropshippers ni lo que viene incompleto", () => {
  const r = ventasPorDia(
    [
      fila("1", "5", "2026-11-07", { vigente: "0" }),
      fila("1", "5", "2026-11-07", { nombre_bodega: "Saint Digital" }),
      fila("1", "5", "2026-11-07", { nombre_bodega: null }),
      fila("", "5", "2026-11-07"),
      fila("1", "0", "2026-11-07"),
      fila("1", "abc", "2026-11-07"),
      fila("1", "5", "ayer"),
      fila("1", "2", "2026-11-07", { nombre_bodega: " PRINCIPAL " }),
    ],
    [fila("1", "1", "2026-11-09", { vigente: "0" }), fila("1", "1", "2026-11-09", { nombre_bodega: "Saint Digital" })],
  );
  assert.deepEqual(r, [{ productoId: "1", dia: "2026-11-07", salidas: 2, devueltas: 0 }]);
});

test("la ventana de lectura va en la hora de Costa Rica", () => {
  // 7 nov a las 03:00 UTC son las 21:00 del 6 nov en Costa Rica.
  assert.deepEqual(ventanaVentas(new Date("2026-11-07T03:00:00Z"), 10), { desde: "2026-10-27", hasta: "2026-11-06" });
});

test("la remisión de una devolución sale de su cabecera (el detalle de Effi no la trae)", () => {
  const r = ventasPorDia(
    [fila("42", "3", "2026-10-20 09:00:00", { id_remision_v: "14414" })],
    [fila("42", "2", "2026-11-11 10:52:30", { id_remision_v: undefined, id_devolucion_v: "5330" })],
    // Así viene de Effi: la cabecera trae el número como «id».
    [{ id: "5330", id_remision_v: "14414" }],
  );
  assert.deepEqual(r, [{ productoId: "42", dia: "2026-10-20", salidas: 3, devueltas: 2 }]);
});
