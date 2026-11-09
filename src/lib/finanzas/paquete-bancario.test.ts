import { test } from "node:test";
import assert from "node:assert/strict";
import {
  carteraAlCorte,
  concentracionVentas,
  cortesBalance,
  cortesDisponibles,
  corteSugerido,
  dividir,
  indicadoresBancarios,
  interesesDeFinanzas,
  leerCarta,
  leerEntidad,
  leerSecciones,
  limitacionesPaquete,
  mesesHasta,
  posicionCorriente,
  seccionesPermitidas,
  totalesAnuales,
  type InsumosIndicadores,
} from "./paquete-bancario";
import type { InsumosBalance } from "./balance";

const base: InsumosIndicadores = {
  ventas: 1200,
  ventasAnterior: 1000,
  costoVentas: 600,
  margenBruto: 600,
  ebitda: 240,
  intereses: 60,
  cxc: 120,
  inventario: 300,
  cxp: 90,
  caja: 50,
  deudaFinanciera: 480,
  activoCorriente: 470,
  pasivoCorriente: 235,
  mesesConDatos: 12,
};

test("dividir no inventa con cero ni con datos faltantes", () => {
  assert.equal(dividir(10, 0), null);
  assert.equal(dividir(null, 5), null);
  assert.equal(dividir(10, Number.NaN), null);
  assert.equal(dividir(10, 4), 2.5);
});

test("indicadores con 12 meses: márgenes, días, ciclo, deuda y liquidez", () => {
  const r = indicadoresBancarios(base);
  assert.equal(r.margenBrutoPct, 50);
  assert.equal(r.margenEbitdaPct, 20);
  assert.ok(Math.abs(r.crecimientoPct! - 20) < 1e-9);
  assert.ok(Math.abs(r.dso! - 36.5) < 1e-9);
  assert.ok(Math.abs(r.dio! - 182.5) < 1e-9);
  assert.ok(Math.abs(r.dpo! - 54.75) < 1e-9);
  assert.ok(Math.abs(r.cicloCaja! - (182.5 + 36.5 - 54.75)) < 1e-9);
  assert.equal(r.deudaEbitda, 2);
  assert.equal(r.deudaNeta, 430);
  assert.ok(Math.abs(r.deudaNetaEbitda! - 430 / 240) < 1e-9);
  assert.equal(r.coberturaIntereses, 4);
  assert.equal(r.liquidezCorriente, 2);
  assert.equal(r.capitalTrabajo, 235);
  assert.equal(r.deudaEbitdaNoSignificativa, false);
});

test("EBITDA negativo, sin intereses ni pasivo: nada se divide por cero", () => {
  const r = indicadoresBancarios({ ...base, ebitda: -50, intereses: 0, pasivoCorriente: 0, ventasAnterior: null, ventas: 0 });
  assert.equal(r.deudaEbitda, null);
  assert.equal(r.deudaEbitdaNoSignificativa, true);
  assert.equal(r.coberturaIntereses, null);
  assert.equal(r.liquidezCorriente, null);
  assert.equal(r.capitalTrabajo, 470);
  assert.equal(r.crecimientoPct, null);
  assert.equal(r.margenBrutoPct, null);
  assert.equal(r.dso, null);
});

test("sin deuda con EBITDA negativo no es «no significativo»; con 6 meses los días son la mitad", () => {
  assert.equal(indicadoresBancarios({ ...base, ebitda: -1, deudaFinanciera: 0 }).deudaEbitdaNoSignificativa, false);
  const seis = indicadoresBancarios({ ...base, mesesConDatos: 6 });
  assert.ok(Math.abs(seis.dso! - 18.25) < 1e-9);
  assert.equal(indicadoresBancarios({ ...base, cxp: null }).cicloCaja, null);
});

test("posición corriente desde los insumos del balance", () => {
  const i: InsumosBalance = {
    caja: [
      { id: "a", nombre: "Banco", saldo: 100 },
      { id: "b", nombre: "Caja", saldo: -20 },
    ],
    tarjetas: -30,
    cxc: 50,
    cxp: 40,
    bienesCosto: 0,
    bienesDepreciacion: 0,
    inventario: 200,
    partidas: [
      { entidad_id: null, rubro: "prestamo", concepto: "Socio", periodo: "2026-01-01", monto: 25 },
      { entidad_id: null, rubro: "otro_pasivo", concepto: "Otro", periodo: "2026-01-01", monto: 5 },
    ],
    aportesLibro: 0,
    utilidadAcumulada: 0,
    retiros: 0,
    deuda: [{ id: "p", nombre: "Banco X", saldo: 300, corriente: 60 }],
    anticipos: 10,
    gastosImportacion: 7,
  };
  const p = posicionCorriente(i);
  assert.equal(p.caja, 80);
  assert.equal(p.activoCorriente, 80 + 50 + 200 + 10);
  assert.equal(p.pasivoCorriente, 40 + 7 + 30 + 60 + 25 + 5);
  assert.equal(p.deudaFinanciera, 325);
  assert.equal(posicionCorriente({ ...i, cxc: null }).activoCorriente, null);
});

test("intereses: tipos con «interés» o, si no hay, toda la sección como aproximado", () => {
  assert.deepEqual(
    interesesDeFinanzas([
      { tipo: "Intereses bancarios", total: 40, signo: -1 },
      { tipo: "Comisiones", total: 10, signo: -1 },
    ]),
    { monto: 40, aproximado: false },
  );
  assert.deepEqual(interesesDeFinanzas([{ tipo: "Comisiones", total: 10, signo: -1 }]), { monto: 10, aproximado: true });
  assert.deepEqual(interesesDeFinanzas([]), { monto: 0, aproximado: false });
});

test("secciones: orden del paquete, permisos y limitaciones siempre", () => {
  const permitidas = seccionesPermitidas(["estado-resultados"]);
  assert.ok(permitidas.includes("eerr") && !permitidas.includes("balance") && permitidas.includes("limitaciones"));
  assert.deepEqual(leerSecciones("eerr,resumen,balance,xx", permitidas), ["resumen", "eerr", "limitaciones"]);
  assert.deepEqual(leerSecciones(undefined, ["resumen", "notas"]), ["resumen", "notas", "limitaciones"]);
  assert.deepEqual(leerSecciones(["indicadores"]), ["indicadores", "limitaciones"]);
});

test("carta, entidad y cortes", () => {
  assert.deepEqual(leerCarta("  Hola\r\nmundo\u0007 "), { texto: "Hola\nmundo" });
  assert.ok("error" in leerCarta("x".repeat(9000)));
  assert.ok("error" in leerCarta(5));
  assert.equal(leerEntidad("pa", ["PA", "CR"]), "PA");
  assert.equal(leerEntidad("MX", ["PA", "CR"]), "consolidado");
  assert.deepEqual(mesesHasta("2026-02-01", 3), ["2025-12-01", "2026-01-01", "2026-02-01"]);
  assert.equal(corteSugerido("2026-10-01", ["2026-08-01", "2026-10-01", "2026-07-01"]), "2026-08-01");
  assert.equal(corteSugerido("2026-01-01", []), "2025-12-01");
  assert.deepEqual(cortesBalance("2026-09-01", "2025-10-15"), ["2026-03-01", "2026-06-01", "2026-09-01"]);
  assert.deepEqual(cortesBalance("2026-09-01", null), ["2025-09-01", "2026-03-01", "2026-06-01", "2026-09-01"]);
  assert.deepEqual(cortesDisponibles("2026-03-01", "2026-01-10"), ["2026-02-01", "2026-01-01"]);
});

test("concentración de ventas con HHI", () => {
  const c = concentracionVentas([
    { nombre: "B", ventas: 25 },
    { nombre: "A", ventas: 75 },
    { nombre: "C", ventas: 0 },
  ]);
  assert.deepEqual(c.filas.map((f) => f.nombre), ["A", "B"]);
  assert.equal(c.primera, 0.75);
  assert.equal(c.tresPrimeras, 1);
  assert.equal(c.hhi, 6250);
  assert.equal(concentracionVentas([]).hhi, 0);
});

test("totales por año solo con meses con datos", () => {
  const meses = ["2025-12-01", "2026-01-01", "2026-02-01"];
  const s = { "2025-12-01": 10, "2026-01-01": 20, "2026-02-01": 30 };
  const t = totalesAnuales(meses, new Set(["2025-12-01", "2026-02-01"]), { ingresos: s, margenBruto: s, ebitda: s, resultadoNeto: s });
  assert.deepEqual(t.map((x) => [x.anio, x.meses, x.ingresos]), [
    ["2025", 1, 10],
    ["2026", 1, 30],
  ]);
});

test("cartera al corte: sin documentos posteriores ni abonos posteriores", () => {
  const docs = [
    { contraparte: "X", monto: 100, fecha: "2026-01-10", vencimiento: "2026-02-10", estado_manual: null, abonos: [{ fecha: "2026-03-05", monto: 100 }] },
    { contraparte: "Y", monto: 50, fecha: "2026-04-01", vencimiento: null, estado_manual: null, abonos: [] },
    { contraparte: "Z", monto: 30, fecha: "2026-01-01", vencimiento: null, estado_manual: "anulado" as const, abonos: [] },
  ];
  const r = carteraAlCorte(docs, "2026-02-28");
  assert.equal(r.total, 100);
  assert.equal(r.vencido, 100);
  assert.equal(r.tramos["31-60"], 100);
  assert.equal(carteraAlCorte(docs, "2026-04-30").total, 50);
});

test("limitaciones: siempre «no auditadas», y los huecos sin repetir", () => {
  const l = limitacionesPaquete(
    {
      balanceSinCuadrar: [{ corte: "2026-09-01", diferencia: 12.5 }],
      sinInventario: ["2026-06-01"],
      conSaldos: false,
      cuentasSinSaldo: 3,
      mesesSinDatos: [],
      movimientosSinTipo: 2,
      movimientosSinTienda: 0,
      avisos: ["Falta X", "Falta X"],
      corteCerrado: false,
      interesesAproximados: true,
      deudaEbitdaNoSignificativa: false,
      sinRegistroGiros: true,
      proyeccionDesdeHoy: true,
      seccionesSinDatos: ["Deuda vigente"],
    },
    (v) => `$${v}`,
    (m) => m.slice(0, 7),
  );
  assert.equal(l[0].clave, "no-auditadas");
  assert.ok(l.some((x) => x.texto.includes("$12.5") && x.texto.includes("2026-09")));
  assert.ok(l.some((x) => x.clave === "sin-saldos"));
  assert.ok(!l.some((x) => x.clave === "cuentas-sin-saldo"));
  assert.equal(l.filter((x) => x.texto === "Falta X").length, 1);
  assert.ok(l.some((x) => x.clave === "corte-abierto" && x.severidad === "alta"));
});
