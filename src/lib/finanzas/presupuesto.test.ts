import assert from "node:assert/strict";
import test from "node:test";
import { armarEerr, type FilaEerr } from "./eerr";
import {
  baseSensibilidad,
  comparar,
  compararConReal,
  generarLineas,
  leerMes,
  leerNumero,
  matrizSensibilidad,
  mesesCerradosConReal,
  proyectar,
  puedePasar,
  rangoMeses,
  repartir,
  repartirTotal,
  resumenAnual,
  serieDeEerr,
  serieDeLineas,
  serieVacia,
  sumaEn,
  supuestosDeFormulario,
  supuestosGuardados,
  supuestosPorDefecto,
  tendenciaMensual,
  type SerieSecciones,
} from "./presupuesto";

// Datos inventados: dos tiendas, tres meses base.
const BASE = ["2026-01-01", "2026-02-01", "2026-03-01"];
const ANIO = 2026;

function serie(ingresos: number[], costo: number[], admin: number[], mkt: number[], fin = [0, 0, 0]): SerieSecciones {
  const s = serieVacia(BASE);
  BASE.forEach((m, i) => {
    s.ingresos[m] = ingresos[i];
    s.costo_ventas[m] = costo[i];
    s.administracion[m] = admin[i];
    s.marketing[m] = mkt[i];
    s.finanzas[m] = fin[i];
  });
  return s;
}

const TIENDA_A = serie([600, 600, 600], [240, 240, 240], [60, 60, 60], [90, 90, 90], [10, 10, 10]);
const TIENDA_B = serie([400, 400, 400], [160, 160, 160], [40, 40, 40], [60, 60, 60]);
const REAL = new Map([
  ["a", TIENDA_A],
  ["b", TIENDA_B],
]);

test("meses: rango y lectura", () => {
  assert.deepEqual(rangoMeses("2025-11-01", "2026-02-01"), ["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
  assert.deepEqual(rangoMeses("2026-03-01", "2026-01-01"), []);
  assert.equal(leerMes("2026-07"), "2026-07-01");
  assert.equal(leerMes("2026-07-01"), "2026-07-01");
  assert.equal(leerMes("2026-13"), null);
  assert.equal(leerMes("julio"), null);
});

test("tendencia: crecimiento compuesto, con tope y sin datos", () => {
  assert.equal(tendenciaMensual([100, 110, 121, 133.1]), 10);
  assert.equal(tendenciaMensual([100, 105, 110.25]), 5);
  assert.equal(tendenciaMensual([100, 200, 400]), 10); // 100 % mensual se topa en 10
  assert.equal(tendenciaMensual([500]), 0);
  assert.equal(tendenciaMensual([0, 0, 0]), 0);
  assert.ok(tendenciaMensual([300, 250, 200]) < 0);
});

test("supuestos por defecto: base del real, conservador y optimista", () => {
  const consolidado = serie([1000, 1000, 1000], [400, 400, 400], [100, 100, 100], [150, 150, 150], [10, 10, 10]);
  const s = supuestosPorDefecto(consolidado, BASE);
  const b = s.escenarios.base;
  assert.equal(b.crecimientoMensual, 0);
  assert.equal(b.margenBruto, 60);
  assert.deepEqual(b.gastos.administracion, { modo: "pct", valor: 10 });
  assert.deepEqual(b.gastos.marketing, { modo: "pct", valor: 15 });
  assert.deepEqual(b.gastos.finanzas, { modo: "fijo", valor: 10 });
  // Conservador: sin crecimiento y costos 5 % más caros.
  const c = s.escenarios.conservador;
  assert.equal(c.crecimientoMensual, 0);
  assert.equal(c.margenBruto, 58); // 100 − 40 × 1,05
  assert.equal(c.gastos.administracion.valor, 10.5);
  // Optimista: tendencia (0) + 1 punto y costos 2 % más baratos.
  const o = s.escenarios.optimista;
  assert.equal(o.crecimientoMensual, 1);
  assert.equal(o.margenBruto, 60.8);
  assert.equal(o.gastos.marketing.valor, 14.7);
  // Modo fijo pedido para administración: el promedio mensual.
  const f = supuestosPorDefecto(consolidado, BASE, { administracion: "fijo" });
  assert.deepEqual(f.escenarios.base.gastos.administracion, { modo: "fijo", valor: 100 });
  assert.equal(f.escenarios.conservador.gastos.administracion.valor, 105);
});

test("sin ingresos en la base, todos los gastos son fijos", () => {
  const s = supuestosPorDefecto(serie([0, 0, 0], [0, 0, 0], [30, 30, 30], [0, 0, 0]), BASE);
  assert.deepEqual(s.escenarios.base.gastos.administracion, { modo: "fijo", valor: 30 });
});

test("proyectar: ancla el promedio en el mes del medio y aplica crecimiento e inflación", () => {
  const s = supuestosPorDefecto(serie([1000, 1000, 1000], [400, 400, 400], [100, 100, 100], [150, 150, 150]), BASE);
  const sup = { ...s.escenarios.base, crecimientoMensual: 10, inflacionAnual: 12, gastos: { ...s.escenarios.base.gastos, administracion: { modo: "fijo" as const, valor: 100 } } };
  const p = proyectar(sup, 1000, BASE, ["2026-02-01", "2026-03-01", "2027-02-01"]);
  assert.equal(p.ingresos["2026-02-01"], 1000); // febrero es el centro de ene–mar
  assert.equal(p.ingresos["2026-03-01"], 1100);
  assert.equal(p.costo_ventas["2026-03-01"], 440);
  assert.equal(p.marketing["2026-03-01"], 165);
  assert.equal(p.administracion["2026-02-01"], 100);
  assert.equal(p.administracion["2027-02-01"], 112); // un año después, +12 %
});

test("repartir: proporcional, suma exacta y sin base va al consolidado", () => {
  const r = repartir(100, new Map([["a", 1], ["b", 1], ["c", 1]]));
  assert.equal([...r.values()].reduce((a, b) => a + b, 0), 100);
  assert.equal(r.get("a"), 33.34); // la diferencia del redondeo, en la primera de las más grandes
  const sinBase = repartir(50, new Map([["a", 0]]));
  assert.deepEqual([...sinBase], [[null, 50]]);
  const conCero = repartir(10, new Map([["a", 3], ["b", 0]]));
  assert.deepEqual([...conCero], [["a", 10]]);
});

test("generar: consolidado y por tienda dan el mismo total", () => {
  const consolidado = serie([1000, 1000, 1000], [400, 400, 400], [100, 100, 100], [150, 150, 150], [10, 10, 10]);
  const sup = supuestosPorDefecto(consolidado, BASE);
  const unaSola = generarLineas(sup, REAL, ANIO, false);
  assert.equal(unaSola.length, 3 * 7 * 12);
  assert.ok(unaSola.every((l) => l.unidad_id === null));
  const porTienda = generarLineas(sup, REAL, ANIO, true);
  const meses = rangoMeses("2026-01-01", "2026-12-01");
  for (const esc of ["conservador", "base", "optimista"] as const) {
    const a = serieDeLineas(unaSola, esc, meses);
    const b = serieDeLineas(porTienda, esc, meses);
    for (const sec of ["ingresos", "costo_ventas", "administracion", "marketing", "finanzas"] as const) {
      assert.ok(Math.abs(sumaEn(a[sec], meses) - sumaEn(b[sec], meses)) < 0.02, `${esc} ${sec}`);
    }
  }
  // La tienda A tiene el 60 % de los ingresos y todas las finanzas.
  const base = serieDeLineas(porTienda, "base", meses, "a");
  assert.equal(base.ingresos["2026-05-01"], 600);
  assert.equal(base.finanzas["2026-05-01"], 10.05); // fijo, +2 % anual por 3 meses desde febrero
  assert.equal(serieDeLineas(porTienda, "base", meses, "b").finanzas["2026-05-01"], 0);
  // Base sin crecimiento: 12 meses × 1.000 de ingresos, EBITDA = 1000 − 400 − 100 − 150 = 350 por mes.
  const r = resumenAnual(serieDeLineas(unaSola, "base", meses), meses, 4);
  assert.equal(r.ingresos, 12000);
  assert.equal(r.ebitda, 4200);
  assert.equal(r.margenEbitda, 35);
  assert.equal(r.valorEmpresa, 16800);
  // Conservador < base < optimista.
  const ebitda = (e: "conservador" | "base" | "optimista") => resumenAnual(serieDeLineas(unaSola, e, meses), meses).ebitda;
  assert.ok(ebitda("conservador") < ebitda("base") && ebitda("base") < ebitda("optimista"));
});

test("repartir el total anual de una sección", () => {
  const meses = ["2026-01-01", "2026-02-01", "2026-03-01"];
  assert.deepEqual(repartirTotal({ "2026-01-01": 100, "2026-02-01": 200, "2026-03-01": 100 }, meses, 800), {
    "2026-01-01": 200,
    "2026-02-01": 400,
    "2026-03-01": 200,
  });
  assert.deepEqual(repartirTotal({}, meses, 100), { "2026-01-01": 33.33, "2026-02-01": 33.33, "2026-03-01": 33.34 });
});

test("comparar: en costos menos es favorable", () => {
  assert.deepEqual(comparar("ingresos", 110, 100), { real: 110, presupuesto: 100, diferencia: 10, pct: 10, favorable: true });
  assert.equal(comparar("ingresos", 90, 100).favorable, false);
  assert.equal(comparar("marketing", 90, 100).favorable, true);
  assert.equal(comparar("costo_ventas", 120, 100).favorable, false);
  assert.equal(comparar("ebitda", -50, -100).favorable, true);
  assert.equal(comparar("ebitda", -50, -100).pct, 50);
  assert.equal(comparar("marketing", 10, 0).pct, null);
  assert.equal(comparar("marketing", 100, 100).favorable, null);
});

test("presupuesto vs real por mes y acumulado", () => {
  const meses = ["2026-01-01", "2026-02-01"];
  const ppto = serieVacia(meses);
  const real = serieVacia(meses);
  for (const m of meses) {
    ppto.ingresos[m] = 1000;
    ppto.costo_ventas[m] = 400;
    ppto.marketing[m] = 100;
  }
  real.ingresos["2026-01-01"] = 1100;
  real.costo_ventas["2026-01-01"] = 450;
  real.marketing["2026-01-01"] = 80;
  real.ingresos["2026-02-01"] = 900;
  real.costo_ventas["2026-02-01"] = 360;
  real.marketing["2026-02-01"] = 100;
  const filas = compararConReal(ppto, real, meses);
  const fila = (c: string) => filas.find((f) => f.concepto === c)!;
  assert.equal(fila("ebitda").meses["2026-01-01"].real, 570);
  assert.equal(fila("ebitda").meses["2026-01-01"].presupuesto, 500);
  assert.equal(fila("ebitda").meses["2026-01-01"].favorable, true);
  assert.equal(fila("ebitda").meses["2026-02-01"].diferencia, -60);
  assert.equal(fila("ebitda").acumulado.diferencia, 10);
  assert.equal(fila("costo_ventas").acumulado.favorable, false); // 810 vs 800
  assert.equal(fila("marketing").acumulado.favorable, true);
});

test("serie del EERR: costos en positivo y sin dividendos", () => {
  const meses = ["2026-01-01"];
  const f = (tipo: string, seccion: FilaEerr["seccion"], signo: number, monto: number): FilaEerr => ({ periodo: meses[0], unidad_id: "a", tipo, orden: 1, seccion, signo, monto });
  const eerr = armarEerr(
    [
      f("VENTAS", "ingresos", 1, 1000),
      f("DEVOLUCIONES", "ingresos", -1, 50),
      f("MERCANCIA", "costo_ventas", -1, 300),
      f("META ADS", "marketing", -1, 100),
      f("RETIRO DE DIVIDENDOS", "otros", -1, 200),
      f("OTROS GASTOS", "otros", -1, 20),
    ],
    meses,
  );
  const s = serieDeEerr(eerr);
  assert.equal(s.ingresos[meses[0]], 950);
  assert.equal(s.costo_ventas[meses[0]], 300);
  assert.equal(s.marketing[meses[0]], 100);
  assert.equal(s.otros[meses[0]], 20);
});

test("meses cerrados con real", () => {
  const meses = rangoMeses("2026-01-01", "2026-12-01");
  assert.deepEqual(mesesCerradosConReal(meses, new Set(["2026-07-01", "2026-08-01", "2026-10-01"]), "2026-10-18"), ["2026-07-01", "2026-08-01"]);
});

test("sensibilidad: el centro es el EBITDA del año y los gastos variables siguen a las ventas", () => {
  const base = { ingresos: 1000, costoVentas: 400, gastoVariable: 100, gastoFijo: 200 };
  const m = matrizSensibilidad(base, [-10, 0, 10], [-2, 0, 2], 4);
  assert.equal(m[1][1].ebitda, 300); // 1000 × 60 % − 100 − 200
  assert.equal(m[1][1].valorEmpresa, 1200);
  assert.equal(m[2][1].ebitda, 350); // 1100 × 60 % − 110 − 200
  assert.equal(m[0][1].ebitda, 250);
  assert.equal(m[1][2].ebitda, 320); // +2 puntos de margen sobre 1000
  assert.equal(m[0][0].ebitda, 232); // 900 × 58 % − 90 − 200
  // Un EBITDA negativo no crea valor.
  const malo = matrizSensibilidad({ ingresos: 100, costoVentas: 90, gastoVariable: 0, gastoFijo: 50 }, [0], [0], 4);
  assert.equal(malo[0][0].ebitda, -40);
  assert.equal(malo[0][0].valorEmpresa, 0);
});

test("base de la sensibilidad según el modo de cada gasto", () => {
  const meses = ["2026-01-01"];
  const s = serieVacia(meses);
  s.ingresos[meses[0]] = 1000;
  s.costo_ventas[meses[0]] = 400;
  s.administracion[meses[0]] = 100;
  s.marketing[meses[0]] = 50;
  const sup = supuestosPorDefecto(s, meses, { administracion: "fijo" }).escenarios.base;
  assert.deepEqual(baseSensibilidad(s, meses, sup), { ingresos: 1000, costoVentas: 400, gastoVariable: 50, gastoFijo: 100 });
  assert.deepEqual(baseSensibilidad(s, meses), { ingresos: 1000, costoVentas: 400, gastoVariable: 150, gastoFijo: 0 });
});

test("supuestos del formulario: validan rangos y lo vacío queda por defecto", () => {
  const def = supuestosPorDefecto(serie([1000, 1000, 1000], [400, 400, 400], [100, 100, 100], [150, 150, 150]), BASE);
  const campos: Record<string, string> = { base_crecimiento: "2,5", base_margen: "55", optimista_marketing: "" };
  const r = supuestosDeFormulario((c) => campos[c], def);
  assert.ok("supuestos" in r);
  if ("supuestos" in r) {
    assert.equal(r.supuestos.escenarios.base.crecimientoMensual, 2.5);
    assert.equal(r.supuestos.escenarios.base.margenBruto, 55);
    assert.equal(r.supuestos.escenarios.optimista.gastos.marketing.valor, def.escenarios.optimista.gastos.marketing.valor);
    assert.deepEqual(supuestosGuardados(JSON.parse(JSON.stringify(r.supuestos))), r.supuestos);
  }
  assert.ok("error" in supuestosDeFormulario((c) => (c === "conservador_crecimiento" ? "80" : undefined), def));
  assert.ok("error" in supuestosDeFormulario((c) => (c === "base_administracion" ? "abc" : undefined), def));
  assert.equal(supuestosGuardados({ version: 2 }), null);
  assert.equal(supuestosGuardados(null), null);
});

test("números y estados", () => {
  assert.equal(leerNumero("1.234,5", 0, 1e6), null); // separador de miles no se acepta
  assert.equal(leerNumero("1234,5", 0, 1e6), 1234.5);
  assert.equal(leerNumero("-3", 0, 10), null);
  assert.ok(puedePasar("borrador", "aprobado"));
  assert.ok(puedePasar("aprobado", "cerrado"));
  assert.ok(puedePasar("aprobado", "borrador"));
  assert.ok(!puedePasar("borrador", "cerrado"));
  assert.ok(!puedePasar("cerrado", "borrador"));
});
