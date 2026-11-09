import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPUESTOS_CERO,
  armarContinuo,
  diasDeRotacion,
  diferenciaApertura,
  escenarioDe,
  fotoDePlan,
  leerFoto,
  leerMotoresEditados,
  leerParametros,
  lineasPresupuesto,
  mesesDesde,
  motoresDelMes,
  motoresDesdeHistoria,
  motoresPromedio,
  ajusteDelLibro,
  ebitdaDeOrdenes,
  proyectarPlan,
  proyectarTienda,
  resumirPlan,
  totalesComparables,
  validarMotores,
  validarSupuestos,
  type Apertura,
  type EntradaPlan,
  type HistoriaMes,
  type Motores,
} from "./planificacion";

// Datos inventados.
const MOT: Motores = { pedidos: 1000, crecimiento: 0, ticket: 40, tasaEntrega: 80, costoMercancia: 30, envioPedido: 5, comision: 2, pauta: 20, fijos: 3000, ajusteLibro: 0 };
const APERTURA: Apertura = { corte: "2026-09-01", caja: 50_000, cxc: 8_000, inventario: 20_000, activoFijo: 10_000, otrosActivos: 1_000, cxp: 9_000, deuda: 15_000, otrosPasivos: 500, patrimonio: 64_000 };

const h = (periodo: string, x: Partial<HistoriaMes> = {}): HistoriaMes => ({
  periodo,
  unidadId: "t1",
  pedidos: 1000,
  ventas: 40_000,
  entregado: 32_000,
  mercancia: 9_600,
  envio: 4_000,
  devolucion: 1_000,
  comision: 640,
  marketing: 8_000,
  fijos: 3_000,
  ...x,
});

test("motores desde los últimos 3 meses reales", () => {
  const m = motoresDesdeHistoria([h("2026-05-01", { pedidos: 5000, ventas: 999_999 }), h("2026-07-01"), h("2026-08-01"), h("2026-09-01")], 12);
  assert.deepEqual(m, { pedidos: 1000, crecimiento: 5, ticket: 40, tasaEntrega: 80, costoMercancia: 30, envioPedido: 5, comision: 2, pauta: 20, fijos: 3000, ajusteLibro: 0 });
  assert.equal(motoresDesdeHistoria([]).ticket, 0);
});

test("lo editado manda y se valida", () => {
  assert.deepEqual(leerMotoresEditados({ ticket: "45", pauta: -3, otro: 1 }), { ticket: 45 });
  const ok = validarMotores((c) => ({ pedidos: "1200,4", ticket: "", pauta: "18" })[c]);
  assert.deepEqual(ok, { editados: { pedidos: 1200, pauta: 18 } });
  assert.ok("error" in validarMotores((c) => (c === "tasaEntrega" ? "120" : null)));
  assert.ok("error" in validarSupuestos((c) => (c === "diasCxc" ? "-1" : null)));
});

test("una tienda: ventas = pedidos × ticket, ingresos = ventas × entrega, contribución y EBITDA", () => {
  const [m] = proyectarTienda("t1", MOT, ["2026-10-01"]);
  assert.equal(m.ventas, 40_000);
  assert.equal(m.ingresos, 32_000);
  assert.equal(m.mercancia, 9_600);
  assert.equal(m.envio, 5_000);
  assert.equal(m.comision, 640);
  assert.equal(m.pauta, 8_000);
  assert.equal(m.contribucion, 8_760);
  assert.equal(m.ebitda, 5_760);
  const crece = proyectarTienda("t1", { ...MOT, crecimiento: 10 }, mesesDesde("2026-10-01", 3));
  assert.equal(crece[2].pedidos, 1210);
});

test("cambios de escenario: desde su mes y solo en su tienda", () => {
  const precio = escenarioDe("precio", { unidadId: "t1", desde: "2026-11-01", cambio: 10, respuesta: 1.5, nombre: "", pedidos: 0, ticket: 0, crecimiento: 0, fijos: 0, inversion: 0 }, MOT);
  assert.equal(precio.cambios.length, 2);
  assert.equal(precio.cambios[1].valor, -15);
  const meses = mesesDesde("2026-10-01", 2);
  const t1 = proyectarTienda("t1", MOT, meses, precio.cambios);
  assert.equal(t1[0].ventas, 40_000, "antes del cambio");
  assert.equal(t1[1].pedidos, 850);
  assert.equal(t1[1].ventas, 850 * 44);
  const t2 = proyectarTienda("t2", MOT, meses, precio.cambios);
  assert.equal(t2[1].ventas, 40_000, "otra tienda no cambia");
  // Los motores se acotan a su rango.
  assert.equal(motoresDelMes(MOT, "t1", "2026-10-01", [{ unidadId: null, motor: "tasaEntrega", modo: "pp", valor: 50, desde: "2026-10-01" }]).tasaEntrega, 100);
});

test("parámetros de escenario: se exige lo esencial", () => {
  assert.ok("error" in leerParametros("pauta", { desde: "2026-11" }));
  assert.ok("error" in leerParametros("tienda", { desde: "2026-11", pedidos: 0 }));
  const p = leerParametros("entrega", { desde: "2026-11", cambio: "3", unidadId: "no-es-uuid" });
  assert.ok(!("error" in p) && p.cambio === 3 && p.unidadId === null && p.desde === "2026-11-01");
});

const entrada = (x: Partial<EntradaPlan> = {}): EntradaPlan => ({
  meses: mesesDesde("2026-10-01", 18),
  tiendas: [{ id: "t1", nombre: "Tienda 1", motores: MOT }, { id: "t2", nombre: "Tienda 2", motores: { ...MOT, pedidos: 500, crecimiento: 2 } }],
  supuestos: { ...SUPUESTOS_CERO, diasCxc: 6, diasInventario: 45, diasCxp: 20, depreciacionMes: 300, capexMes: 200, dividendosMes: 1000, financierosMes: 150, fijosCorporativo: 2000, cajaMinima: 5000 },
  apertura: APERTURA,
  deudaProgramada: { "2026-10-01": 14_000, "2026-11-01": 13_000 },
  ...x,
});

test("el plan integrado cuadra: balance, flujo y caja", () => {
  const r = proyectarPlan(entrada());
  const dif = diferenciaApertura(APERTURA);
  let cajaPrev = APERTURA.caja;
  for (const m of r.consolidado) {
    assert.ok(Math.abs(m.diferencia - dif) < 0.05, `cuadra ${m.periodo}: ${m.diferencia} vs ${dif}`);
    assert.ok(Math.abs(cajaPrev + m.flujoNeto - m.caja) < 0.05, `flujo = Δcaja ${m.periodo}`);
    assert.ok(Math.abs(m.ebitda - (m.ingresos - m.costoVentas - m.marketing - m.administracion)) < 0.05);
    cajaPrev = m.caja;
  }
  // La deuda programada baja según Tesorería y luego se queda.
  assert.equal(r.consolidado[1].deudaProgramada, 13_000);
  assert.equal(r.consolidado[5].deudaProgramada, 13_000);
  assert.equal(r.tiendas.length, 2);
});

test("caja bajo el mínimo: se toma deuda de cobertura y el balance sigue cuadrando", () => {
  const perdida = entrada({ tiendas: [{ id: "t1", nombre: "T", motores: { ...MOT, pauta: 60 } }] });
  const r = proyectarPlan(perdida);
  assert.ok(r.consolidado.some((m) => m.deudaCobertura > 0));
  for (const m of r.consolidado) {
    assert.ok(m.caja >= perdida.supuestos.cajaMinima - 0.01);
    assert.ok(Math.abs(m.diferencia - diferenciaApertura(APERTURA)) < 0.05);
  }
  const res = resumirPlan(r.consolidado, 4);
  assert.ok(res.deudaCoberturaMaxima > 0);
  assert.ok(res.ebitda < 0);
});

test("impuesto sobre la utilidad acumulada del año: nunca negativo en el año", () => {
  const r = proyectarPlan(entrada({ supuestos: { ...entrada().supuestos, tasaImpuesto: 25 } }));
  const anio26 = r.consolidado.filter((m) => m.periodo.startsWith("2026"));
  const ebt = anio26.reduce((a, m) => a + m.ebitda - m.depreciacion - m.financieros, 0);
  const imp = anio26.reduce((a, m) => a + m.impuesto, 0);
  assert.ok(Math.abs(imp - Math.max(0, ebt) * 0.25) < 0.05);
});

test("tienda nueva: arranca en su mes con su inversión, y se resume contra la base", () => {
  const ref = motoresPromedio([MOT, { ...MOT, ticket: 60 }]);
  const esc = escenarioDe("pais", { unidadId: null, desde: "2027-01-01", cambio: 0, respuesta: 0, nombre: "País X", pedidos: 300, ticket: 0, crecimiento: 5, fijos: 4000, inversion: 20_000 }, ref);
  const base = proyectarPlan(entrada());
  const con = proyectarPlan(entrada(), esc);
  const nueva = con.tiendas.find((t) => t.nueva)!;
  assert.equal(nueva.meses[2].ventas, 0, "diciembre: todavía no abre");
  assert.equal(nueva.meses[3].pedidos, 300);
  assert.equal(con.consolidado[3].inversion, -(200 + 20_000));
  assert.ok(Math.abs(con.consolidado[17].diferencia - diferenciaApertura(APERTURA)) < 0.05);
  const rb = resumirPlan(base.consolidado, 4);
  const rc = resumirPlan(con.consolidado, 4);
  assert.ok(rc.cajaMinima < rb.cajaMinima);
  assert.equal(rb.valorEmpresa, Math.round(rb.ebitda * 4 * 100) / 100);
});

test("días de rotación", () => {
  assert.equal(diasDeRotacion(30_000, 15_000), 60);
  assert.equal(diasDeRotacion(null, 10), 0);
  assert.equal(diasDeRotacion(10, 0), 0);
  assert.equal(diasDeRotacion(1_000_000, 10), 365);
});

test("foto: se guarda y se vuelve a leer; el continuo compara contra el plan y la foto anterior", () => {
  const r = proyectarPlan(entrada());
  const foto = leerFoto(JSON.parse(JSON.stringify(fotoDePlan(r))))!;
  assert.equal(foto.consolidado.length, 18);
  assert.equal(foto.tiendas[0].meses[0].ventas, 40_000);
  assert.equal(leerFoto({ consolidado: "x" }), null);
  const reales = [{ periodo: "2026-09-01", ventas: 55_000, ingresos: 44_000, ebitda: 5_000, caja: 50_000 }];
  const filas = armarContinuo(reales, r.consolidado.slice(0, 3), foto, null);
  assert.equal(filas.length, 4);
  assert.equal(filas[0].real, true);
  assert.equal(filas[0].plan, null);
  assert.equal(filas[1].plan?.ingresos, r.consolidado[0].ingresos);
  const t = totalesComparables(filas, "plan", "ebitda")!;
  assert.equal(t.actual, t.contra);
  assert.equal(totalesComparables(filas, "anterior", "ebitda"), null);
});

test("del plan al presupuesto: tiendas por sección y el corporativo con lo suyo", () => {
  const r = proyectarPlan(entrada({ meses: mesesDesde("2027-01-01", 2) }));
  const l = lineasPresupuesto(r.tiendas, r.consolidado, "corp");
  const t1ene = l.filter((x) => x.unidadId === "t1" && x.periodo === "2027-01-01");
  assert.deepEqual(t1ene.map((x) => x.seccion), ["ingresos", "costo_ventas", "administracion", "marketing"]);
  assert.equal(t1ene.find((x) => x.seccion === "costo_ventas")?.monto, 9_600 + 5_000 + 640);
  assert.equal(l.find((x) => x.unidadId === "corp" && x.seccion === "administracion")?.monto, 2000);
  // El EBITDA del presupuesto = el del plan.
  const efecto = l.filter((x) => x.periodo === "2027-01-01" && ["ingresos", "costo_ventas", "administracion", "marketing"].includes(x.seccion)).reduce((a, x) => a + (x.seccion === "ingresos" ? x.monto : -x.monto), 0);
  assert.ok(Math.abs(efecto - r.consolidado[0].ebitda) < 0.05);
  assert.equal(lineasPresupuesto(r.tiendas, r.consolidado, null).some((x) => x.unidadId === "corp"), false);
});

test("otros del libro: el primer mes proyectado parte del EBITDA real del EERR", () => {
  // EBITDA de las órdenes de h(): 32000 − 9600 − 4000 − 1000 − 640 − 8000 − 3000 = 5760.
  assert.equal(ebitdaDeOrdenes(h("2026-09-01")), 5_760);
  const meses = [h("2026-07-01", { ebitdaLibro: 4_760 }), h("2026-08-01", { ebitdaLibro: 3_760 }), h("2026-09-01", { ebitdaLibro: 5_760 })];
  const ajuste = ajusteDelLibro(meses);
  assert.equal(ajuste, -1_000);
  const m = motoresDesdeHistoria(meses, 0);
  assert.equal(m.ajusteLibro, -1_000);
  const [primero] = proyectarTienda("t1", m, ["2026-10-01"]);
  const realPromedio = (4_760 + 3_760 + 5_760) / 3;
  assert.ok(Math.abs(primero.ebitda - realPromedio) < 0.05);
  // Sin dato del libro no se ajusta; un mes sin dato no cuenta en el promedio.
  assert.equal(ajusteDelLibro([h("2026-09-01")]), 0);
  assert.equal(ajusteDelLibro([h("2026-08-01", { ebitdaLibro: null }), h("2026-09-01", { ebitdaLibro: 6_760 })]), 1_000);
  // Una tienda nueva no hereda el ajuste.
  assert.equal(motoresPromedio([m]).ajusteLibro, 0);
});

test("otros del libro en el consolidado y en el presupuesto", () => {
  const entrada: EntradaPlan = { meses: ["2026-10-01"], tiendas: [{ id: "t1", nombre: "T1", motores: { ...MOT, ajusteLibro: -500 } }], supuestos: SUPUESTOS_CERO, apertura: APERTURA, deudaProgramada: {} };
  const r = proyectarPlan(entrada);
  const c = r.consolidado[0];
  assert.equal(c.otrosLibro, -500);
  assert.ok(Math.abs(c.ebitda - (c.ingresos - c.costoVentas - c.marketing - c.administracion + c.otrosLibro)) < 0.05);
  const l = lineasPresupuesto(r.tiendas, r.consolidado, null);
  assert.equal(l.find((x) => x.seccion === "administracion")?.monto, 3_500);
  const positivo = proyectarPlan({ ...entrada, tiendas: [{ id: "t1", nombre: "T1", motores: { ...MOT, ajusteLibro: 700 } }] });
  const lp = lineasPresupuesto(positivo.tiendas, positivo.consolidado, null);
  assert.equal(lp.filter((x) => x.seccion === "ingresos").length, 1);
  assert.equal(lp.find((x) => x.seccion === "ingresos")?.monto, 32_700);
});
