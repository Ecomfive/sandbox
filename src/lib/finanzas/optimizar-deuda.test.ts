import assert from "node:assert/strict";
import { test } from "node:test";
import {
  leerPorcentaje,
  pagosDeuda,
  proximoVencimientoCiclo,
  saldoCicloAl,
  tasaEfectivaAnualCiclo,
  tasaEfectivaAnualMensual,
  vencimientosCiclo,
  type FinanciamientoCiclo,
  type LineaCredito,
  type Prestamo,
} from "./deuda";
import {
  avalancha,
  cajaDisponibleDeProyeccion,
  calendario,
  deudaAl,
  escalar,
  instrumentosDeDeuda,
  intereses12,
  leerRefs,
  simularOferta,
  tablaConGracia,
  tasaNetaPrepago,
  tirMensual,
  type OfertaRefinanciamiento,
} from "./optimizar-deuda";

const HOY = "2026-10-26";
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const giro: FinanciamientoCiclo = { id: ID(1), nombre: "Giro de prueba", acreedor: "Financista Ejemplo", monto: 10_000, tasaCiclo: 0.2, diasCiclo: 70, fechaInicio: "2026-09-01", renovable: true };
const prestamo: Prestamo = {
  id: ID(2),
  nombre: "Préstamo de prueba",
  acreedor: "Banco Ejemplo",
  clase: "prestamo",
  monto: 12_000,
  tasaAnual: 0.12,
  plazoMeses: 24,
  fechaDesembolso: "2026-06-01",
  primerVencimiento: "2026-07-01",
  tipoId: null,
  cuentaId: null,
};
const linea: LineaCredito = { id: ID(3), nombre: "Línea de prueba", banco: "Banco Ejemplo", cupo: 20_000, usado: 5_000, usadoAl: HOY, tasaAnual: 0.18, fechaRenovacion: null };

test("tasa efectiva anual de un ciclo: 20 % cada 70 días ≈ 159 % al año", () => {
  const t = tasaEfectivaAnualCiclo(0.2, 70);
  assert.ok(Math.abs(t - (Math.pow(1.2, 365 / 70) - 1)) < 1e-12);
  assert.ok(t > 1.58 && t < 1.6);
  assert.ok(Math.abs(tasaEfectivaAnualCiclo(0.1, 365) - 0.1) < 1e-12);
  assert.equal(tasaEfectivaAnualCiclo(0.2, 0), 0);
  assert.ok(Math.abs(tasaEfectivaAnualMensual(0.12) - 0.126825) < 1e-6);
});

test("vencimientos de un giro renovable y uno que no se renueva", () => {
  const v = vencimientosCiclo(giro, "2026-09-01", "2027-03-31");
  assert.deepEqual(
    v.map((x) => x.fecha),
    ["2026-11-10", "2027-01-19", "2027-03-30"],
  );
  assert.ok(v.every((x) => x.interes === 2000 && x.capital === 0));
  const unico = { ...giro, renovable: false };
  assert.deepEqual(vencimientosCiclo(unico, "2026-09-01", "2027-12-31"), [{ numero: 1, fecha: "2026-11-10", interes: 2000, capital: 10_000 }]);
  assert.equal(saldoCicloAl(unico, "2026-11-09"), 10_000);
  assert.equal(saldoCicloAl(unico, "2026-11-10"), 0);
  assert.equal(saldoCicloAl(giro, "2026-08-31"), 0);
  assert.equal(saldoCicloAl(giro, "2030-01-01"), 10_000);
  assert.equal(proximoVencimientoCiclo(giro, HOY), "2026-11-10");
  // Desde mitad de la vida: el ciclo siguiente, no los anteriores.
  assert.equal(vencimientosCiclo(giro, "2027-01-20", "2027-12-31")[0].fecha, "2027-03-30");
});

test("pagosDeuda incluye los costos de los giros", () => {
  const p = pagosDeuda([], [], HOY, "2026-12-31", [giro]);
  assert.equal(p.length, 1);
  assert.equal(p[0].origen, "ciclo");
  assert.equal(p[0].monto, 2000);
});

test("leerPorcentaje", () => {
  assert.equal(leerPorcentaje("2"), 0.02);
  assert.equal(leerPorcentaje("1,5 %"), 0.015);
  assert.equal(leerPorcentaje(""), 0);
  assert.equal(leerPorcentaje("-1"), null);
  assert.equal(leerPorcentaje("abc"), null);
});

test("instrumentos: saldo, tasa efectiva y pagos de cada tipo", () => {
  const ins = instrumentosDeDeuda({ prestamos: [prestamo], lineas: [linea], ciclos: [giro] }, HOY);
  assert.equal(ins.length, 3);
  const g = ins.find((i) => i.origen === "ciclo")!;
  assert.equal(g.saldo, 10_000);
  assert.ok(g.todoCorriente);
  // 12 meses: cinco o seis vencimientos de 2 000 (cada 70 días).
  assert.ok(intereses12(g, HOY) >= 10_000);
  const l = ins.find((i) => i.origen === "linea")!;
  assert.equal(intereses12(l, HOY), 900);
  const p = ins.find((i) => i.origen === "prestamo")!;
  assert.ok(p.saldo < 12_000 && p.saldo > 9_000);
  assert.equal(deudaAl(p, HOY).saldo, p.saldo);
  assert.ok(deudaAl(p, HOY).corriente > 0 && deudaAl(p, HOY).corriente <= p.saldo);
  // Un préstamo por desembolsar no entra.
  assert.equal(instrumentosDeDeuda({ prestamos: [{ ...prestamo, fechaDesembolso: "2027-01-01", primerVencimiento: "2027-02-01" }], lineas: [] }, HOY).length, 0);
});

test("escalar reduce el saldo y los pagos en la misma proporción", () => {
  const [p] = instrumentosDeDeuda({ prestamos: [prestamo], lineas: [] }, HOY);
  const mitad = escalar(p, 0.5);
  assert.ok(Math.abs(mitad.saldo - p.saldo / 2) < 0.01);
  assert.ok(Math.abs(intereses12(mitad, HOY) - intereses12(p, HOY) / 2) < 0.2);
});

test("avalancha: primero el giro (tasa más alta), con el ahorro de 12 meses", () => {
  const ins = instrumentosDeDeuda({ prestamos: [prestamo], lineas: [linea], ciclos: [giro] }, HOY);
  const r = avalancha(ins, 12_000, HOY);
  assert.equal(r.pasos[0].origen, "ciclo");
  assert.equal(r.pasos[0].prepago, 10_000);
  assert.ok(r.pasos[0].completo);
  assert.equal(r.pasos[1].origen, "linea");
  assert.equal(r.pasos[1].prepago, 2_000);
  assert.equal(r.usada, 12_000);
  assert.equal(r.sinUsar, 0);
  assert.ok(Math.abs(r.ahorro12 - (r.interesesAntes12 - r.interesesDespues12)) < 1);
  // El giro sale del todo.
  assert.ok(!r.despues.some((i) => i.origen === "ciclo"));
});

test("avalancha: la penalidad cambia el orden y una que no conviene se salta", () => {
  const ins = instrumentosDeDeuda(
    { prestamos: [{ ...prestamo, penalidadPrepago: 0.5 }], lineas: [{ ...linea, tasaAnual: 0.1 }], ciclos: [] },
    HOY,
  );
  const p = ins.find((i) => i.origen === "prestamo")!;
  assert.ok(tasaNetaPrepago(p) < 0);
  const r = avalancha(ins, 50_000, HOY);
  assert.deepEqual(r.pasos.map((x) => x.origen), ["linea"]);
  assert.equal(r.noConviene[0].ref, p.ref);
  assert.equal(r.sinUsar, 45_000);
  // Sin caja: nada que prepagar.
  assert.equal(avalancha(ins, 0, HOY).pasos.length, 0);
});

test("avalancha con comisión fija: se descuenta de la caja", () => {
  const ins = instrumentosDeDeuda({ prestamos: [], lineas: [], ciclos: [{ ...giro, comisionPrepago: 100, penalidadPrepago: 0.01 }] }, HOY);
  const r = avalancha(ins, 5_000, HOY);
  assert.equal(r.pasos[0].prepago, Math.round(((5_000 - 100) / 1.01) * 100) / 100);
  assert.ok(Math.abs(r.pasos[0].salida - 5_000) < 0.02);
});

test("caja disponible de la proyección respeta la caja mínima", () => {
  assert.equal(cajaDisponibleDeProyeccion([9_000, 7_000, 12_000], 10_000, 5_000), 2_000);
  assert.equal(cajaDisponibleDeProyeccion([3_000], 10_000, 5_000), 0);
  assert.equal(cajaDisponibleDeProyeccion([], 8_000, 5_000), 3_000);
});

test("amortización con gracia: intereses primero y cuota fija después, saldo final cero", () => {
  const t = tablaConGracia(12_000, 0.12, 12, 3, "2026-12-01");
  assert.equal(t.length, 12);
  assert.ok(t.slice(0, 3).every((c) => c.capital === 0 && c.interes === 120 && c.saldo === 12_000));
  assert.equal(t[3].fecha, "2027-03-01");
  assert.equal(t.at(-1)!.saldo, 0);
  const capital = t.reduce((a, c) => a + c.capital, 0);
  assert.ok(Math.abs(capital - 12_000) < 0.01);
  // Sin gracia es la francesa.
  assert.equal(tablaConGracia(12_000, 0.12, 12, 0, "2026-12-01")[0].capital > 0, true);
});

test("TIR mensual", () => {
  const r = tirMensual([1000, -1010]);
  assert.ok(r !== null && Math.abs(r - 0.01) < 1e-6);
  assert.equal(tirMensual([100, 50]), null);
});

test("simular una oferta que sustituye el giro", () => {
  const ins = instrumentosDeDeuda({ prestamos: [prestamo], lineas: [linea], ciclos: [giro] }, HOY);
  const oferta: OfertaRefinanciamiento = {
    id: ID(9),
    banco: "Banco Ejemplo",
    nombre: "Oferta de prueba",
    monto: 15_000,
    plazoMeses: 36,
    tasaAnual: 0.12,
    comisionApertura: 0.01,
    graciaMeses: 2,
    garantias: null,
    fechaDesembolso: "2026-11-01",
    sustituye: [`ciclo:${ID(1)}`, `linea:${ID(3)}`],
  };
  const s = simularOferta(oferta, ins, HOY);
  assert.equal(s.comisionApertura, 150);
  assert.equal(s.neto, 14_850);
  assert.equal(s.cubiertas[0].origen, "ciclo");
  assert.equal(s.cubiertas[0].cubierto, 10_000);
  assert.equal(s.cubiertas[1].cubierto, 4_850);
  assert.equal(s.excedente, 0);
  assert.ok(Math.abs(s.sinCubrir - 150) < 0.01);
  assert.equal(s.cuotaGracia, 150);
  assert.ok(s.cuota > 400);
  assert.ok(s.ahorroAnual > 8_000);
  assert.ok(s.ahorroPrimerAnio < s.ahorroAnual);
  assert.ok(s.costoEfectivoAnual! > tasaEfectivaAnualMensual(0.12));
  assert.ok(s.tasaSustituida! > 1);
  assert.equal(s.mensual.length, 12);
  assert.ok(s.escenario.some((i) => i.origen === "oferta"));
});

test("calendario: el prepago es una salida única y el ahorro se acumula", () => {
  const ins = instrumentosDeDeuda({ prestamos: [], lineas: [linea], ciclos: [] }, HOY);
  const r = avalancha(ins, 5_000, HOY);
  const c = calendario(ins, r.despues, HOY, { fecha: HOY, monto: r.usada });
  assert.equal(c[0].unico, 5_000);
  assert.equal(c[0].efecto, 75 - 5_000);
  assert.equal(c[11].acumulado, -5_000 + 75 * 12);
});

test("leerRefs filtra las mal formadas", () => {
  assert.deepEqual(leerRefs([`ciclo:${ID(1)}`, `ciclo:${ID(1)}`, "oferta:x", "otra"]), [`ciclo:${ID(1)}`]);
});
