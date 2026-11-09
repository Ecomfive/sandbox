import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseSimulador,
  curvaPrecio,
  derivados,
  efectoTasa,
  equilibrioTienda,
  filaUE,
  filaVista,
  leerSupuestosUE,
  precioMinimo,
  rankingDestruyen,
  separarDestruyen,
  recomendar,
  roasMargenCampana,
  objetivoDe,
  simularPrecio,
  sumarFilasUE,
  SUPUESTOS_UE_PREDETERMINADOS,
  validarSupuestosUE,
  type FilaUE,
} from "./unidad-economica";

const TIENDA = "00000000-0000-4000-8000-000000000001";

// Datos inventados.
const fila = (p: Partial<FilaUE>): FilaUE => ({ ...filaUE({}), clave: "X", etiqueta: "X", meses: 1, ...p });

test("supuestos: completa con los predeterminados y descarta lo fuera de rango", () => {
  const s = leerSupuestosUE({ envio_por_orden: "4,5", perdida_devolucion_pct: 300, comision_pct: { tarjeta: 5 }, fijos_por_tienda: { [TIENDA]: 900, malo: 3 } });
  assert.equal(s.envioPorOrden, 4.5);
  assert.equal(s.perdidaDevolucionPct, SUPUESTOS_UE_PREDETERMINADOS.perdidaDevolucionPct);
  assert.equal(s.comisionPct.tarjeta, 5);
  assert.equal(s.comisionPct.yappy, SUPUESTOS_UE_PREDETERMINADOS.comisionPct.yappy);
  assert.deepEqual(s.fijosPorTienda, { [TIENDA]: 900 });
  assert.deepEqual(leerSupuestosUE(null), SUPUESTOS_UE_PREDETERMINADOS);
});

test("validar supuestos: rechaza lo que no se puede guardar", () => {
  const ok = validarSupuestosUE({ envioPorOrden: 3, envioVueltaFactor: 1, perdidaDevolucionPct: 20, margenObjetivoPct: 10, comisionPct: { tarjeta: "3.5" }, fijosPorTienda: { [TIENDA]: "1200", otra: "" } }, [TIENDA]);
  assert.ok("valor" in ok);
  if ("valor" in ok) {
    assert.equal(ok.supuestos.comisionPct.tarjeta, 3.5);
    assert.equal(ok.supuestos.fijosPorTienda[TIENDA], 1200);
  }
  assert.ok("error" in validarSupuestosUE({ envioPorOrden: -1, envioVueltaFactor: 1, perdidaDevolucionPct: 0, margenObjetivoPct: 0 }, []));
  assert.ok("error" in validarSupuestosUE({ envioPorOrden: 1, envioVueltaFactor: 1, perdidaDevolucionPct: 0, margenObjetivoPct: 0, fijosPorTienda: { [TIENDA]: 5 } }, []));
});

const PRODUCTO = fila({
  ordenes: 10, enviadas: 10, entregadas: 8, devueltas: 2, unidadesEntregadas: 8,
  ventas: 400, mercancia: 120, envio: 40, envioDevueltas: 8, devolucion: 10, comision: 8, marketing: 60, margen: 162,
});

test("derivados: tasa, margen, costo por devolución", () => {
  const d = derivados(PRODUCTO);
  assert.equal(d.tasaEntrega, 0.8);
  assert.equal(d.margenPct, 40.5);
  assert.equal(d.contribucion, 222);
  assert.equal(d.costoPorDevolucion, 9);
  assert.equal(d.precioUnidad, 50);
});

test("efecto de la tasa de entrega en el margen", () => {
  // Cada devuelta que pasa a entregada: (400 − 120 − 8) / 8 = 34 + 10/2 = 5 → 39; 0.1 × 10 × 39 = 39.
  assert.equal(Math.round(efectoTasa(PRODUCTO, 0.9)! * 100) / 100, 39);
  assert.ok(efectoTasa(PRODUCTO, 0.7)! < 0);
  assert.equal(efectoTasa(fila({}), 0.9), null);
});

test("precio mínimo para el margen objetivo", () => {
  // C = (120 + 40 + 10 + 60) / 8 = 28.75; c = 0.02; m = 0.15 → 28.75 / 0.83.
  assert.equal(Math.round(precioMinimo(PRODUCTO, 15)! * 100) / 100, 34.64);
  assert.equal(precioMinimo(PRODUCTO, 99), null);
  assert.equal(precioMinimo(fila({}), 15), null);
});

test("recomendación: mantener, subir precio, revisar envío, retirar", () => {
  assert.equal(recomendar(PRODUCTO, { margenObjetivoPct: 15 }, 0.8).accion, "mantener");
  const flojo = fila({ ...PRODUCTO, margen: 20, marketing: 202 }); // 5 %
  const r = recomendar(flojo, { margenObjetivoPct: 15 }, 0.8);
  assert.equal(r.accion, "subir_precio");
  assert.ok(r.monto! > 0);
  const malaEntrega = fila({ ordenes: 10, enviadas: 10, entregadas: 4, devueltas: 6, unidadesEntregadas: 4, ventas: 200, mercancia: 40, envio: 40, devolucion: 30, comision: 0, marketing: 100, margen: -10 });
  assert.equal(recomendar(malaEntrega, { margenObjetivoPct: 15 }, 0.85).accion, "revisar_envio");
  const ruina = fila({ ordenes: 5, enviadas: 5, entregadas: 5, unidadesEntregadas: 5, ventas: 50, mercancia: 60, envio: 20, margen: -30 });
  const rr = recomendar(ruina, { margenObjetivoPct: 15 }, 0.8);
  assert.equal(rr.accion, "retirar");
  assert.equal(rr.monto, 30);
});

test("ranking de los que destruyen margen", () => {
  const a = fila({ clave: "A", enviadas: 1, ventas: 100, margen: -5 });
  const b = fila({ clave: "B", enviadas: 1, ventas: 100, margen: 50 });
  const c = fila({ clave: "C", enviadas: 1, ventas: 100, margen: 5 });
  const d = fila({ clave: "D", enviadas: 0, margen: -100 });
  assert.deepEqual(rankingDestruyen([a, b, c, d], 15).map((f) => f.clave), ["A", "C"]);
});

test("destruyen margen: separa los enviados sin entregas de los que pierden con entregas", () => {
  const sinEntrega = fila({ clave: "S", enviadas: 3, devueltas: 3, entregadas: 0, ventas: 0, margen: -12 });
  const pierde = fila({ clave: "P", enviadas: 4, entregadas: 4, unidadesEntregadas: 4, ventas: 80, margen: -6 });
  const bajo = fila({ clave: "B", enviadas: 2, entregadas: 2, unidadesEntregadas: 2, ventas: 100, margen: 5 });
  const bien = fila({ clave: "OK", enviadas: 2, entregadas: 2, unidadesEntregadas: 2, ventas: 100, margen: 40 });
  const r = separarDestruyen([sinEntrega, pierde, bajo, bien], 15);
  assert.deepEqual(r.sinEntregas.map((f) => f.clave), ["S"]);
  assert.deepEqual(r.conEntregas.map((f) => f.clave), ["P", "B"]);
});

test("simulador de precio con y sin elasticidad", () => {
  const b = baseSimulador(PRODUCTO)!;
  assert.equal(b.precio, 50);
  const igual = simularPrecio(b, 0);
  assert.equal(Math.round(igual.utilidad), 162);
  const sube = simularPrecio(b, 5);
  // Sin elasticidad: 8 unidades × 5 × 0.98 = 39.2 más.
  assert.equal(Math.round(sube.diferencia * 10) / 10, 39.2);
  const elastico = simularPrecio(b, 5, -2);
  assert.equal(Math.round(elastico.unidades * 100) / 100, 6.4);
  assert.ok(elastico.diferencia < sube.diferencia);
  assert.equal(curvaPrecio(b, 10, 0, 4).length, 5);
  assert.equal(baseSimulador(fila({})), null);
});

test("equilibrio por tienda y recomendación", () => {
  const t = fila({ clave: TIENDA, ordenes: 300, ventas: 9000, margen: 1500, meses: 3 });
  const e = equilibrioTienda(t, 800, { fijosPorTienda: {}, margenObjetivoPct: 15 });
  assert.equal(e.ordenesMes, 100);
  assert.equal(e.margenPorOrden, 5);
  assert.equal(e.ordenesEquilibrio, 160);
  assert.equal(e.despuesDeFijos, -300);
  assert.equal(e.accion, "mantener");
  const conSupuesto = equilibrioTienda(t, 800, { fijosPorTienda: { [TIENDA]: 200 }, margenObjetivoPct: 15 });
  assert.equal(conSupuesto.fijosOrigen, "supuesto");
  assert.equal(conSupuesto.accion, "escalar");
  const pierde = equilibrioTienda(fila({ clave: TIENDA, ordenes: 10, ventas: 100, margen: -20 }), 0, { fijosPorTienda: {}, margenObjetivoPct: 15 });
  assert.equal(pierde.accion, "cerrar");
  assert.equal(pierde.ordenesEquilibrio, null);
});

test("ROAS de margen de una campaña", () => {
  const o = objetivoDe(PRODUCTO); // tasa 0.8, contribución por entregada 222/8 = 27.75
  assert.equal(roasMargenCampana(100, 10, o), (10 * 0.8 * 27.75) / 100);
  assert.equal(roasMargenCampana(0, 10, o), null);
  assert.equal(roasMargenCampana(10, 1, objetivoDe(undefined)), null);
});

test("sumar filas", () => {
  const t = sumarFilasUE([PRODUCTO, fila({ ordenes: 2, margen: -3, meses: 2 })]);
  assert.equal(t.ordenes, 12);
  assert.equal(t.margen, 159);
  assert.equal(t.meses, 2);
});

test("fila para la tabla: derivados y recomendación juntos", () => {
  const v = filaVista(PRODUCTO, { margenObjetivoPct: 15 }, 0.9, "Lámpara");
  assert.equal(v.etiqueta, "Lámpara");
  assert.equal(v.accion, "mantener");
  assert.equal(v.tasaEntrega, 0.8);
  assert.ok(v.efectoTasa! > 0);
});
