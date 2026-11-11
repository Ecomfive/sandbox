import assert from "node:assert/strict";
import test from "node:test";
import {
  PAGOS_TARJETA,
  SIN_CUENTA,
  armarFlujo,
  cajaTotal,
  filasEstadoFlujo,
  filasPorCuenta,
  leerMes,
  mesesDeCaja,
  rangoMeses,
  resumirFlujo,
  saldosPorCuenta,
  ventanaPedida,
  type FilaFlujo,
} from "./flujo";

const ENE = "2026-01-01";
const FEB = "2026-02-01";
const MAR = "2026-03-01";

const f = (mes: string, tipo: string, bloque: FilaFlujo["bloque"], sentido: FilaFlujo["sentido"], monto: number, cuenta: string | null = "banco"): FilaFlujo => ({
  mes, cuenta_id: cuenta, tipo, orden: 0, bloque, sentido, monto,
});

const FILAS: FilaFlujo[] = [
  f(ENE, "Ingresos", "operativo", "entrada", 1000),
  f(ENE, "SUELDOS", "operativo", "salida", 300),
  f(ENE, "SISTEMAS", "operativo", "salida", 50, "tarjeta"),
  f(ENE, "Retiro de dividendos", "financiamiento", "salida", 200),
  f(ENE, "Alta Bien de Uso", "inversion", "salida", 100, null),
  f(FEB, "Ingresos", "operativo", "entrada", 500),
  f(FEB, "PAGO TDC", "traspaso", "salida", 50),
  f(FEB, "SUELDOS", "operativo", "salida", 300),
];

test("el flujo suma entradas y salidas por bloque, sin contar el traspaso", () => {
  const e = armarFlujo(FILAS, [ENE, FEB]);
  assert.equal(e.entradas[ENE], 1000);
  assert.equal(e.salidas[ENE], 650);
  assert.equal(e.neto[ENE], 350);
  // El PAGO TDC no es una salida de caja: el gasto ya se contó al cargarlo a la tarjeta.
  assert.equal(e.salidas[FEB], 300);
  assert.equal(e.neto[FEB], 200);
  const op = e.bloques.find((b) => b.bloque === "operativo")!;
  assert.equal(op.neto[ENE], 650);
  assert.equal(op.lineas[0].tipo, "Ingresos", "las entradas van primero");
  assert.equal(op.lineas[0].meses[ENE], 1000);
  assert.equal(op.lineas.find((l) => l.tipo === "SUELDOS")!.meses[ENE], -300, "las salidas llevan signo negativo");
  assert.equal(e.bloques.find((b) => b.bloque === "financiamiento")!.neto[ENE], -200);
  assert.equal(e.bloques.find((b) => b.bloque === "inversion")!.neto[ENE], -100);
  assert.ok(!e.bloques.some((b) => b.bloque === "sin_clasificar"), "sin clasificar solo aparece si hay algo");
});

test("fuera de la ventana no cuenta", () => {
  const e = armarFlujo(FILAS, [FEB]);
  assert.deepEqual(Object.keys(e.neto), [FEB]);
  assert.equal(e.neto[FEB], 200);
});

test("saldo por cuenta: inicial → entradas → salidas → traspasos → final, desde el saldo cargado", () => {
  const cuentas = [
    { id: "banco", nombre: "Banco", clase: "banco" },
    { id: "tarjeta", nombre: "Tarjeta", clase: "tarjeta" },
  ];
  const s = saldosPorCuenta(FILAS, [{ cuenta_id: "banco", fecha: ENE, monto: 10_000 }], cuentas, [ENE, FEB, MAR]);
  const banco = s.find((c) => c.id === "banco")!;
  assert.equal(banco.conSaldo, true);
  assert.equal(banco.inicial[ENE], 10_000);
  assert.equal(banco.final[ENE], 10_000 + 1000 - 300 - 200);
  assert.equal(banco.inicial[FEB], banco.final[ENE]);
  assert.equal(banco.traspasos[FEB], -50);
  assert.equal(banco.final[FEB], 10_500 + 500 - 300 - 50);
  assert.equal(banco.final[MAR], banco.final[FEB], "un mes sin movimientos conserva el saldo");
  const tarjeta = s.find((c) => c.id === "tarjeta")!;
  assert.equal(tarjeta.conSaldo, false);
  assert.equal(tarjeta.final[ENE], -50, "la tarjeta acumula deuda");
  const pagos = s.find((c) => c.id === PAGOS_TARJETA)!;
  assert.equal(pagos.traspasos[FEB], 50, "la contrapartida del pago de tarjeta");
  const sin = s.find((c) => c.id === SIN_CUENTA)!;
  assert.equal(sin.final[ENE], -100);
  // Los traspasos se anulan: la caja total cambia solo por el flujo neto.
  const caja = cajaTotal(s, [ENE, FEB, MAR]);
  assert.equal(caja.final[ENE] - caja.inicial[ENE], 350);
  assert.equal(caja.final[FEB] - caja.inicial[FEB], 200);
});

test("con un saldo cargado después, los meses anteriores se calculan hacia atrás", () => {
  const s = saldosPorCuenta(FILAS, [{ cuenta_id: "banco", fecha: MAR, monto: 5000 }], [{ id: "banco", nombre: "B", clase: "banco" }], [ENE, FEB, MAR]);
  const banco = s.find((c) => c.id === "banco")!;
  assert.equal(banco.inicial[MAR], 5000);
  assert.equal(banco.final[FEB], 5000);
  assert.equal(banco.inicial[FEB], 5000 - (500 - 300 - 50));
  assert.equal(banco.inicial[ENE], banco.inicial[FEB] - (1000 - 300 - 200));
});

test("el saldo cargado más reciente manda", () => {
  const s = saldosPorCuenta(
    FILAS,
    [
      { cuenta_id: "banco", fecha: ENE, monto: 10_000 },
      { cuenta_id: "banco", fecha: FEB, monto: 1 },
    ],
    [{ id: "banco", nombre: "B", clase: "banco" }],
    [FEB],
  );
  assert.equal(s.find((c) => c.id === "banco")!.inicial[FEB], 1);
});

test("filas del estado: caja inicial, bloques con detalle, flujo neto y caja final", () => {
  const e = armarFlujo(FILAS, [ENE]);
  const filas = filasEstadoFlujo(e, { inicial: { [ENE]: 0 }, final: { [ENE]: 350 } });
  assert.equal(filas[0].clave, "caja-inicial");
  assert.equal(filas.at(-1)!.clave, "caja-final");
  assert.equal(filas.at(-2)!.etiqueta, "Flujo neto");
  assert.ok(filas.some((x) => x.etiqueta === "Ingresos (entrada)"));
  assert.equal(filasEstadoFlujo(e).some((x) => x.clave.startsWith("caja")), false);
});

test("resumen: caja final, salida operativa promedio, meses de caja y cuentas sin saldo", () => {
  const cuentas = [
    { id: "banco", nombre: "Banco", clase: "banco" },
    { id: "tarjeta", nombre: "Tarjeta", clase: "tarjeta" },
  ];
  const r = resumirFlujo(FILAS, [{ cuenta_id: "banco", fecha: ENE, monto: 10_000 }], cuentas, [ENE, FEB]);
  assert.equal(r.conSaldos, true);
  assert.equal(r.cuentasSinSaldo, 1, "la tarjeta tiene movimiento y no tiene saldo");
  assert.equal(r.cajaFinal, 10_000 + 350 + 200);
  assert.equal(r.salidaOperativaPromedio, (350 + 300) / 2);
  assert.equal(r.mesesDeCaja, r.cajaFinal / r.salidaOperativaPromedio);
  const filas = filasPorCuenta(r.cuentas, [ENE, FEB]);
  const banco = filas.find((f) => f.clave === "banco-final")!;
  assert.equal(banco.tipo, "grupo");
  assert.equal(banco.total, r.cuentas.find((c) => c.id === "banco")!.final[FEB], "el total de un saldo es el del último mes");
  assert.equal(filas.find((f) => f.clave === "banco-inicial")!.total, 10_000, "y el del saldo inicial, el del primero");
  assert.equal(filas.find((f) => f.clave === "banco-salidas")!.valores[ENE], -500, "las salidas se muestran en negativo");
  assert.ok(filas.find((f) => f.clave === "tarjeta-final")!.etiqueta.includes("sin saldo inicial"));
});

test("meses de caja", () => {
  assert.equal(mesesDeCaja(30_000, 10_000), 3);
  assert.equal(mesesDeCaja(30_000, 0), null);
  assert.equal(mesesDeCaja(-5, 100), null);
});

test("meses y ventana pedida", () => {
  assert.deepEqual(rangoMeses("2025-11-01", "2026-02-01"), ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
  assert.equal(leerMes("2026-03"), "2026-03-01");
  assert.equal(leerMes("2026-13"), null);
  assert.equal(leerMes("x"), null);
  const disp = rangoMeses("2025-01-01", "2026-06-01");
  assert.equal(ventanaPedida(undefined, undefined, disp).length, 12);
  assert.deepEqual(ventanaPedida("2026-03", "2026-01", disp), [ENE, FEB, MAR], "al revés se da vuelta");
  assert.equal(ventanaPedida("2026-05", undefined, disp).at(-1), "2026-06-01");
  assert.deepEqual(ventanaPedida(undefined, undefined, []), []);
});
