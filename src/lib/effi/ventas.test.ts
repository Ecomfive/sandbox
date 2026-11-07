import assert from "node:assert/strict";
import { test } from "node:test";
import { ventanaVentas, ventasPorDia } from "./ventas";

const fila = (articulo: string, cantidad: string, fecha: string, extra: Record<string, unknown> = {}) => ({ articulo, cantidad, fecha_trans: fecha, vigente: "1", nombre_bodega: "Principal", ...extra });

test("junta remisiones y devoluciones por artículo y día", () => {
  const r = ventasPorDia(
    [fila("42", "2.000", "2026-11-07 08:30:22"), fila("42", "1.000", "2026-11-07 09:00:00"), fila("7", "1.000", "2026-11-06 23:59:00")],
    [fila("42", "1.000", "2026-11-07 10:00:00")],
  );
  assert.deepEqual(r, [
    { productoId: "7", dia: "2026-11-06", salidas: 1, devueltas: 0 },
    { productoId: "42", dia: "2026-11-07", salidas: 3, devueltas: 1 },
  ]);
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
    [],
  );
  assert.deepEqual(r, [{ productoId: "1", dia: "2026-11-07", salidas: 2, devueltas: 0 }]);
});

test("la ventana de lectura va en la hora de Costa Rica", () => {
  // 7 nov a las 03:00 UTC son las 21:00 del 6 nov en Costa Rica.
  assert.deepEqual(ventanaVentas(new Date("2026-11-07T03:00:00Z"), 10), { desde: "2026-10-27", hasta: "2026-11-06" });
});
