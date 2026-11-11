import { test } from "node:test";
import assert from "node:assert/strict";
import { armarEerr, type FilaEerr } from "./eerr";
import {
  baseDiaria,
  capitalTrabajo,
  cascadaMes,
  cascadas,
  diasDelMes,
  difieren,
  economia,
  elegirPeriodo,
  evolucionCapital,
  libroDesdeEerr,
  ordenarPalancas,
  ventasPropias,
  palancas,
  rubroCostoVentas,
  sobreVentas,
  sumarCascadas,
  type LibroMes,
  type VentasMes,
} from "./rentabilidad";

// Datos inventados.
const libro = (periodo: string, unidad_id: string, x: Partial<LibroMes> = {}): LibroMes => ({
  periodo,
  unidad_id,
  ingresos: 10000,
  devoluciones: 0,
  mercancia: 3000,
  envio: 1000,
  otros_variables: 500,
  marketing: 2000,
  administracion: 1500,
  ...x,
});

const ventas = (periodo: string, unidad_id: string, x: Partial<VentasMes> = {}): VentasMes => ({
  periodo,
  unidad_id,
  ordenes: 500,
  enviadas: 450,
  entregadas: 300,
  ventas_entregadas: 9900,
  costo_mercancia: 2800,
  costo_envio: 980,
  lineas_producto: 320,
  lineas_con_costo: 320,
  ...x,
});

test("rubros del costo de ventas: envío, mercancía y otros", () => {
  assert.equal(rubroCostoVentas("Shipping por Ventas"), "envio");
  assert.equal(rubroCostoVentas("Shipping por Ventas Cambios"), "envio");
  assert.equal(rubroCostoVentas("Compra Mercancia Local"), "mercancia");
  assert.equal(rubroCostoVentas("COSTO DE VENTAS"), "mercancia");
  assert.equal(rubroCostoVentas("Importación - Envíos"), "mercancia");
  assert.equal(rubroCostoVentas("Otros gastos de importación"), "mercancia");
  assert.equal(rubroCostoVentas("Packaging"), "otros_variables");
  assert.equal(rubroCostoVentas("Costos de Plataforma comercial"), "otros_variables");
});

test("libro desde el EERR: los mismos escalones que la vista, todo en positivo", () => {
  const f = (tipo: string, seccion: string, signo: number, monto: number) => ({ periodo: "2026-05-01", unidad_id: "t1", tipo, seccion, signo, monto });
  const [l] = libroDesdeEerr([
    f("Ingresos", "ingresos", 1, 1000),
    f("Devoluciones", "ingresos", -1, 50),
    f("COSTO DE VENTAS", "costo_ventas", -1, 300),
    f("Shipping por Ventas", "costo_ventas", -1, 80),
    f("Packaging", "costo_ventas", -1, 20),
    f("Publicidad Online - FACEBOOK", "marketing", -1, 200),
    f("SUELDOS", "administracion", -1, 100),
    f("Interes ganados", "finanzas", 1, 999),
  ]);
  assert.deepEqual(
    { ...l },
    { periodo: "2026-05-01", unidad_id: "t1", ingresos: 1000, devoluciones: 50, mercancia: 300, envio: 80, otros_variables: 20, marketing: 200, administracion: 100 },
  );
});

test("ventas propias: una tienda sin ingresos en el libro se opera para un tercero", () => {
  const r = ventasPropias([ventas("2026-05-01", "t1"), ventas("2026-05-01", "t3")], [libro("2026-04-01", "t1"), libro("2026-05-01", "t3", { ingresos: 0 })]);
  assert.deepEqual(r.propias.map((v) => v.unidad_id), ["t1"]);
  assert.deepEqual(r.deTerceros, ["t3"]);
});

test("cascada con ventas: cada escalón de su fuente y los porcentajes sobre ventas", () => {
  const c = cascadaMes(ventas("2026-05-01", "t1"), libro("2026-05-01", "t1"));
  assert.equal(c.ventas.fuente, "ventas");
  assert.equal(c.ventas.valor, 9900);
  assert.equal(c.ventas.alterno, 10000);
  assert.equal(c.ventas.mesesDifieren, 0, "1 % de diferencia está dentro de la tolerancia");
  assert.equal(c.mercancia.fuente, "ventas");
  assert.equal(c.mercancia.valor, 2800);
  assert.equal(c.margenBruto, 9900 - 2800 - 500);
  assert.equal(c.envio.fuente, "ventas");
  assert.equal(c.contribucion, 9900 - 2800 - 500 - 980 - 2000);
  assert.equal(c.ebitda, c.contribucion - 1500);
  assert.equal(sobreVentas(c.contribucion, c)!.toFixed(2), ((100 * 3620) / 9900).toFixed(2));
});

test("cascada sin ventas: todo del libro y el EBITDA es el del EERR", () => {
  const l = libro("2026-05-01", "t1", { devoluciones: 200 });
  const c = cascadaMes(null, l);
  assert.equal(c.ventas.fuente, "libro");
  assert.equal(c.mercancia.fuente, "libro");
  assert.equal(c.envio.fuente, "libro");
  const fila = (seccion: FilaEerr["seccion"], tipo: string, signo: number, monto: number): FilaEerr => ({
    periodo: "2026-05-01",
    unidad_id: "t1",
    tipo,
    orden: 1,
    seccion,
    signo,
    monto,
  });
  const eerr = armarEerr(
    [
      fila("ingresos", "Ingresos", 1, 10000),
      fila("ingresos", "Devoluciones", -1, 200),
      fila("costo_ventas", "COSTO DE VENTAS", -1, 3000),
      fila("costo_ventas", "Shipping por Ventas", -1, 1000),
      fila("costo_ventas", "Packaging", -1, 500),
      fila("marketing", "Publicidad Online - FACEBOOK", -1, 2000),
      fila("administracion", "SUELDOS", -1, 1500),
    ],
    ["2026-05-01"],
  );
  assert.equal(c.ebitda, eerr.ebitda["2026-05-01"]);
  assert.equal(c.ventas.valor, 9800);
});

test("poca cobertura de costo: la mercancía sale del libro y queda marcada si difiere", () => {
  const c = cascadaMes(ventas("2026-05-01", "t1", { lineas_con_costo: 100, costo_mercancia: 900 }), libro("2026-05-01", "t1"));
  assert.equal(c.ventas.fuente, "ventas");
  assert.equal(c.mercancia.fuente, "libro");
  assert.equal(c.mercancia.valor, 3000);
  assert.equal(c.mercancia.alterno, 900);
  assert.equal(c.mercancia.mesesDifieren, 1);
});

test("diferencia entre fuentes: tolerancia relativa y absoluta", () => {
  assert.equal(difieren(1000, 1040), false);
  assert.equal(difieren(1000, 1100), true);
  assert.equal(difieren(100, 140), false, "menos de 50 dólares no se marca");
  assert.equal(difieren(1000, null), false);
});

test("varias tiendas y meses: fuente mixta, meses con datos y total que cuadra", () => {
  const meses = ["2026-04-01", "2026-05-01"];
  const { porTienda, porMes } = cascadas(
    [ventas("2026-05-01", "t1")],
    [libro("2026-04-01", "t1"), libro("2026-05-01", "t1"), libro("2026-05-01", "t2"), libro("2026-06-01", "t2")],
    meses,
  );
  const t1 = porTienda.get("t1")!;
  assert.equal(t1.meses, 2);
  assert.equal(t1.ventas.fuente, "mixta");
  assert.equal(t1.ventas.valor, 10000 + 9900);
  assert.equal(porTienda.get("t2")!.meses, 1, "junio queda fuera del período");
  const total = sumarCascadas([...porTienda.values()]);
  const totalMeses = sumarCascadas([...porMes.values()]);
  assert.equal(total.ebitda, totalMeses.ebitda);
  assert.equal(total.ebitda, t1.ebitda + porTienda.get("t2")!.ebitda);
});

test("economía unitaria y punto de equilibrio", () => {
  const c = cascadaMes(ventas("2026-05-01", "t1"), libro("2026-05-01", "t1"));
  const e = economia(c);
  assert.equal(e.tasaEntrega, 300 / 450);
  assert.equal(e.ticket, 33);
  assert.equal(e.costoEnvioPorEnviada!.toFixed(4), (980 / 450).toFixed(4));
  assert.equal(e.marketingPorEntregada!.toFixed(4), (2000 / 300).toFixed(4));
  assert.equal(e.contribucionPorEntregada!.toFixed(4), (3620 / 300).toFixed(4));
  assert.equal(e.equilibrioMes!.toFixed(2), (1500 / (3620 / 300)).toFixed(2));
  const perdida = economia(cascadaMes(ventas("2026-05-01", "t1", { ventas_entregadas: 4000 }), libro("2026-05-01", "t1")));
  assert.equal(perdida.equilibrioMes, null, "sin contribución por entrega no hay equilibrio");
  const sinOrdenes = economia(cascadaMes(null, libro("2026-05-01", "t1")));
  assert.equal(sinOrdenes.ticket, null);
  assert.equal(sinOrdenes.tasaEntrega, null);
});

test("palancas: EBITDA anual, valor con el múltiplo y orden por valor", () => {
  const c = cascadaMes(ventas("2026-05-01", "t1"), libro("2026-05-01", "t1"));
  const p = Object.fromEntries(palancas(c, 4).map((x) => [x.clave, x]));
  // Un mes: × 12.
  assert.equal(p.costo_envio.ebitdaAnual, 980 * 0.05 * 12);
  assert.equal(p.marketing.ebitdaAnual, 2000 * 0.1 * 12);
  assert.equal(p.ticket.ebitdaAnual, 9900 * 0.05 * 12);
  assert.equal(p.tasa_entrega.ebitdaAnual, Math.round(450 * 0.01 * (6600 / 300) * 12 * 100) / 100);
  assert.equal(p.ticket.valorEmpresa, p.ticket.ebitdaAnual * 4);
  const dos = sumarCascadas([c, cascadaMes(ventas("2026-06-01", "t1"), libro("2026-06-01", "t1"))]);
  dos.meses = 2;
  assert.equal(palancas(dos, 4).find((x) => x.clave === "marketing")!.ebitdaAnual, 4000 * 0.1 * 6);
  const orden = ordenarPalancas(new Map([["t1", c], ["t2", cascadaMes(null, libro("2026-05-01", "t2", { marketing: 0 }))]]), 4);
  for (let i = 1; i < orden.length; i++) assert.ok(orden[i - 1].valorEmpresa >= orden[i].valorEmpresa);
  assert.ok(orden.every((x) => x.valorEmpresa > 0));
  assert.equal(orden[0].clave, "ticket");
});

test("capital de trabajo: DSO, DPO, DIO y CCC sobre la base diaria", () => {
  assert.equal(diasDelMes("2026-02-01"), 28);
  assert.equal(diasDelMes("2026-07-01"), 31);
  const meses = ["2026-04-01", "2026-05-01", "2026-06-01"];
  const { porMes } = cascadas(
    meses.map((m) => ventas(m, "t1")),
    meses.map((m) => libro(m, "t1")),
    meses,
  );
  const base = baseDiaria(porMes, meses);
  assert.equal(base.dias, 30 + 31 + 30);
  assert.equal(base.ventasDia!.toFixed(4), ((9900 * 3) / 91).toFixed(4));
  assert.equal(base.costoDia!.toFixed(4), ((3300 * 3) / 91).toFixed(4));
  const s = { cxcCartera: 1000, cobrosPorDepositar: 500, efectivoRepartidores: 200, cxpCartera: 800, comprasAbiertas: 1200, inventario: 6000 };
  const k = capitalTrabajo(s, base);
  assert.equal(k.porCobrar, 1700);
  assert.equal(k.porPagar, 2000);
  assert.equal(k.dso!.toFixed(4), (1700 / base.ventasDia!).toFixed(4));
  assert.equal(k.dio!.toFixed(4), (6000 / base.costoDia!).toFixed(4));
  assert.equal(k.ccc!.toFixed(4), (k.dio! + k.dso! - k.dpo!).toFixed(4));
  assert.equal(k.capitalOperativo, 1700 + 6000 - 2000);
  const sinInv = capitalTrabajo({ ...s, inventario: null }, base);
  assert.equal(sinInv.dio, null);
  assert.equal(sinInv.ccc, null);
  assert.equal(sinInv.cccSinInventario!.toFixed(4), (k.dso! - k.dpo!).toFixed(4));
  const vacia = capitalTrabajo(s, baseDiaria(new Map(), meses));
  assert.equal(vacia.dso, null);
});

test("evolución: cartera al cierre sobre los 3 meses que terminan en cada mes", () => {
  const meses = ["2026-04-01", "2026-05-01", "2026-06-01"];
  const { porMes } = cascadas(meses.map((m) => ventas(m, "t1")), [], meses);
  const ev = evolucionCapital(porMes, [{ periodo: "2026-04-01", cxc: 330, cxp: 0 }, { periodo: "2026-06-01", cxc: 990, cxp: 50 }], meses);
  assert.deepEqual(ev.map((p) => p.periodo), ["2026-04-01", "2026-06-01"]);
  assert.equal(ev[0].dso!.toFixed(4), (330 / (9900 / 30)).toFixed(4));
  assert.equal(ev[1].dso!.toFixed(4), (990 / ((9900 * 3) / 91)).toFixed(4));
});

test("período: mes, últimos 3 y 12 meses cerrados", () => {
  const conDatos = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"];
  assert.deepEqual(elegirPeriodo(undefined, conDatos, "2026-10-01").meses, ["2026-07-01", "2026-08-01", "2026-09-01"]);
  assert.deepEqual(elegirPeriodo("u12", conDatos, "2026-10-01").meses, conDatos.slice(0, 4));
  assert.deepEqual(elegirPeriodo("2026-10-01", conDatos, "2026-10-01").meses, ["2026-10-01"]);
  assert.equal(elegirPeriodo("2025-01-01", conDatos, "2026-10-01").clave, "u3");
  assert.deepEqual(elegirPeriodo(undefined, ["2026-10-01"], "2026-10-01").meses, ["2026-10-01"]);
});
