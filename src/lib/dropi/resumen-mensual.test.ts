import { test } from "node:test";
import assert from "node:assert/strict";
import { COMISION_B280, filasResumen, leerMeses, nombreEstado } from "./resumen-mensual";

// Septiembre 2026 como lo dejó la base (números de la billetera iguales al sheet de María José).
const sep = leerMeses([
  {
    periodo: "2026-09-01",
    filas: 10989,
    pedidos: 9446,
    cancelados: 1486,
    rechazados: 57,
    entregados: 6760,
    estados: { ENTREGADO: 6760, DEVOLUCION: 2302, NOVEDAD: 13, "EN PROCESO DE DEVOLUCION": 107, SINIESTRO: "3" },
    ganancia_entregados: "85431.02",
    ganancia_otros: 391.55,
    entregados_sin_pago: 0,
    ordenes_b280: 175,
    sin_bodega: 0,
    flete_garantia: 47.5,
    flete_recoleccion_garantia: 0,
    devolucion_garantia: 155.43,
    indemnizaciones: 20.92,
    otras_salidas_guia: 1241.88,
    otros_cobros_sin_guia: 0,
    pagos_ganancia: 89063.74,
    retiros: 94500,
    pagos_internacionales: 37408,
    transferencias_enviadas: 0,
    otras_entradas: 5034.92,
  },
]);

const valor = (etiqueta: string) => filasResumen(sep).find((f) => f.etiqueta === etiqueta)?.valores[0];

test("leerMeses: los numéricos que llegan como texto pasan a número", () => {
  assert.equal(sep[0].ganancia_entregados, 85431.02);
  assert.equal(sep[0].estados.SINIESTRO, 3);
});

test("filasResumen: totales, % de entrega y comisión como en el sheet", () => {
  assert.equal(valor("Pedidos del mes"), 9446);
  assert.equal(valor("% de entrega"), 6760 / 9446);
  assert.equal(valor("Ganancia total"), 85822.57);
  assert.equal(valor("Comisión B280 (fulfillment de Dropi)"), 175 * COMISION_B280);
  assert.equal(valor("Total compensación por garantía"), 1465.73);
  assert.equal(valor("Total salidas de Dropi (gasto)"), 1465.73);
  assert.equal(valor("Coste de productos entregados"), null);
});

test("filasResumen: los estados que pidió María José van primero, aunque no haya en el mes", () => {
  const estados = filasResumen(sep)
    .filter((f) => f.tipo === "detalle")
    .slice(0, 6)
    .map((f) => f.etiqueta);
  assert.deepEqual(estados, ["Entregado", "Devolución", "En reparto", "Novedad", "Siniestro", "En proceso de devolución"]);
  assert.equal(valor("En reparto"), 0);
});

test("filasResumen: sin pedidos, el % de entrega queda vacío", () => {
  const vacio = filasResumen(leerMeses([{ periodo: "2026-01-01", estados: {} }]));
  assert.equal(vacio.find((f) => f.etiqueta === "% de entrega")?.valores[0], null);
});

test("nombreEstado", () => {
  assert.equal(nombreEstado("TRANSITO A DEVOLUCION PROVEEDOR"), "Tránsito a devolución proveedor");
  assert.equal(nombreEstado("GUIA_GENERADA"), "Guía generada");
});
