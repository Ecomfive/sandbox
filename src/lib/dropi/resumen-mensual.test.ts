import { test } from "node:test";
import assert from "node:assert/strict";
import { COMISION_B280, armarVista, elegirVista, filasResumen, leerMeses, mesAnterior, mesesEntre, nombreEstado, totalDeMeses } from "./resumen-mensual";

const base = { filas: 0, pedidos: 0, cancelados: 0, rechazados: 0, entregados: 0, estados: {}, ganancia_entregados: 0, ganancia_otros: 0, entregados_sin_pago: 0, ordenes_b280: 0, sin_bodega: 0, flete_garantia: 0, flete_recoleccion_garantia: 0, devolucion_garantia: 0, indemnizaciones: 0, otras_salidas_guia: 0, otros_cobros_sin_guia: 0, pagos_ganancia: 0, retiros: 0, pagos_internacionales: 0, transferencias_enviadas: 0, otras_entradas: 0 };
const ago = leerMeses([{ ...base, periodo: "2026-08-01", pedidos: 100, entregados: 70, filas: 120, estados: { ENTREGADO: 70, DEVOLUCION: 30 }, ganancia_entregados: 1000 }])[0];
const sep2 = leerMeses([{ ...base, periodo: "2026-09-01", pedidos: 200, entregados: 160, filas: 230, estados: { ENTREGADO: 160, NOVEDAD: 40 }, ganancia_entregados: 1500.5 }])[0];

test("mesAnterior y mesesEntre cruzan el año", () => {
  assert.equal(mesAnterior("2027-01-01"), "2026-12-01");
  assert.deepEqual(mesesEntre("2026-11-01", "2027-02-01"), ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
});

test("elegirVista: sin nada, el año en curso y el último mes cerrado", () => {
  const v = elegirVista({}, "2026-03-01", "2026-11-01");
  assert.deepEqual(v.anios, ["2026"]);
  assert.equal(v.mes, "2026-10-01");
  assert.equal(v.mesesAnio.length, 9);
});

test("elegirVista: en enero de 2027 sale 2027 con su mes en curso, y 2026 se puede ver entero", () => {
  const v = elegirVista({}, "2026-03-01", "2027-01-01");
  assert.deepEqual(v.anios, ["2027", "2026"]);
  assert.equal(v.mes, "2027-01-01");
  const t = elegirVista({ anio: "2026", mes: "todo" }, "2026-03-01", "2027-01-01");
  assert.equal(t.mes, null);
  assert.equal(t.mesesAnio.at(-1), "2026-12-01");
});

test("elegirVista: un mes fuera de los datos no se acepta", () => {
  assert.equal(elegirVista({ mes: "2025-05-01" }, "2026-03-01", "2026-11-01").mes, "2026-10-01");
  assert.equal(elegirVista({ mes: "2026-05-01" }, "2026-03-01", "2026-11-01").mes, "2026-05-01");
});

test("totalDeMeses y todo el año: suma, y el % de entrega sale de las sumas", () => {
  const t = totalDeMeses([ago, sep2]);
  assert.equal(t.pedidos, 300);
  assert.equal(t.estados.ENTREGADO, 230);
  const v = armarVista([ago, sep2], { anios: ["2026"], anio: "2026", mesesAnio: ["2026-08-01", "2026-09-01"], mes: null }, "2026-11-01");
  assert.equal(v.columnas.at(-1)?.titulo, "Total 2026");
  assert.equal(v.filas.find((f) => f.etiqueta === "% de entrega")?.valores[2], 230 / 300);
});

test("armarVista: un mes con el anterior y la diferencia", () => {
  const v = armarVista([ago, sep2], { anios: ["2026"], anio: "2026", mesesAnio: [], mes: "2026-09-01" }, "2026-11-01");
  assert.equal(v.columnas.length, 3);
  assert.equal(v.columnas[1].nota, "mes anterior");
  assert.deepEqual(v.filas.find((f) => f.etiqueta === "Pedidos del mes")?.valores, [200, 100, 100]);
  assert.deepEqual(v.filas.find((f) => f.etiqueta === "Ganancia de entregados")?.valores, [1500.5, 1000, 500.5]);
  assert.equal(v.filas.find((f) => f.etiqueta === "% de entrega")?.valores[2], 0.8 - 0.7);
});

test("armarVista: el primer mes con datos va solo", () => {
  const v = armarVista([ago], { anios: ["2026"], anio: "2026", mesesAnio: [], mes: "2026-08-01" }, "2026-11-01");
  assert.equal(v.columnas.length, 1);
});

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
