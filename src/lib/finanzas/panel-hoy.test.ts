import assert from "node:assert/strict";
import test from "node:test";
import { efectivoEnRepartidores, porCobrarDropi, ventasDelDia } from "./panel-hoy";

test("ventas del día sin canceladas ni no gestionadas", () => {
  assert.deepEqual(ventasDelDia([{ total: 10, estado_entrega: "entregada" }, { total: "5.5", estado_entrega: "pendiente" }, { total: 99, estado_entrega: "cancelada" }]), { total: 15.5, ordenes: 2 });
});

test("efectivo en repartidores: solo semanas sin cerrar", () => {
  const r = efectivoEnRepartidores(
    [
      { repartidor_id: "a", semana: "2026-10-08", cobrado_efectivo: 100 },
      { repartidor_id: "a", semana: "2026-10-15", cobrado_efectivo: 50 },
      { repartidor_id: "b", semana: "2026-10-15", cobrado_efectivo: 0 },
    ],
    [{ repartidor_id: "a", semana: "2026-10-08", estado: "pagado" }],
  );
  assert.deepEqual(r, { total: 50, repartidores: 1 });
});

test("por cobrar a Dropi: el último saldo de billetera o ganancias − retiros", () => {
  const mensual = [
    { pais_id: "pa", moneda: "USD", ganancias: 300, retiros: 100 },
    { pais_id: "cr", moneda: "CRC", ganancias: 9000, retiros: 0 },
  ];
  assert.equal(porCobrarDropi([], mensual), 200);
  assert.equal(porCobrarDropi([{ pais_id: "pa", monto: 80, fecha: "2026-10-01" }, { pais_id: "pa", monto: 120, fecha: "2026-10-20" }], mensual), 120);
  assert.equal(porCobrarDropi([], []), null);
});
