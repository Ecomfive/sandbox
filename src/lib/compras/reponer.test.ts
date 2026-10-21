import assert from "node:assert/strict";
import test from "node:test";
import { resumirProductos, type ProductoDropi, type VentaDia } from "@/lib/publicaciones/ventas";
import { filasReponer, unidadesEnCamino } from "./reponer";

const CORTE = "2026-10-21";
const prod = (id: number, stock: number): ProductoDropi => ({ id, nombre: `Dropi ${id}`, lista: "activo", privado: false, variable: false, stock, primeraVenta: null, ultimaVenta: null });
const dia = (producto: number, pedidas: number): VentaDia => ({ producto, dia: CORTE, pedidas, ordenes: pedidas, canceladas: 0, rechazadas: 0, devueltas: 0 });
const SKU_A = { id: "a", codigo: "FIBER/GUMMIES", nombre: "Fiber Gummies" };

test("suma las publicaciones de un mismo SKU y descuenta lo que viene en camino", () => {
  // Dos publicaciones del mismo SKU: 60 + 30 netas en 30 días (3 por día) y 10 + 5 de stock (5 días).
  const resumen = resumirProductos([prod(1, 10), prod(2, 5)], [dia(1, 60), dia(2, 30)], CORTE);
  const camino = unidadesEnCamino([{ numero: "OC-0007", etapa: "tracking", etiquetaEtapa: "04 - Tracking", anulada: false, planificacion: "Noviembre", lineas: [{ codigo: "FIBER/GUMMIES", cantidad: 40 }] }]);
  const [f] = filasReponer(resumen, new Map([[1, SKU_A], [2, SKU_A]]), camino, 60);
  assert.deepEqual(f.dropiIds, [1, 2]);
  assert.equal(f.netas30, 90);
  assert.equal(f.stock, 15);
  assert.equal(f.diasInventario, 5);
  assert.equal(f.enCamino.unidades, 40);
  assert.equal(f.sugerido, 125); // 3 × 60 − 15 − 40
});

test("no sugiere nada si ya alcanza, y deja fuera lo que no se vende", () => {
  const resumen = resumirProductos([prod(1, 100), prod(2, 0), prod(3, 0)], [dia(1, 30), dia(2, 30)], CORTE);
  const filas = filasReponer(resumen, new Map(), new Map(), 60);
  // El 1 tiene stock para 100 días (no se repone); el 3 no se vende; queda el 2, sin vincular.
  assert.deepEqual(filas.map((f) => f.dropiIds), [[2]]);
  assert.equal(filas[0].sku, null);
  assert.equal(filas[0].sugerido, 60);
});

test("las compras anuladas, completadas o descartadas no cuentan como en camino", () => {
  const camino = unidadesEnCamino([
    { numero: "OC-1", etapa: "completado", etiquetaEtapa: "06", anulada: false, planificacion: null, lineas: [{ codigo: "X", cantidad: 5 }] },
    { numero: "OC-2", etapa: "produccion", etiquetaEtapa: "03", anulada: true, planificacion: null, lineas: [{ codigo: "X", cantidad: 5 }] },
    { numero: "OC-3", etapa: "cotizado", etiquetaEtapa: "02", anulada: false, planificacion: null, lineas: [{ codigo: "X", cantidad: 7 }] },
  ]);
  assert.equal(camino.get("X")?.unidades, 7);
});
