import assert from "node:assert/strict";
import { test } from "node:test";
import type { CompraFin, PlazoProducto } from "./compras-costos";
import {
  ajustarCantidad,
  armarPlan,
  calendarioPagos,
  CONFIG_PLAN_PREDETERMINADA,
  demandaDiaria,
  demandaPorRitmo,
  demandaPorPronostico,
  leerConfigPlan,
  llegadasEnCamino,
  mesesPlan,
  presupuestoDesdePlan,
  tendenciaMensual,
  validarConfigPlan,
  validarLoteProducto,
  type DemandaProyectada,
  type EntradaPlan,
} from "./plan-compras";

const PLAZO: PlazoProducto = { dias: 60, via: "mar", produccion: 15, transito: 45 };
const HOY = "2026-03-01";

test("mesesPlan arranca en el mes de hoy y cruza el año", () => {
  assert.deepEqual(mesesPlan("2026-11-20", 3), ["2026-11-01", "2026-12-01", "2027-01-01"]);
});

test("tendencia: sin ventas suficientes es plana; con tope", () => {
  assert.equal(tendenciaMensual({ v90: 10, v30: 10 }), 0);
  assert.equal(tendenciaMensual({ v90: 90, v30: 30 }), 0);
  assert.equal(tendenciaMensual({ v90: 90, v30: 60 }), 0.15); // (2 − 1) / 2 = 0.5 → tope
  assert.equal(tendenciaMensual({ v90: 90, v30: 24 }), -0.1);
});

test("demanda por ritmo: el primer mes cuenta los días que faltan", () => {
  const d = demandaPorRitmo(new Map([["a", { v90: 90, v30: 30 }]]), ["2026-03-01", "2026-04-01"], "2026-03-22");
  assert.deepEqual(d.porProducto.get("a"), [10, 30]);
  assert.equal(d.fuente, "ritmo");
  const diaria = demandaDiaria(d.porProducto.get("a")!, d.meses, "2026-03-22");
  assert.equal(diaria.length, 10 + 30);
  assert.ok(Math.abs(diaria[0] - 1) < 1e-9);
});

test("lote mínimo y múltiplo redondean hacia arriba", () => {
  assert.equal(ajustarCantidad(37.2, 0, 1), 38);
  assert.equal(ajustarCantidad(37, 100, 1), 100);
  assert.equal(ajustarCantidad(130, 100, 50), 150);
});

test("llegadas: compras abiertas con su fecha estimada; las de cotizar no cuentan", () => {
  const base: CompraFin = {
    id: "c1", codigo: "OC-1", nombre: "x", proveedor: null, etapa: "transito", estado: "en_gestion", via: "mar", montoTotal: 100,
    primerPago: null, segundoPago: null, pagadoAProveedor: null, fechaPago1: null, fechaPago2: null, fechaEnvio: "2026-02-20",
    fechaLimite: null, fechaLlegada: null, qtyTotal: 50, skuId: "a", creada: "2026-02-01",
  };
  const ll = llegadasEnCamino(
    [base, { ...base, id: "c2", etapa: "cotizar" }, { ...base, id: "c3", fechaLlegada: "2026-02-25" }],
    [],
    () => PLAZO,
    HOY,
  );
  assert.deepEqual(ll.get("a"), [{ fecha: "2026-04-06", unidades: 50, compra: "OC-1" }]);
});

test("una fecha estimada que ya pasó se supone en 7 días", () => {
  const c: CompraFin = {
    id: "c1", codigo: "OC-1", nombre: "x", proveedor: null, etapa: "transito", estado: "en_gestion", via: "mar", montoTotal: 100,
    primerPago: null, segundoPago: null, pagadoAProveedor: null, fechaPago1: null, fechaPago2: null, fechaEnvio: null,
    fechaLimite: null, fechaLlegada: "2026-02-01", qtyTotal: 5, skuId: "a", creada: "2025-12-01",
  };
  // fechaLlegada pasada pero ≤ hoy cuenta como llegada: no se incluye.
  assert.equal(llegadasEnCamino([c], [], () => PLAZO, HOY).size, 0);
  const sinFecha = { ...c, fechaLlegada: null };
  assert.equal(llegadasEnCamino([sinFecha], [], () => PLAZO, HOY).get("a")![0].fecha, "2026-03-08");
});

function demandaPlana(porDia: number, meses: string[]): DemandaProyectada {
  const u = meses.map((m, k) => {
    const dias = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
    return porDia * (k === 0 ? dias - Number(HOY.slice(8, 10)) + 1 : dias);
  });
  return { meses, porProducto: new Map([["a", u]]), fuente: "ritmo", nota: "" };
}

const entrada = (e: Partial<EntradaPlan> = {}): EntradaPlan => ({
  skuId: "a", codigo: "A1", producto: "Producto A", stock: 0, costoUnitario: 2, plazo: PLAZO, llegadas: [], lote: null, ...e,
});

test("plan: sin stock la primera orden es hoy y queda atrasada", () => {
  const meses = mesesPlan(HOY, 6);
  const r = armarPlan([entrada()], demandaPlana(10, meses), { seguridadDias: 14, coberturaDias: 60 }, CONFIG_PLAN_PREDETERMINADA, HOY);
  assert.ok(r.ordenes.length >= 2);
  const o = r.ordenes[0];
  assert.equal(o.fechaPedido, HOY);
  assert.equal(o.atrasada, true);
  assert.equal(o.fechaLlegada, "2026-04-30");
  assert.equal(o.fechaEnvio, "2026-03-16");
  // Anticipo 30 % al pedir y saldo al envío.
  assert.equal(o.anticipo, Math.round(o.monto! * 0.3 * 100) / 100);
  assert.equal(o.fechaSaldo, o.fechaEnvio);
  assert.equal(r.productos[0].quiebre, HOY);
});

test("plan: con stock suficiente la orden se pide un plazo antes de bajar a la seguridad", () => {
  const meses = mesesPlan(HOY, 6);
  const r = armarPlan([entrada({ stock: 1000 })], demandaPlana(10, meses), { seguridadDias: 10, coberturaDias: 30 }, CONFIG_PLAN_PREDETERMINADA, HOY);
  // 1000 unidades a 10/día; seguridad 100 → falta el día 90 (stock 90 < 100); pedido el día 30.
  const o = r.ordenes[0];
  assert.equal(o.atrasada, false);
  assert.equal(o.fechaPedido, "2026-03-31");
  assert.equal(o.fechaLlegada, "2026-05-30");
  // Tras las órdenes nunca baja de la seguridad dentro del plan.
  assert.ok(r.productos[0].stockFinal >= 100 - 1);
});

test("plan: el lote mínimo del producto manda y un producto excluido no sale", () => {
  const meses = mesesPlan(HOY, 3);
  const r = armarPlan([entrada({ stock: 0, lote: { loteMinimo: 5000, multiplo: 1, excluir: false } })], demandaPlana(1, meses), { seguridadDias: 0, coberturaDias: 30 }, CONFIG_PLAN_PREDETERMINADA, HOY);
  assert.equal(r.ordenes.length, 1);
  assert.equal(r.ordenes[0].cantidad, 5000);
  const ex = armarPlan([entrada({ lote: { loteMinimo: 0, multiplo: 1, excluir: true } })], demandaPlana(1, meses), { seguridadDias: 0, coberturaDias: 30 }, CONFIG_PLAN_PREDETERMINADA, HOY);
  assert.equal(ex.ordenes.length, 0);
});

test("sin costo la orden va sin monto y se cuenta", () => {
  const meses = mesesPlan(HOY, 3);
  const r = armarPlan([entrada({ costoUnitario: null })], demandaPlana(1, meses), { seguridadDias: 0, coberturaDias: 30 }, CONFIG_PLAN_PREDETERMINADA, HOY);
  assert.equal(r.sinCosto, 1);
  assert.equal(r.ordenes[0].monto, null);
  assert.equal(r.productos[0].monto, null);
});

test("calendario: pagos por el mes en que caen y lo que queda después del plan", () => {
  const meses = ["2026-03-01", "2026-04-01"];
  const o = {
    clave: "x", skuId: "a", codigo: "A", producto: "A", via: "mar", fechaPedido: "2026-03-10", fechaEnvio: "2026-04-10", fechaLlegada: "2026-05-20",
    cantidad: 10, necesaria: 10, costoUnitario: 10, monto: 100, anticipo: 30, fechaAnticipo: "2026-03-10", saldo: 70, fechaSaldo: "2026-04-10", atrasada: false, diasTarde: 0,
  };
  const { meses: m, despues } = calendarioPagos([o, { ...o, clave: "y", fechaSaldo: "2026-06-01" }], meses);
  assert.equal(m[0].anticipos, 60);
  assert.equal(m[1].saldos, 70);
  assert.equal(m[0].pagos, 60);
  assert.equal(despues, 70);
  assert.deepEqual(presupuestoDesdePlan(m, new Map([["2026-04-01", 500]])), [
    { mes: "2026-03-01", monto: 60 },
    { mes: "2026-04-01", monto: 570 },
  ]);
});

test("configuración y lote: valores fuera de rango caen al predeterminado o dan error", () => {
  assert.deepEqual(leerConfigPlan({ meses: 40, anticipo_pct: 50, saldo_al: "llegada" }), { meses: 6, anticipoPct: 50, saldoAl: "llegada", loteMinimo: 0 });
  const ok = validarConfigPlan((c) => ({ meses: "6", anticipoPct: "30", loteMinimo: "0", saldoAl: "envio" })[c]);
  assert.ok("config" in ok);
  assert.ok("error" in validarConfigPlan((c) => ({ meses: "1", anticipoPct: "30", loteMinimo: "0", saldoAl: "envio" })[c]));
  assert.ok("error" in validarLoteProducto({ loteMinimo: 10, multiplo: 0 }));
  assert.deepEqual(validarLoteProducto({ loteMinimo: "100", multiplo: "12", excluir: true }), { loteMinimo: 100, multiplo: 12, excluir: true });
});

test("demanda desde el pronóstico: pedidos por tienda × unidades por pedido, el resto por ritmo", () => {
  const meses = ["2026-03-01", "2026-04-01", "2026-05-01"];
  const d = demandaPorPronostico(
    {
      pedidos: new Map([["t1", new Map([["2026-04-01", 300], ["2026-05-01", 330]])]]),
      // t1: 900 pedidos en 90 días; el producto a salió 450 veces (0,5 por pedido) y b 90 (0,1).
      mezcla: [
        { unidadId: "t1", skuId: "a", unidades: 450 },
        { unidadId: "t1", skuId: "b", unidades: 90 },
        { unidadId: "t2", skuId: "a", unidades: 90 },
      ],
      pedidosVentana: new Map([["t1", 900], ["t2", 100]]),
      // a: 450 de t1 + 90 de t2 (sin pronóstico) = 540; c solo por Dropi.
      ventas: new Map([["a", { v90: 540, v30: 180 }], ["b", { v90: 90, v30: 30 }], ["c", { v90: 90, v30: 30 }]]),
    },
    meses,
    "2026-03-22",
  );
  assert.equal(d.fuente, "pronostico");
  const a = d.porProducto.get("a")!;
  // Abril: 300 × 0,5 = 150 del pronóstico + 90/90 × 30 días = 30 del ritmo de t2.
  assert.equal(a[1], 180);
  // Mayo: 330 × 0,5 = 165 + 31 del ritmo.
  assert.equal(a[2], 196);
  // Marzo (en curso, sin pronóstico): repite el primer mes pronosticado, por los 10 días que quedan.
  assert.equal(d.porProducto.get("b")![0], Math.round(300 * 0.1 * (10 / 31) * 100) / 100);
  // c no está en ninguna tienda: solo ritmo.
  assert.equal(d.porProducto.get("c")![1], 30);
});

test("demanda desde el pronóstico: sin tiendas con pronóstico vuelve al ritmo", () => {
  const d = demandaPorPronostico({ pedidos: new Map(), mezcla: [], pedidosVentana: new Map(), ventas: new Map([["a", { v90: 90, v30: 30 }]]) }, ["2026-04-01"], "2026-04-01");
  assert.equal(d.fuente, "ritmo");
  assert.equal(d.porProducto.get("a")![0], 30);
});
