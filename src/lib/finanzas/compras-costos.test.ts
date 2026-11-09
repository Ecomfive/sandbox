import assert from "node:assert/strict";
import { test } from "node:test";
import {
  armarReorden,
  costoPuestoCompras,
  leerAnticipo,
  lineasGastosImportacion,
  lineasPresupuestoCompras,
  lunesDelMes,
  porPagarProveedores,
  presupuestoCompras,
  presupuestoDesdeLineas,
  validarGasto,
  validarPresupuesto,
  variacionCostos,
  type CompraFin,
  type GastoImportacion,
  type ItemCompra,
} from "./compras-costos";

const compra = (o: Partial<CompraFin>): CompraFin => ({
  id: "c1",
  codigo: "OC-0001",
  nombre: "Compra de prueba",
  proveedor: "Proveedor X",
  etapa: "tracking",
  estado: "en_gestion",
  via: "mar",
  montoTotal: 1000,
  primerPago: 500,
  segundoPago: null,
  pagadoAProveedor: null,
  fechaPago1: "2026-09-01",
  fechaPago2: "2026-11-10",
  fechaEnvio: "2026-09-20",
  fechaLimite: null,
  fechaLlegada: null,
  qtyTotal: 100,
  skuId: null,
  creada: "2026-08-25",
  ...o,
});

const gasto = (o: Partial<GastoImportacion>): GastoImportacion => ({ id: "g1", compraId: "c1", concepto: "flete", monto: 200, fecha: null, pagado: false, nota: null, ...o });
const item = (o: Partial<ItemCompra>): ItemCompra => ({ compraId: "c1", skuId: "a", codigo: "A", producto: "A", cantidad: 60, recibida: null, costoUnitario: 10, ...o });

test("validarGasto y validarPresupuesto", () => {
  assert.deepEqual(validarGasto({ concepto: "aduana", monto: "150,5", fecha: "2026-10-01", pagado: true, nota: " ok " }), {
    concepto: "aduana",
    monto: 150.5,
    fecha: "2026-10-01",
    pagado: true,
    nota: "ok",
  });
  assert.ok("error" in validarGasto({ concepto: "x", monto: 1 }));
  assert.ok("error" in validarGasto({ concepto: "flete", monto: 0 }));
  assert.ok("error" in validarGasto({ concepto: "flete", monto: 5, fecha: "ayer" }));
  assert.deepEqual(validarPresupuesto({ mes: "2026-11-01", monto: "10,000" }), { mes: "2026-11-01", monto: 10000 });
  assert.deepEqual(validarPresupuesto({ mes: "2026-11-01", monto: "" }), { mes: "2026-11-01", monto: null });
  assert.ok("error" in validarPresupuesto({ mes: "2026-11-15", monto: 1 }));
});

test("costoPuestoCompras reparte los gastos por FOB y compara con el vigente", () => {
  const r = costoPuestoCompras(
    [compra({})],
    [item({}), item({ skuId: "b", codigo: "B", producto: "B", cantidad: 40, costoUnitario: 10 })],
    [gasto({}), gasto({ id: "g2", concepto: "aduana", monto: 100, pagado: true })],
    new Map([["a", 12]]),
  );
  assert.equal(r.length, 1);
  const c = r[0];
  assert.equal(c.fob, 1000);
  assert.equal(c.gastos, 300);
  assert.equal(c.total, 1300);
  assert.equal(c.unidades, 100);
  assert.equal(c.unitarioReal, 13);
  assert.equal(c.gastosPendientes, 200);
  assert.equal(c.pesoGastos, 0.3);
  const a = c.lineas.find((l) => l.skuId === "a")!;
  assert.equal(a.fob, 600);
  assert.equal(a.gastos, 180);
  assert.equal(a.unitarioReal, 13);
  assert.equal(a.diferencia, 0.0833);
  assert.equal(c.unitarioVigente, 12);
});

test("costoPuestoCompras sin productos usa el producto de la compra", () => {
  const r = costoPuestoCompras([compra({ skuId: "z", qtyTotal: 50 })], [], [], new Map([["z", 20]]), new Map([["z", { codigo: "Z", producto: "Zeta" }]]));
  assert.equal(r[0].unitarioReal, 20);
  assert.equal(r[0].lineas[0].codigo, "Z");
  assert.equal(r[0].diferencia, 0);
});

test("variacionCostos marca la suba por encima del umbral", () => {
  const v = variacionCostos(
    [
      { productoClave: "p", producto: "P", codigo: "P1", skuId: null, fecha: "2026-01-01", costo: 10 },
      { productoClave: "p", producto: "P", codigo: null, skuId: "s", fecha: "2026-05-01", costo: 11 },
      { productoClave: "p", producto: "P", codigo: null, skuId: null, fecha: "2026-09-01", costo: 12.5 },
      { productoClave: "q", producto: "Q", codigo: null, skuId: null, fecha: "2026-09-01", costo: 5 },
    ],
    0.1,
  );
  assert.equal(v[0].productoClave, "p");
  assert.equal(v[0].variacion, 0.1364);
  assert.equal(v[0].alerta, true);
  assert.equal(v[0].variacionTotal, 0.25);
  assert.equal(v[0].codigo, "P1");
  assert.equal(v[0].skuId, "s");
  assert.equal(v[1].variacion, null);
});

test("porPagarProveedores: segundo pago con su fecha y gastos sin pagar", () => {
  const p = porPagarProveedores([compra({}), compra({ id: "c2", estado: "completado" })], [gasto({ fecha: "2026-10-01" }), gasto({ id: "g3", pagado: true })], "2026-10-23");
  assert.equal(p.length, 2);
  const g = p.find((x) => x.tipo === "gasto")!;
  assert.equal(g.fecha, "2026-10-23");
  assert.equal(g.vencido, true);
  const c = p.find((x) => x.tipo === "compra")!;
  assert.equal(c.monto, 500);
  assert.equal(c.fecha, "2026-11-10");
  assert.equal(c.concepto, "Segundo pago");
});

test("presupuesto: comprometido por mes, planificado en la proyección y gastos por semana", () => {
  const porPagar = porPagarProveedores([compra({})], [gasto({ fecha: "2026-11-03" })], "2026-10-23");
  const meses = presupuestoCompras(["2026-10-01", "2026-11-01"], new Map([["2026-11-01", 2000]]), porPagar, "2026-10-23");
  assert.equal(meses[0].presupuesto, null);
  assert.equal(meses[1].comprometido, 700);
  assert.equal(meses[1].disponible, 1300);
  const semanas = ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"];
  const gastos = lineasGastosImportacion(porPagar, "2026-10-23", semanas);
  assert.equal(gastos.length, 1);
  assert.equal(gastos[0].valores[2], 200);
  const desdeLineas = presupuestoDesdeLineas(new Map([["2026-11-01", 2000]]), gastos, semanas, "2026-10-23");
  const nov = desdeLineas.find((m) => m.mes === "2026-11-01")!;
  assert.equal(nov.planificado, 1800);
  const lineas = lineasPresupuestoCompras(desdeLineas, semanas, "2026-10-23");
  assert.equal(lineas.length, 1);
  assert.equal(lunesDelMes("2026-11-01"), 5);
  assert.equal(lineas[0].valores[2], 360);
  assert.equal(lineas[0].valores[0], 0);
});

test("leerAnticipo convierte la fila de la función", () => {
  const a = leerAnticipo({ compra_id: "c", codigo: "OC", nombre: "N", proveedor: null, etapa: "tracking", monto_total: "100", pagado: "50", gastos_pagados: 5, anticipo: "55", fecha_envio: "2026-10-01", fecha_llegada: null });
  assert.equal(a.anticipo, 55);
  assert.equal(a.montoTotal, 100);
  assert.equal(a.fechaLlegada, null);
});

test("armarReorden: en camino y plazo por la vía de la última compra", () => {
  const compras = [
    compra({ id: "h1", estado: "completado", etapa: "completado", via: "aire", fechaPago1: "2026-01-01", fechaEnvio: "2026-01-11", fechaLlegada: "2026-01-21", creada: "2026-01-01" }),
    compra({ id: "h2", estado: "completado", etapa: "completado", via: "aire", fechaPago1: "2026-02-01", fechaEnvio: "2026-02-11", fechaLlegada: "2026-02-21", creada: "2026-02-01" }),
    compra({ id: "h3", estado: "completado", etapa: "completado", via: "aire", fechaPago1: "2026-03-01", fechaEnvio: "2026-03-11", fechaLlegada: "2026-03-21", creada: "2026-03-01" }),
    compra({ id: "abierta", creada: "2026-09-01" }),
  ];
  const items = [item({ compraId: "h3", skuId: "a" }), item({ compraId: "abierta", skuId: "b", cantidad: 30, recibida: 10 })];
  const r = armarReorden(compras, items, "PA", "2026-10-23");
  assert.equal(r.enCamino.get("b"), 20);
  assert.equal(r.enCamino.get("a"), undefined);
  const pa = r.plazo("a");
  assert.equal(pa.via, "aire");
  assert.equal(pa.transito, 10);
  assert.equal(pa.produccion, 10);
  assert.equal(pa.dias, 20);
  assert.equal(r.plazo("b").via, "mar");
});
