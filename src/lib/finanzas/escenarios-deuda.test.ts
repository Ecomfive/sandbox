import assert from "node:assert/strict";
import { test } from "node:test";
import type { InsumosBalance } from "./balance";
import { mesCovenant, type Covenant } from "./covenants";
import type { FinanciamientoCiclo } from "./deuda";
import { armarEerr, type FilaEerr } from "./eerr";
import { alertaCovenant, evaluarCovenants } from "./escenarios-deuda";
import { instrumentosDeDeuda, type OfertaRefinanciamiento } from "./optimizar-deuda";

const HOY = "2026-10-26";
const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const meses = ["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"];
const filas = meses.flatMap((m) => [
  { periodo: m, unidad_id: "u1", tipo: "VENTAS", orden: 1, seccion: "ingresos", signo: 1, monto: 20_000 },
  { periodo: m, unidad_id: "u1", tipo: "COSTO", orden: 2, seccion: "costo_ventas", signo: -1, monto: 12_000 },
  { periodo: m, unidad_id: "u1", tipo: "SUELDOS", orden: 3, seccion: "administracion", signo: -1, monto: 4_000 },
  { periodo: m, unidad_id: "u1", tipo: "INTERESES", orden: 4, seccion: "finanzas", signo: -1, monto: 1_500 },
]) as FilaEerr[];
const giro: FinanciamientoCiclo = { id: ID(1), nombre: "Giro", acreedor: null, monto: 40_000, tasaCiclo: 0.2, diasCiclo: 70, fechaInicio: "2026-01-01", renovable: true };
const balance: InsumosBalance = {
  caja: [{ id: "c", nombre: "Banco", saldo: 15_000 }],
  tarjetas: 0,
  cxc: 10_000,
  cxp: 10_000,
  bienesCosto: 0,
  bienesDepreciacion: 0,
  inventario: 25_000,
  partidas: [],
  aportesLibro: 0,
  utilidadAcumulada: 0,
  retiros: 0,
  deuda: [{ id: ID(1), nombre: "Giro", saldo: 40_000, corriente: 40_000 }],
};
const mes = mesCovenant("2026-09-01", armarEerr(filas, meses), 12, balance, 40_000);
const instrumentos = instrumentosDeDeuda({ prestamos: [], lineas: [], ciclos: [giro] }, HOY);
const oferta: OfertaRefinanciamiento = {
  id: ID(7),
  banco: "Banco Ejemplo",
  nombre: "Oferta",
  monto: 40_000,
  plazoMeses: 48,
  tasaAnual: 0.12,
  comisionApertura: 0,
  graciaMeses: 0,
  garantias: null,
  fechaDesembolso: "2026-11-01",
  sustituye: [`ciclo:${ID(1)}`],
};

test("la liquidez incumple con el giro y cumple con la oferta a 48 meses", () => {
  const covenants: Covenant[] = [
    { id: ID(2), ambito: "general", refId: null, indicador: "liquidez_min", umbral: 1.2, nota: null },
    { id: ID(3), ambito: "oferta", refId: ID(7), indicador: "liquidez_min", umbral: 1.2, nota: null },
    { id: ID(4), ambito: "oferta", refId: ID(8), indicador: "liquidez_min", umbral: 1.2, nota: null },
  ];
  const e = evaluarCovenants(covenants, [mes], instrumentos, [oferta], HOY);
  // La oferta que no existe se descarta.
  assert.equal(e.length, 2);
  // 50 000 / 50 000 = 1.
  assert.equal(e[0].estado, "incumple");
  assert.equal(e[0].serie.length, 6);
  assert.ok(e[1].valor! > 1.5);
  assert.equal(e[1].estado, "cumple");
  // La cobertura mejora con la oferta: intereses programados mucho más bajos.
  const cob = evaluarCovenants([{ id: ID(5), ambito: "oferta", refId: ID(7), indicador: "cobertura_min", umbral: 3, nota: null }], [mes], instrumentos, [oferta], HOY)[0];
  assert.equal(cob.estado, "cumple");
});

test("alertas: incumplido es crítica, una oferta no alerta, lo que cumple no alerta", () => {
  const fmt = (v: number | null) => String(v);
  const m = (f: string) => f;
  const [general, deOferta] = evaluarCovenants(
    [
      { id: ID(2), ambito: "general", refId: null, indicador: "liquidez_min", umbral: 1.2, nota: null },
      { id: ID(3), ambito: "oferta", refId: ID(7), indicador: "liquidez_min", umbral: 1.2, nota: null },
    ],
    [mes],
    instrumentos,
    [oferta],
    HOY,
  );
  const a = alertaCovenant(general, "Toda la empresa", fmt, m)!;
  assert.equal(a.severidad, "critica");
  assert.ok(a.mensaje.startsWith("Covenant incumplido: "));
  assert.equal(a.clave, `cov:${ID(2)}`);
  assert.equal(alertaCovenant(deOferta, "Oferta", fmt, m), null);
  const holgado = evaluarCovenants([{ id: ID(6), ambito: "general", refId: null, indicador: "patrimonio_min", umbral: 1_000, nota: null }], [mes], instrumentos, [], HOY)[0];
  assert.equal(alertaCovenant(holgado, "Toda la empresa", fmt, m), null);
});
