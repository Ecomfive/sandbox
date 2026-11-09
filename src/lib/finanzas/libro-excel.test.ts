import assert from "node:assert/strict";
import test from "node:test";
import { UNIDAD_SIN_ASIGNAR, claseDeCuenta, leerBaseDistribucion, leerFecha, leerLibro, leerMonto, leerPeriodo } from "./libro-excel";

const TITULOS = [null, "MES", "FECHA INCLUSIÓN", "TIENDA", "TIPO", "ESTATUS DE GESTION ", "TIENDA A PAGAR", "DESCRIPCIÓN", "EERR?", "FLUJO ? ", "USD", null, "Prestación de Servicio o disponibilidad", "Pago", "Forma de Pago"];

test("lee montos, fechas y períodos como vienen del Excel", () => {
  assert.equal(leerMonto("9.5"), 9.5);
  assert.equal(leerMonto("1,250.40"), 1250.4);
  assert.equal(leerMonto(" "), null);
  assert.equal(leerFecha(new Date(Date.UTC(2026, 0, 4))), "2026-01-04");
  assert.equal(leerFecha(46026), "2026-01-04");
  assert.equal(leerPeriodo("1-2026"), "2026-01-01");
  assert.equal(leerPeriodo("13-2026"), null);
  assert.equal(claseDeCuenta("TDC BANCO GENERAL"), "tarjeta");
  assert.equal(claseDeCuenta("BINANCE"), "billetera");
  assert.equal(claseDeCuenta("BAC OCEANS"), "banco");
});

test("el libro ubica las columnas por su título y deja la huella estable", () => {
  const filas = [
    [null, null, "Ejemplos"],
    TITULOS,
    [null, "1-2026", new Date(Date.UTC(2026, 0, 4)), "OFERFY PAN", "Comisiones bancarias", null, null, "COMISION YAPPY", "SI", "SI", "9.5", null, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 1)), "BANCO GENERAL"],
    [null, "1-2026", new Date(Date.UTC(2026, 0, 4)), "OFERFY PAN", "Comisiones bancarias", null, null, "COMISION YAPPY", "SI", "SI", "9.5", null, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 0, 1)), "BANCO GENERAL"],
    [null, "9-2026", null, null, "SISTEMAS", null, null, "Sin clasificar", "NO", "SI", -30, null, null, null, null],
    [null, "9-2026", null, "NUVO PAN", "SISTEMAS", null, null, "Sin monto", "SI", "SI", null],
    [null, null, null, null, null, null, null, null, null, null, null],
  ];
  const { movimientos, descartadas } = leerLibro(filas, "prueba.xlsx");
  assert.equal(movimientos.length, 3);
  assert.deepEqual(descartadas, [{ fila: 6, motivo: "sin monto" }]);
  const [a, b, c] = movimientos;
  assert.equal(a.periodo, "2026-01-01");
  assert.equal(a.monto, 9.5);
  assert.equal(a.en_eerr, true);
  assert.equal(a.fecha_pago, "2026-01-01");
  assert.equal(a.cuenta, "BANCO GENERAL");
  // Dos filas idénticas: misma huella base, distinto ordinal.
  assert.notEqual(a.origen_clave, b.origen_clave);
  assert.equal(a.origen_clave.split("#")[0], b.origen_clave.split("#")[0]);
  // Sin tienda: queda a la vista como SIN ASIGNAR. Un monto negativo es un reverso y conserva su signo.
  assert.equal(c.unidad, UNIDAD_SIN_ASIGNAR);
  assert.equal(c.monto, -30);
  assert.equal(c.en_eerr, false);
  // Reimportar da las mismas huellas.
  assert.deepEqual(leerLibro(filas, "prueba.xlsx").movimientos.map((m) => m.origen_clave), movimientos.map((m) => m.origen_clave));
});

test("la base de reparto sale de las filas de envíos del EERR, bloque por mes", () => {
  const fila = (n: number) => Array(n).fill(null);
  const periodos = fila(26);
  periodos[10] = "PERÍODO";
  periodos[11] = new Date(Date.UTC(2026, 0, 1));
  periodos[22] = "PERÍODO";
  periodos[23] = new Date(Date.UTC(2026, 1, 1));
  const tiendas = fila(26);
  [[3, "CALZADOS O."], [4, "NUVO PAN"], [5, "OFERFY PAN"], [11, "TOTAL"], [15, "CALZADOS O."], [16, "NUVO PAN"], [17, "OFERFY PAN"], [23, "TOTAL"]].forEach(([i, n]) => (tiendas[i as number] = n));
  const envios = fila(26);
  envios[1] = "INDICADORES";
  envios[2] = "TOTAL ENVÍOS";
  [[3, 0], [4, 1054], [5, 3516], [11, 4570], [15, 0], [16, 1318], [17, 3116], [23, 4434]].forEach(([i, v]) => (envios[i] = v));
  const entregados = fila(26);
  entregados[2] = "ENTREGADOS";
  entregados[4] = 558;
  const base = leerBaseDistribucion([fila(26), periodos, fila(26), tiendas, envios, entregados]);
  assert.deepEqual(base.find((b) => b.periodo === "2026-01-01" && b.unidad === "NUVO PAN"), { periodo: "2026-01-01", unidad: "NUVO PAN", envios: 1054, entregados: 558 });
  assert.equal(base.find((b) => b.periodo === "2026-02-01" && b.unidad === "OFERFY PAN")!.envios, 3116);
  assert.ok(!base.some((b) => b.unidad === "TOTAL"));
  assert.equal(base.length, 6);
});
