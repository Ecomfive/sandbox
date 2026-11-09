import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alertasTesoreria,
  antiguedadEfectivo,
  CONFIG_TESORERIA_POR_DEFECTO,
  costoCobroPorMedio,
  comisionesPorMes,
  depositosRepartidores,
  ingresosTransito,
  leerConfigTesoreria,
  posicionCaja,
  seguimientoDropi,
  serieDiaria,
  supuestoTransito,
  ultimosSaldos,
  type PuntoSaldo,
  type SemanaRepartidor,
} from "./tesoreria";

const puntos: PuntoSaldo[] = [
  { cuentaId: "b1", fecha: "2026-10-18", saldo: 1000, origen: "extracto" },
  { cuentaId: "b1", fecha: "2026-10-20", saldo: 1200, origen: "extracto" },
  { cuentaId: "b1", fecha: "2026-10-20", saldo: 1250, origen: "manual" },
  { cuentaId: "y1", fecha: "2026-10-22", saldo: 300, origen: "manual" },
];

test("serie diaria: arrastra el último saldo y manda lo manual", () => {
  assert.deepEqual(serieDiaria(puntos.filter((p) => p.cuentaId === "b1"), "2026-10-19", "2026-10-22"), [1000, 1250, 1250, 1250]);
  assert.deepEqual(serieDiaria(puntos.filter((p) => p.cuentaId === "y1"), "2026-10-21", "2026-10-23"), [null, 300, 300]);
  assert.equal(ultimosSaldos(puntos).get("b1")?.saldo, 1250);
});

test("posición de caja: suma bancos, Yappy, repartidores y Dropi con la fecha de cada dato", () => {
  const p = posicionCaja({
    hoy: "2026-10-23",
    cuentas: [
      { id: "b1", nombre: "Banco A", clase: "banco", moneda: "USD" },
      { id: "y1", nombre: "Yappy", clase: "billetera", moneda: "USD" },
      { id: "t1", nombre: "Tarjeta", clase: "tarjeta", moneda: "USD" },
    ],
    saldos: ultimosSaldos([...puntos, { cuentaId: "t1", fecha: "2026-10-22", saldo: -500, origen: "manual" }]),
    yappyPorLiquidar: { monto: 50, fecha: "2026-10-23" },
    efectivoRepartidores: { monto: 400, fecha: "2026-10-23" },
    dropiWallet: { monto: 700, fecha: "2026-10-21" },
    dropiRetiros: { monto: 900, fecha: "2026-10-19", cantidad: 1 },
  });
  assert.deepEqual(p.partidas.map((x) => [x.clave, x.monto]), [
    ["bancos", 1250],
    ["yappy", 350],
    ["repartidores", 400],
    ["dropi_wallet", 700],
    ["dropi_retiros", 900],
  ]);
  assert.equal(p.total, 3600);
  assert.equal(p.partidas[0].antiguedad, 3);
  assert.equal(p.fechaMasVieja, "2026-10-19");
});

test("Dropi: conviene retirar por umbral o por días", () => {
  const c = { dropiUmbral: 500, dropiDias: 7 };
  const s = seguimientoDropi(
    { hoy: "2026-10-23", saldos: [{ fecha: "2026-10-20", monto: 300 }, { fecha: "2026-10-22", monto: 650 }], retiros: [{ fecha: "2026-10-20", estado: "abierto", monto: 400, aRecibir: 390 }] },
    c,
  );
  assert.equal(s.saldo, 650);
  assert.deepEqual(s.motivos, ["umbral"]);
  assert.equal(s.enCamino, 390);
  const d = seguimientoDropi({ hoy: "2026-10-23", saldos: [{ fecha: "2026-10-22", monto: 120 }], retiros: [{ fecha: "2026-10-10", estado: "cerrado", monto: 400, aRecibir: 390 }] }, c);
  assert.deepEqual(d.motivos, ["dias"]);
  assert.equal(seguimientoDropi({ hoy: "2026-10-23", saldos: [{ fecha: "2026-10-22", monto: 0 }], retiros: [] }, c).pedir, false);
});

const semana = (s: Partial<SemanaRepartidor>): SemanaRepartidor => ({
  repartidorId: "r1",
  repartidor: "Repartidor Uno",
  semana: "2026-10-08",
  primeraFecha: "2026-10-08",
  cobrado: 500,
  depositadoBanco: 0,
  cierreEstado: null,
  aPagar: null,
  adelantos: 0,
  descuentos: 0,
  rendicionRecibo: null,
  ...s,
});

test("depósitos: compensación del cierre, faltante, incompleto y en curso", () => {
  const d = depositosRepartidores(
    [
      semana({}),
      semana({ repartidorId: "r2", repartidor: "Dos", depositadoBanco: 200 }),
      semana({ repartidorId: "r3", repartidor: "Tres", cierreEstado: "pagado", aPagar: 150, depositadoBanco: 350 }),
      semana({ repartidorId: "r4", repartidor: "Cuatro", semana: "2026-10-22", primeraFecha: "2026-10-22" }),
    ],
    "2026-10-23",
  );
  const por = Object.fromEntries(d.map((x) => [x.repartidorId, x]));
  assert.equal(por.r1.estado, "faltante");
  assert.equal(por.r1.faltante, 500);
  assert.equal(por.r1.antiguedad, 15);
  assert.equal(por.r2.estado, "incompleto");
  assert.equal(por.r2.faltante, 300);
  assert.equal(por.r3.compensado, 150);
  assert.equal(por.r3.estado, "completo");
  assert.equal(por.r4.estado, "en_curso");
  const a = antiguedadEfectivo(d, 7);
  assert.equal(a.find((x) => x.repartidorId === "r1")?.tramos["15+"], 500);
  assert.equal(a.find((x) => x.repartidorId === "r4")?.alerta, false);
  assert.equal(a[0].alerta, true);
});

test("comisiones por mes y fuente", () => {
  const meses = ["2026-08-01", "2026-09-01"];
  const c = comisionesPorMes(
    [
      { mes: "2026-08-01", fuente: "pasarela", concepto: "yappy", monto: 10 },
      { mes: "2026-09-01", fuente: "libro", concepto: "COMISIONES BANCARIAS", monto: 25 },
      { mes: "2026-09-01", fuente: "pasarela", concepto: "yappy", monto: 12.5 },
    ],
    meses,
  );
  assert.deepEqual(c.map((x) => [x.fuente, x.concepto, x.valores]), [
    ["libro", "COMISIONES BANCARIAS", [0, 25]],
    ["pasarela", "yappy", [10, 12.5]],
  ]);
});

test("costo de cobrar: Yappy del banco solo si la pasarela no la trae; contra entrega junta efectivo y Servientrega", () => {
  const meses = ["2026-08-01", "2026-09-01"];
  const r = costoCobroPorMedio(
    [
      { mes: "2026-08-01", metodo: "yappy", ordenes: 10, ventas: 1000, comision: 0 },
      { mes: "2026-09-01", metodo: "yappy", ordenes: 10, ventas: 1000, comision: 0 },
      { mes: "2026-08-01", metodo: "yappy", ordenes: 0, ventas: 0, comision: 20 },
      { mes: "2026-08-01", metodo: "yappy_banco", ordenes: 0, ventas: 0, comision: 19 },
      { mes: "2026-09-01", metodo: "yappy_banco", ordenes: 0, ventas: 0, comision: 22 },
      { mes: "2026-09-01", metodo: "efectivo", ordenes: 5, ventas: 300, comision: 0 },
      { mes: "2026-09-01", metodo: "servientrega", ordenes: 2, ventas: 200, comision: 10 },
    ],
    meses,
  );
  const yappy = r.find((x) => x.medio === "yappy")!;
  assert.deepEqual(yappy.costo, [20, 22]);
  assert.deepEqual(yappy.pct, [2, 2.2]);
  const ce = r.find((x) => x.medio === "contra_entrega")!;
  assert.deepEqual(ce.ventas, [0, 500]);
  assert.deepEqual(ce.pct, [null, 2]);
});

test("Dropi en tránsito: sin historia no se proyecta; con historia, monto × tasa × neto en su fecha", () => {
  assert.equal(supuestoTransito({ entregados: 5, devueltos: 1, montoEntregados: 100, conGanancia: 5, montoConGanancia: 100, ganancia: 50, diasAGanancia: 4 }), null);
  const s = supuestoTransito({ entregados: 80, devueltos: 20, montoEntregados: 8000, conGanancia: 60, montoConGanancia: 6000, ganancia: 3000, diasAGanancia: 5 })!;
  assert.equal(s.tasaEntrega, 0.8);
  assert.equal(s.netoSobreVenta, 0.5);
  const i = ingresosTransito([{ fecha: "2026-10-10", pedidos: 3, monto: 100 }, { fecha: "2026-10-21", pedidos: 2, monto: 200 }], s, 3, "2026-10-23");
  assert.deepEqual(i, [
    { fecha: "2026-10-26", monto: 40, pedidos: 3 },
    { fecha: "2026-10-29", monto: 80, pedidos: 2 },
  ]);
});

test("ajustes: lo que está fuera de rango vuelve al de por defecto", () => {
  assert.deepEqual(leerConfigTesoreria(null), CONFIG_TESORERIA_POR_DEFECTO);
  const c = leerConfigTesoreria({ dropiUmbral: "750", efectivoDias: 0, saldoDias: "5" });
  assert.equal(c.dropiUmbral, 750);
  assert.equal(c.efectivoDias, CONFIG_TESORERIA_POR_DEFECTO.efectivoDias);
  assert.equal(c.saldoDias, 5);
});

test("alertas ordenadas por gravedad", () => {
  const a = alertasTesoreria(
    {
      hoy: "2026-10-23",
      config: CONFIG_TESORERIA_POR_DEFECTO,
      dropi: null,
      antiguedad: [],
      depositos: [],
      saldosViejos: [{ cuenta: "Banco A", fecha: "2026-10-10" }],
      lineas: [{ nombre: "Línea", alertas: ["vencida"], diasParaRenovar: -3, uso: 0.5 }],
      porAprobar: 2,
    },
    (v) => `$${v}`,
  );
  assert.deepEqual(a.map((x) => x.severidad), ["critica", "info", "info"]);
});
