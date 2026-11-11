import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INDICADORES,
  configAGuardar,
  costoFinanciero,
  cumpleMeta,
  decisionesDelComite,
  defIndicador,
  diaDeCierre,
  ebitdaAjustado,
  esCostoFinanciero,
  esRetiroSocios,
  estadoCierre,
  interesesPorMes,
  leerConfigComite,
  limpiarTexto,
  progreso,
  semaforo,
  serieDio,
  serieEntrega,
  serieMargenEbitda,
  seriePauta,
  serieSinEstado,
  tasaContractual,
  ultimoValor,
  validarConfigComite,
  validarDecision,
  type Decision,
} from "./comite";
import { armarEerr, type FilaEerr } from "./eerr";
import type { FilaTiendaMes } from "./pauta";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("los 7 indicadores con sus metas de la propuesta", () => {
  assert.equal(INDICADORES.length, 7);
  assert.equal(defIndicador("margen_ebitda").meta, 28);
  assert.equal(defIndicador("pauta_ventas").meta, 22);
  assert.equal(defIndicador("tasa_entrega").meta, 60);
  assert.equal(defIndicador("dio").meta, 130);
  assert.equal(defIndicador("costo_financiero").meta, 30);
  assert.equal(defIndicador("pedidos_sin_estado").meta, 5);
  assert.equal(defIndicador("cierre_dia").meta, 10);
});

test("configuración: lectura con valores fuera de rango y validación del formulario", () => {
  const c = leerConfigComite({ metas: { margen_ebitda: "30", dio: 5000 }, partida: { dio: 180, cierre_dia: 12 }, tiendas_propias: [A, "x"] });
  assert.equal(c.metas.margen_ebitda, 30);
  assert.equal(c.metas.dio, 130);
  assert.equal(c.partida.dio, 180);
  assert.equal(c.partida.cierre_dia, null);
  assert.deepEqual(c.tiendasPropias, [A]);
  assert.deepEqual(leerConfigComite(configAGuardar(c)), c);

  const datos: Record<string, string> = Object.fromEntries(INDICADORES.map((d) => [`meta:${d.clave}`, String(d.meta)]));
  datos["partida:margen_ebitda"] = "12,5";
  datos.tiendas_elegidas = "1";
  const v = validarConfigComite((k) => datos[k], (k) => (k === "tienda" ? [A, "otro"] : []), [A, B]);
  assert.ok("config" in v);
  if ("config" in v) {
    assert.equal(v.config.partida.margen_ebitda, 12.5);
    assert.deepEqual(v.config.tiendasPropias, [A]);
  }
  assert.ok("error" in validarConfigComite((k) => ({ ...datos, "meta:dio": "" })[k], () => [], [A]));
  assert.ok("error" in validarConfigComite((k) => datos[k], () => [], [A]));
});

test("semáforo: en meta, mejorando contra la partida, fuera de meta y sin datos", () => {
  const margen = defIndicador("margen_ebitda");
  const pauta = defIndicador("pauta_ventas");
  const sinEstado = defIndicador("pedidos_sin_estado");
  assert.equal(semaforo(margen, 29, 28, null), "cumple");
  assert.equal(semaforo(margen, 20, 28, 15), "mejora");
  assert.equal(semaforo(margen, 14, 28, 15), "lejos");
  assert.equal(semaforo(margen, 26, 28, null), "mejora");
  assert.equal(semaforo(margen, 20, 28, null), "lejos");
  assert.equal(semaforo(pauta, 22, 22, null), "cumple");
  assert.equal(semaforo(pauta, 25, 22, 30), "mejora");
  assert.equal(semaforo(margen, null, 28, 15), "sin_datos");
  assert.equal(cumpleMeta(sinEstado, 5, 5), false);
  assert.equal(cumpleMeta(sinEstado, 4.9, 5), true);
  assert.equal(progreso(margen, 21.5, 28, 15), 50);
  assert.equal(progreso(pauta, 26, 22, 30), 50);
  assert.equal(progreso(margen, 21.5, 28, null), null);
});

const filaEerr = (p: Partial<FilaEerr>): FilaEerr => ({ periodo: "2026-09-01", unidad_id: A, tipo: "Ventas", orden: 1, seccion: "ingresos", signo: 1, monto: 0, ...p });

test("margen EBITDA ajustado: saca retiros de socios clasificados como gasto", () => {
  const e = armarEerr(
    [
      filaEerr({ monto: 1000 }),
      filaEerr({ tipo: "Mercancía", seccion: "costo_ventas", signo: -1, monto: 400 }),
      filaEerr({ tipo: "Retiro de socios", seccion: "administracion", signo: -1, monto: 100 }),
      filaEerr({ tipo: "Sueldos", seccion: "administracion", signo: -1, monto: 200 }),
      filaEerr({ tipo: "Dividendos", seccion: "otros", signo: -1, monto: 50 }),
    ],
    ["2026-09-01"],
  );
  assert.equal(e.ebitda["2026-09-01"], 300);
  assert.equal(ebitdaAjustado(e)["2026-09-01"], 400);
  assert.deepEqual(serieMargenEbitda(e, ["2026-09-01"]), [{ periodo: "2026-09-01", valor: 40 }]);
  assert.equal(esRetiroSocios("DIVIDENDOS"), true);
  assert.equal(esRetiroSocios("Sueldos"), false);
});

const ftm = (p: Partial<FilaTiendaMes>): FilaTiendaMes => ({
  periodo: "2026-09-01",
  unidadId: A,
  ordenes: 0,
  enviadas: 0,
  entregadas: 0,
  devueltas: 0,
  enTransito: 0,
  ventasEntregadas: 0,
  ventasTransito: 0,
  elegiblesEstado: 0,
  sinEstado: 0,
  marketingLibro: 0,
  gastoMeta: 0,
  ...p,
});

test("pauta, entrega y pedidos sin estado por mes, solo de las tiendas propias", () => {
  const filas = [
    ftm({ marketingLibro: 220, ventasEntregadas: 800, ventasTransito: 250, enviadas: 20, entregadas: 12, devueltas: 3, elegiblesEstado: 18, sinEstado: 1 }),
    ftm({ unidadId: B, marketingLibro: 999, ventasEntregadas: 1, enviadas: 10, entregadas: 1, elegiblesEstado: 2, sinEstado: 1 }),
  ];
  const [p] = seriePauta(filas, ["2026-09-01"], [A]);
  // Tasa de resolución 12 / 15 = 0,8 → ventas 800 + 250 × 0,8 = 1000.
  assert.equal(p.valor, 22);
  assert.equal(serieEntrega(filas, ["2026-09-01"], [A])[0].valor, 60);
  const s = serieSinEstado(filas, ["2026-09-01", "2026-10-01"]);
  assert.equal(s.serie[0].valor, 10);
  assert.equal(s.serie[1].valor, null);
  assert.equal(s.sinEstado["2026-09-01"], 2);
});

test("DIO: inventario al cierre ÷ costo por día de los 3 meses", () => {
  const costo = { "2026-07-01": 3100, "2026-08-01": 3100, "2026-09-01": 3000 };
  const [s] = serieDio(["2026-09-01"], { "2026-09-01": 9200 }, costo);
  // 92 días, 9 200 de costo → 100 por día → 92 días de inventario.
  assert.equal(Math.round(s.valor!), 92);
  assert.equal(serieDio(["2026-09-01"], { "2026-09-01": null }, costo)[0].valor, null);
});

test("costo financiero: intereses anualizados sobre deuda promedio, o qué falta", () => {
  assert.equal(esCostoFinanciero("Gastos Financieros - Intereses"), true);
  assert.equal(esCostoFinanciero("Gastos Financieros - FECI"), true);
  assert.equal(esCostoFinanciero("Amortización de Financiamiento"), false);
  assert.equal(esCostoFinanciero("Interes ganados"), false);
  const e = armarEerr(
    [
      filaEerr({ tipo: "Gastos Financieros - Intereses", seccion: "finanzas", signo: -1, monto: 250 }),
      filaEerr({ tipo: "Amortización de Financiamiento", seccion: "finanzas", signo: -1, monto: 1000 }),
      filaEerr({ tipo: "Interes ganados", seccion: "finanzas", signo: 1, monto: 10 }),
    ],
    ["2026-09-01"],
  );
  const int = interesesPorMes(e);
  assert.equal(int["2026-09-01"], 250);
  const c = costoFinanciero(["2026-09-01"], int, { "2026-08-01": 11000, "2026-09-01": 9000 });
  assert.equal(c.valor, 30);
  assert.equal(c.deudaPromedio, 10000);
  assert.match(costoFinanciero(["2026-09-01"], int, null).falta!, /Tesorería/);
  assert.match(costoFinanciero(["2026-09-01"], { "2026-09-01": 0 }, { "2026-09-01": 5000 }).falta!, /intereses/);
  assert.equal(Math.round(tasaContractual([{ saldo: 1000, tasaAnual: 0.2 }, { saldo: 1000, tasaAnual: 0.4 }, { saldo: 0, tasaAnual: 0.9 }])!), 30);
});

test("cierre: día del mes siguiente y estado contra el día límite", () => {
  assert.equal(diaDeCierre("2026-09-01", "2026-10-08"), 8);
  assert.equal(diaDeCierre("2026-09-01", "2026-11-05"), 36);
  assert.equal(diaDeCierre("2026-09-01", null), null);
  assert.equal(estadoCierre("2026-09-01", "2026-10-08", 10, "2026-10-20"), "a_tiempo");
  assert.equal(estadoCierre("2026-09-01", "2026-10-12", 10, "2026-10-20"), "tarde");
  assert.equal(estadoCierre("2026-09-01", null, 10, "2026-10-05"), "pendiente");
  assert.equal(estadoCierre("2026-09-01", null, 10, "2026-10-20"), "vencido");
  assert.deepEqual(ultimoValor([{ periodo: "2026-08-01", valor: 3 }, { periodo: "2026-09-01", valor: null }], "2026-09-01"), { periodo: "2026-08-01", valor: 3 });
});

test("acta: validación, texto simple y seguimiento de lo pendiente", () => {
  const ok = validarDecision((k) => ({ periodo: "2026-09-01", decision: "  Bajar la pauta\u0007 de NUVO  ", responsable: "AF4", fecha_compromiso: "2026-10-31" })[k]);
  assert.deepEqual(ok, { periodo: "2026-09-01", decision: "Bajar la pauta de NUVO", responsable: "AF4", fechaCompromiso: "2026-10-31" });
  assert.ok("error" in validarDecision((k) => ({ periodo: "2026-09-15", decision: "x" })[k]));
  assert.ok("error" in validarDecision((k) => ({ periodo: "2026-09-01", decision: "  " })[k]));
  assert.ok("error" in validarDecision((k) => ({ periodo: "2026-09-01", decision: "x", fecha_compromiso: "2026-02-30" })[k]));
  assert.equal(limpiarTexto("a\n\n\n\nb", 10), "a\n\nb");
  const d = (id: string, periodo: string, estado: Decision["estado"]): Decision => ({ id, periodo, decision: id, responsable: null, fechaCompromiso: null, estado, seguimiento: null, actualizadoEn: "" });
  const r = decisionesDelComite([d("a", "2026-07-01", "pendiente"), d("b", "2026-08-01", "hecha"), d("c", "2026-09-01", "pendiente"), d("e", "2026-10-01", "pendiente")], "2026-09-01");
  assert.deepEqual(r.delMes.map((x) => x.id), ["c"]);
  assert.deepEqual(r.seguimiento.map((x) => x.id), ["a"]);
});

test("pauta: un mes muy por debajo de lo habitual queda sin dato (pauta sin cargar)", async () => {
  const { descartarPautaIncompleta } = await import("./comite");
  const s = descartarPautaIncompleta([
    { periodo: "2026-06-01", valor: 40 },
    { periodo: "2026-07-01", valor: 38 },
    { periodo: "2026-08-01", valor: 27 },
    { periodo: "2026-09-01", valor: 0.3 },
    { periodo: "2026-10-01", valor: 20 },
  ]);
  assert.deepEqual(s.map((p) => p.valor), [40, 38, 27, null, 20]);
});
