import assert from "node:assert/strict";
import test from "node:test";
import { consolidarMeses, porCobrarConsolidado } from "./consolidado-canales";

test("junta tiendas y proveeduría por mes y deja Costa Rica (colones) fuera", () => {
  const f = consolidarMeses(
    [
      { periodo: "2026-10-01", ordenes: 10, entregadas: 6, canceladas: 2, devueltas: 2, ventas_entregadas: "300.50", cod_esperado: 0, cod_cobrado: 0, cod_remitido: 0 },
      { periodo: "2026-10-01", ordenes: 5, entregadas: 4, canceladas: 0, devueltas: 0, ventas_entregadas: 100, cod_esperado: 0, cod_cobrado: 0, cod_remitido: 0 },
    ],
    [
      { periodo: "2026-10-01", moneda: "USD", pedidos: 20, entregados: 15, ventas_entregadas: 500, ganancias: 90, retiros: 0 },
      { periodo: "2026-10-01", moneda: "CRC", pedidos: 99, entregados: 99, ventas_entregadas: 99999, ganancias: 0, retiros: 0 },
      { periodo: "2026-09-01", moneda: "USD", pedidos: 4, entregados: 2, ventas_entregadas: 50, ganancias: 0, retiros: 0 },
    ],
  );
  assert.deepEqual(f.map((x) => x.periodo), ["2026-10-01", "2026-09-01"]);
  const oct = f[0];
  assert.equal(oct.tiendas.vendido, 400.5);
  assert.equal(oct.tiendas.pedidos, 15);
  assert.equal(oct.tiendas.tasaEntrega, 71.43); // 10 de 14 cerradas
  assert.equal(oct.proveeduria.vendido, 500);
  assert.equal(oct.proveeduria.tasaEntrega, 75);
  assert.equal(oct.vendidoTotal, 900.5);
  assert.equal(oct.pesoTiendas, 0.44);
  assert.equal(f[1].tiendas.tasaEntrega, null);
  assert.equal(f[1].pesoTiendas, 0);
});

test("sin ventas no hay peso ni tasa", () => {
  const f = consolidarMeses([{ periodo: "2026-08-01", ordenes: 0, entregadas: 0, canceladas: 0, devueltas: 0, ventas_entregadas: 0, cod_esperado: 0, cod_cobrado: 0, cod_remitido: 0 }], []);
  assert.equal(f[0].pesoTiendas, null);
  assert.equal(f[0].tiendas.tasaEntrega, null);
});

test("por cobrar: efectivo en la calle y billetera de Dropi, descontando abonos", () => {
  const p = porCobrarConsolidado([
    { origen: "tiendas", monto: 200, abonado: 50 },
    { origen: "tiendas", monto: 30 },
    { origen: "dropi", monto: 400.25 },
    { origen: "manual", monto: 999 },
  ]);
  assert.deepEqual(p, { efectivoEnCalle: 180, billeteraDropi: 400.25, total: 580.25 });
});
