import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cambiosDeSigno,
  evaluar,
  flujoNeto,
  indiceRentabilidad,
  payback,
  seguimiento,
  sensibilidad,
  tasaDelPeriodo,
  tasaDescuento,
  tir,
  validarProyecto,
  van,
  type PeriodoFlujo,
} from "./evaluacion-proyectos";

const cerca = (a: number | null, b: number, tol = 1e-4) => assert.ok(a !== null && Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test("VAN de libro: −1000 y 3 × 500 al 10 %", () => {
  cerca(van([-1000, 500, 500, 500], 0.1), 243.4260, 1e-3);
  assert.equal(van([-1000, 1100], 0), 100);
});

test("TIR única", () => {
  const r = tir([-1000, 500, 500, 500]);
  assert.equal(r.motivo, "ok");
  cerca(r.tir, 0.233752, 1e-5);
  cerca(tir([-100, 110]).tir, 0.1, 1e-7);
});

test("sin cambio de signo no hay TIR", () => {
  assert.equal(tir([100, 50, 50]).motivo, "sin_cambio_de_signo");
  assert.equal(tir([-100, -50]).tir, null);
  assert.equal(cambiosDeSigno([-1, 0, 2, -3]), 2);
});

test("varias TIR: −100, 230, −132 tiene raíces 10 % y 20 %", () => {
  const r = tir([-100, 230, -132], 0.12);
  assert.equal(r.motivo, "multiples");
  assert.equal(r.todas.length, 2);
  cerca(r.todas[0], 0.1, 1e-6);
  cerca(r.todas[1], 0.2, 1e-6);
  cerca(r.tir, 0.1, 1e-6);
});

test("payback simple y descontado", () => {
  assert.equal(payback([-1000, 400, 400, 400]), 2.5);
  assert.equal(payback([-1000, 100, 100]), null);
  const d = payback([-1000, 400, 400, 400, 400], 0.1)!;
  assert.ok(d > 3 && d < 3.5);
  assert.equal(payback([0, 10]), 0);
});

test("índice de rentabilidad", () => {
  cerca(indiceRentabilidad([-1000, 1100], 0), 1.1);
  assert.equal(indiceRentabilidad([10, 10], 0.1), null);
});

test("evaluar con períodos mensuales: la tasa anual se lleva al mes y la TIR vuelve a anual", () => {
  const periodos: PeriodoFlujo[] = [
    { inversion: 1200, ingresos: 0, costos: 0, capitalTrabajo: 0 },
    ...Array.from({ length: 12 }, () => ({ inversion: 0, ingresos: 300, costos: 150, capitalTrabajo: 0 })),
  ];
  assert.equal(flujoNeto(periodos[1]), 150);
  const e = evaluar(periodos, 0.12, "mes");
  cerca(e.tasaPeriodo, tasaDelPeriodo(0.12, "mes"));
  assert.ok(e.van > 0 && e.conviene);
  assert.equal(e.payback, 8);
  assert.ok(e.tirAnual! > 0.5);
  assert.equal(e.inversionTotal, 1200);
});

test("capital de trabajo inmovilizado y liberado al final", () => {
  const e = evaluar(
    [
      { inversion: 100, ingresos: 0, costos: 0, capitalTrabajo: 50 },
      { inversion: 0, ingresos: 100, costos: 40, capitalTrabajo: 0 },
      { inversion: 0, ingresos: 100, costos: 40, capitalTrabajo: -50 },
    ],
    0,
    "anio",
  );
  assert.deepEqual(e.flujos, [-150, 60, 110]);
  assert.equal(e.van, 20);
});

test("sensibilidad: ingresos −20 % bajan el VAN, costos −20 % lo suben", () => {
  const p: PeriodoFlujo[] = [
    { inversion: 1000, ingresos: 0, costos: 0, capitalTrabajo: 0 },
    { inversion: 0, ingresos: 1000, costos: 400, capitalTrabajo: 0 },
    { inversion: 0, ingresos: 1000, costos: 400, capitalTrabajo: 0 },
  ];
  const m = sensibilidad(p, 0.1, "anio");
  assert.equal(m.length, 5);
  const centro = m[2][2].van;
  assert.ok(m[0][2].van < centro);
  assert.ok(m[2][0].van > centro);
});

test("seguimiento: real contra prometido en los períodos con dato", () => {
  const p: PeriodoFlujo[] = [
    { inversion: 100, ingresos: 0, costos: 0, capitalTrabajo: 0 },
    { inversion: 0, ingresos: 80, costos: 20, capitalTrabajo: 0 },
    { inversion: 0, ingresos: 80, costos: 20, capitalTrabajo: 0 },
  ];
  assert.equal(seguimiento(p, [], 0.1, "anio"), null);
  const s = seguimiento(p, [{ inversion: 100, ingresos: 0, costos: 0, capitalTrabajo: 0 }, { inversion: 0, ingresos: 50, costos: 20, capitalTrabajo: 0 }], 0, "anio")!;
  assert.equal(s.periodos, 2);
  assert.equal(s.prometido, -40);
  assert.equal(s.real, -70);
  assert.equal(s.diferencia, -30);
  assert.equal(s.vanRevisado, -10);
});

test("tasa de descuento: proyecto > WACC > costo financiero > 15 %", () => {
  assert.deepEqual(tasaDescuento(20, 12, 9), { tasa: 20, fuente: "proyecto" });
  assert.deepEqual(tasaDescuento(null, 12, 9), { tasa: 12, fuente: "wacc" });
  assert.deepEqual(tasaDescuento(null, null, 9.456), { tasa: 9.46, fuente: "costo_financiero" });
  assert.deepEqual(tasaDescuento(null, null, null), { tasa: 15, fuente: "predeterminada" });
});

test("validar proyecto", () => {
  assert.ok("error" in validarProyecto({ nombre: "", periodicidad: "mes", flujos: [] }));
  assert.ok("error" in validarProyecto({ nombre: "X", periodicidad: "mes", flujos: [{ inversion: -1 }, {}] }));
  const ok = validarProyecto({ nombre: " Bodega nueva ", periodicidad: "anio", tasa: "18", flujos: [{ inversion: "1,000" }, { ingresos: 500 }] });
  assert.ok(!("error" in ok));
  if (!("error" in ok)) {
    assert.equal(ok.nombre, "Bodega nueva");
    assert.equal(ok.tasa, 18);
    assert.equal(ok.flujos[0].inversion, 1000);
  }
});
