import assert from "node:assert/strict";
import { test } from "node:test";
import type { InsumosBalance } from "./balance";
import { armarEerr, type FilaEerr } from "./eerr";
import {
  evaluarCovenant,
  leerUmbral,
  mesCovenant,
  peorEstado,
  primerIncumplimiento,
  proyectarCovenants,
  tendencias,
  valorIndicador,
  type MesCovenant,
  type PasoProyeccion,
  type ValoresCovenant,
} from "./covenants";

const base: ValoresCovenant = {
  deudaEbitda: 2.5,
  deudaEbitdaNoSignificativa: false,
  coberturaIntereses: 3,
  sinIntereses: false,
  liquidezCorriente: 1.3,
  capitalTrabajo: 50_000,
  patrimonio: 100_000,
};

test("evaluar: máximo y mínimo con margen de riesgo", () => {
  assert.equal(evaluarCovenant("deuda_ebitda_max", 3.5, base), "cumple");
  assert.equal(evaluarCovenant("deuda_ebitda_max", 2.7, base), "riesgo");
  assert.equal(evaluarCovenant("deuda_ebitda_max", 2, base), "incumple");
  assert.equal(evaluarCovenant("cobertura_min", 2, base), "cumple");
  assert.equal(evaluarCovenant("cobertura_min", 2.8, base), "riesgo");
  assert.equal(evaluarCovenant("cobertura_min", 3.5, base), "incumple");
  assert.equal(evaluarCovenant("liquidez_min", 1.2, base), "riesgo");
  assert.equal(evaluarCovenant("patrimonio_min", 80_000, base), "cumple");
  assert.equal(evaluarCovenant("capital_trabajo_min", 60_000, base), "incumple");
});

test("evaluar: casos borde", () => {
  assert.equal(evaluarCovenant("deuda_ebitda_max", 3, { ...base, deudaEbitda: null, deudaEbitdaNoSignificativa: true }), "incumple");
  assert.equal(evaluarCovenant("cobertura_min", 2, { ...base, coberturaIntereses: null, sinIntereses: true }), "cumple");
  assert.equal(evaluarCovenant("liquidez_min", 1, { ...base, liquidezCorriente: null }), "sin_dato");
  // Capital de trabajo mínimo negativo (se permite hasta −10 000).
  assert.equal(evaluarCovenant("capital_trabajo_min", -10_000, { ...base, capitalTrabajo: -5_000 }), "cumple");
  assert.equal(evaluarCovenant("capital_trabajo_min", -10_000, { ...base, capitalTrabajo: -9_500 }), "riesgo");
  assert.equal(valorIndicador("patrimonio_min", base), 100_000);
  assert.equal(peorEstado(["cumple", "riesgo", "sin_dato"]), "riesgo");
  assert.equal(peorEstado([]), "cumple");
});

test("leerUmbral", () => {
  assert.equal(leerUmbral("3,5"), 3.5);
  assert.equal(leerUmbral("2.5x"), 2.5);
  assert.equal(leerUmbral("$ 25000"), 25_000);
  assert.equal(leerUmbral(""), null);
  assert.equal(leerUmbral("1.2.3"), null);
  assert.equal(leerUmbral("abc"), null);
});

const meses = ["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"];
const filas: FilaEerr[] = meses.flatMap((m) => [
  { periodo: m, unidad_id: "u1", tipo: "VENTAS", orden: 1, seccion: "ingresos", signo: 1, monto: 10_000 },
  { periodo: m, unidad_id: "u1", tipo: "COSTO", orden: 2, seccion: "costo_ventas", signo: -1, monto: 6_000 },
  { periodo: m, unidad_id: "u1", tipo: "SUELDOS", orden: 3, seccion: "administracion", signo: -1, monto: 2_000 },
  { periodo: m, unidad_id: "u1", tipo: "INTERESES", orden: 4, seccion: "finanzas", signo: -1, monto: 500 },
]) as FilaEerr[];

const balance = (deuda: number, corriente: number): InsumosBalance => ({
  caja: [{ id: "c1", nombre: "Banco", saldo: 20_000 }],
  tarjetas: 0,
  cxc: 10_000,
  cxp: 15_000,
  bienesCosto: 0,
  bienesDepreciacion: 0,
  inventario: 30_000,
  partidas: [],
  aportesLibro: 0,
  utilidadAcumulada: 0,
  retiros: 0,
  deuda: [{ id: "d1", nombre: "Giro", saldo: deuda, corriente }],
});

test("mes de covenants: mismas fórmulas del paquete bancario", () => {
  const eerr = armarEerr(filas, meses);
  const m = mesCovenant("2026-09-01", eerr, 12, balance(48_000, 48_000), 50_000);
  assert.equal(m.insumos.ebitda, 24_000);
  assert.equal(m.insumos.intereses, 6_000);
  assert.equal(m.indicadores.deudaEbitda, 2);
  assert.equal(m.indicadores.coberturaIntereses, 4);
  // Activo corriente 60 000; pasivo corriente 15 000 + 48 000.
  assert.ok(Math.abs(m.indicadores.liquidezCorriente! - 60_000 / 63_000) < 1e-9);
  assert.equal(m.indicadores.capitalTrabajo, -3_000);
  assert.equal(m.deudaTesoreria, 48_000);
  assert.equal(m.valores.patrimonio, 50_000);
  assert.equal(m.interesesAproximados, false);
});

test("proyección: la deuda sigue su calendario y una oferta baja la deuda corriente", () => {
  const eerr = armarEerr(filas, meses);
  const m1 = mesCovenant("2026-08-01", eerr, 12, balance(48_000, 48_000), 48_000);
  const m2 = mesCovenant("2026-09-01", eerr, 12, balance(48_000, 48_000), 50_000);
  const t = tendencias([m1, m2]);
  assert.equal(t.patrimonio, 2_000);
  assert.equal(t.activoCorriente, 0);
  const hoy: PasoProyeccion[] = [1, 2, 3].map((k) => ({ fecha: `2026-1${k - 1}-28`, deuda: 48_000, deudaCorriente: 48_000, interesesAdelante: 6_000, cajaExtra: 0, patrimonioExtra: 0 }));
  const actual = proyectarCovenants(m2, t, hoy, 6_000);
  assert.equal(actual.length, 3);
  assert.equal(actual[0].indicadores.capitalTrabajo, -3_000);
  assert.equal(actual[2].patrimonio, 56_000);
  // Con una oferta a largo plazo: la deuda pasa a no corriente y bajan los intereses.
  const oferta = hoy.map((p) => ({ ...p, deudaCorriente: 10_000, interesesAdelante: 3_000, patrimonioExtra: 250 }));
  const con = proyectarCovenants(m2, t, oferta, 6_000);
  assert.ok(con[0].indicadores.liquidezCorriente! > 2);
  assert.equal(con[0].indicadores.coberturaIntereses, 8);
  assert.equal(primerIncumplimiento({ indicador: "capital_trabajo_min", umbral: 0 }, actual), "2026-10-28");
  assert.equal(primerIncumplimiento({ indicador: "capital_trabajo_min", umbral: 0 }, con), null);
});

test("tendencias con un solo corte: sin cambio", () => {
  const eerr = armarEerr(filas, meses);
  const m: MesCovenant = mesCovenant("2026-09-01", eerr, 12, balance(1, 1), null);
  assert.deepEqual(tendencias([m]), { patrimonio: 0, activoCorriente: 0, pasivoSinDeuda: 0 });
});
