import assert from "node:assert/strict";
import { test } from "node:test";
import { delVendidoAlBanco, diasDelMes, parteEntregadaDe, patronSemana, proyectarMes, resumenDropi, unidadesPorPedido, vecesPorDia } from "./patrones";

test("diasDelMes", () => {
  assert.equal(diasDelMes("2026-02-01"), 28);
  assert.equal(diasDelMes("2026-11-01"), 30);
  assert.equal(diasDelMes("2024-02-01"), 29);
});

test("proyectarMes: al ritmo de los días completos, sin hoy", () => {
  const d = [
    { fecha: "2026-11-01", ordenes: 10, ventas: 300, entregadas: 0, canceladas: 2 },
    { fecha: "2026-11-02", ordenes: 10, ventas: 300, entregadas: 0, canceladas: 0 },
    { fecha: "2026-11-03", ordenes: 99, ventas: 9999, entregadas: 0, canceladas: 0 },
  ];
  const p = proyectarMes(d, "2026-11-01", "2026-11-03", 0.5)!;
  assert.equal(p.dias, 2);
  assert.equal(p.ordenesHasta, 18);
  assert.equal(p.ventasHasta, 600);
  assert.equal(p.ventasProyectadas, 9000);
  assert.equal(p.ordenesProyectadas, 270);
  assert.equal(p.entregadasProyectadas, 4500);
  assert.equal(proyectarMes(d, "2026-10-01", "2026-11-03", 0.5), null);
  assert.equal(proyectarMes(d, "2026-11-01", "2026-11-01", 0.5), null);
  assert.equal(proyectarMes(d, "2026-11-01", "2026-11-03", null)!.entregadasProyectadas, null);
});

test("parteEntregadaDe", () => {
  assert.equal(parteEntregadaDe(0, 10), null);
  assert.equal(parteEntregadaDe(100, 60), 0.6);
  assert.equal(parteEntregadaDe(100, 130), 1);
});

test("vecesPorDia y patronSemana", () => {
  // 2026-11-16 es lunes; dos semanas completas.
  assert.deepEqual(vecesPorDia("2026-11-16", "2026-11-29"), [2, 2, 2, 2, 2, 2, 2]);
  const p = patronSemana(
    [
      { dia: 1, hora: 10, ordenes: 4, ventas: 100 },
      { dia: 5, hora: 20, ordenes: 2, ventas: 300 },
      { dia: 5, hora: null, ordenes: 2, ventas: 100 },
    ],
    "2026-11-16",
    "2026-11-29",
  );
  assert.equal(p.ordenes, 8);
  assert.equal(p.mejorDia, "Viernes");
  assert.equal(p.dias[4].ventasPorDia, 200);
  assert.equal(p.mejorFranja, "Mañana (6–12 h)");
  assert.equal(p.conHora, 0.75);
  assert.equal(patronSemana([], "2026-11-16", "2026-11-29").mejorDia, null);
});

test("unidadesPorPedido", () => {
  assert.equal(unidadesPorPedido(30, 20), 1.5);
  assert.equal(unidadesPorPedido(3, 0), null);
});

test("delVendidoAlBanco", () => {
  const r = delVendidoAlBanco([
    { ventas_entregadas: 1000, cod_esperado: 800, cod_cobrado: 700, cod_remitido: 500 },
    { ventas_entregadas: "200", cod_esperado: "200", cod_cobrado: "200", cod_remitido: "200" },
  ]);
  assert.equal(r.vendido, 1200);
  assert.equal(r.enLaCalle, 200);
  assert.equal(r.sinCobroAnotado, 100);
  assert.equal(r.parteRemesada, 0.7);
});

test("resumenDropi: solo dólares", () => {
  assert.equal(resumenDropi([{ moneda: "CRC", pedidos: 5, entregados: 4, ventas_entregadas: 1, ganancias: 1 }]), null);
  const r = resumenDropi([
    { moneda: "USD", pedidos: 10, entregados: 5, ventas_entregadas: 250, ganancias: 80 },
    { moneda: "CRC", pedidos: 99, entregados: 99, ventas_entregadas: 99999, ganancias: 9999 },
  ])!;
  assert.equal(r.pedidos, 10);
  assert.equal(r.ganancias, 80);
  assert.equal(r.tasaEntrega, 0.5);
});
