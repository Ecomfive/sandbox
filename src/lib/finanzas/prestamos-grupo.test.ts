import assert from "node:assert/strict";
import test from "node:test";
import { costoFinanciero, deudasNetas, leerDatosMovGrupo, leerOrdenes, pendientes, posicionPorParte, saldosPorPar, tasaEfectivaAnual, type MovGrupo } from "./prestamos-grupo";

const PA = "pa", CR = "cr", OR = "or";
let n = 0;
const mov = (acreedorId: string, deudorId: string, tipo: MovGrupo["tipo"], monto: number, fecha: string, vence: string | null = null, ordenes: string[] = []): MovGrupo => ({
  id: `m${++n}`, acreedorId, deudorId, tipo, monto, fecha, vence, concepto: "x", ordenes,
});

test("saldo por par y neto entre dos empresas", () => {
  const movs = [mov(PA, CR, "prestamo", 10000, "2026-04-01"), mov(PA, CR, "costo", 100, "2026-04-01"), mov(PA, CR, "abono", 4000, "2026-05-01"), mov(CR, PA, "prestamo", 1000, "2026-06-01")];
  const s = saldosPorPar(movs);
  assert.equal(s.find((x) => x.acreedorId === PA)!.saldo, 6100);
  const netas = deudasNetas(s);
  assert.deepEqual(netas, [{ acreedorId: PA, deudorId: CR, monto: 5100 }]);
  const pos = posicionPorParte(netas);
  assert.equal(pos.find((p) => p.parteId === CR)!.neto, -5100);
  assert.equal(pos.find((p) => p.parteId === PA)!.neto, 5100);
});

test("los abonos pagan primero lo que vence antes", () => {
  const movs = [
    mov(OR, PA, "prestamo", 1000, "2026-09-01", "2026-11-10"),
    mov(OR, PA, "costo", 200, "2026-09-01", "2026-11-10"),
    mov(OR, PA, "prestamo", 500, "2026-10-01", "2026-12-20"),
    mov(OR, PA, "abono", 1100, "2026-11-10"),
  ];
  const p = pendientes(movs, "2026-11-17");
  assert.equal(p.length, 2);
  assert.equal(p[0].pendiente, 100);
  assert.equal(p[0].estado, "vencido");
  assert.equal(p[0].dias, -7);
  assert.equal(p[1].estado, "al_dia");
  assert.equal(pendientes(movs, "2026-12-15").find((x) => x.monto === 500)!.estado, "por_vencer");
});

test("costo financiero y tasa efectiva: 20 % en 70 días ≈ 159 % anual", () => {
  const movs = [mov(OR, PA, "prestamo", 1000, "2026-09-09", "2026-11-18", ["ECOM02-0055"]), mov(OR, PA, "costo", 200, "2026-09-09", "2026-11-18", ["ECOM02-0055"])];
  const c = costoFinanciero(movs, "2026-01-01", "2026-12-31");
  assert.equal(c[0].costo, 200);
  assert.equal(c[0].diasPromedio, 70);
  assert.ok(Math.abs((c[0].tasaAnual ?? 0) - 1.59) < 0.02);
  assert.equal(tasaEfectivaAnual(0, 1, 10), null);
});

test("lee órdenes y valida la ficha", () => {
  assert.deepEqual(leerOrdenes("ecom03-0016, ECOM-0373 y ECOM03-0016"), ["ECOM03-0016", "ECOM-0373"]);
  const ok = { acreedor_id: "11111111-1111-1111-1111-111111111111", deudor_id: "22222222-2222-2222-2222-222222222222", tipo: "prestamo", fecha: "2026-11-01", vence: "2026-12-01", monto: "1,500", concepto: " Pago  de órdenes ", ordenes: "ECOM03-0001" };
  const d = leerDatosMovGrupo((k) => (ok as Record<string, string>)[k]);
  assert.ok(!("error" in d));
  if (!("error" in d)) {
    assert.equal(d.monto, 1500);
    assert.equal(d.concepto, "Pago de órdenes");
    assert.deepEqual(d.ordenes, ["ECOM03-0001"]);
  }
  assert.ok("error" in leerDatosMovGrupo((k) => ({ ...ok, deudor_id: ok.acreedor_id } as Record<string, string>)[k]));
  assert.ok("error" in leerDatosMovGrupo((k) => ({ ...ok, vence: "2026-10-01" } as Record<string, string>)[k]));
  const abono = leerDatosMovGrupo((k) => ({ ...ok, tipo: "abono" } as Record<string, string>)[k]);
  assert.ok(!("error" in abono) && abono.vence === null);
});

import { abonosPorCargo, ahorroPrepago, conciliarConfirmaciones, estadoDeCuenta, historialPrestamo, interesDelMes, neteosPosibles, saldoNetoAl, saldosPorPar as saldos2 } from "./prestamos-grupo";

const mv = (id: string, a: string, d: string, tipo: "prestamo" | "costo" | "abono", fecha: string, monto: number, extra: Record<string, unknown> = {}) => ({
  id, acreedorId: a, deudorId: d, tipo, fecha, vence: null as string | null, monto, concepto: id, ordenes: [] as string[], ...extra,
});

test("estadoDeCuenta neto y saldoNetoAl", () => {
  const movs = [mv("1", "PA", "CR", "prestamo", "2026-01-01", 100), mv("2", "CR", "PA", "prestamo", "2026-01-05", 30), mv("3", "PA", "CR", "abono", "2026-01-10", 20)];
  const e = estadoDeCuenta(movs, "PA", "CR");
  assert.deepEqual(e.map((l) => l.saldo), [100, 70, 50]);
  assert.equal(saldoNetoAl(movs, "PA", "CR", "2026-01-06"), 70);
  assert.equal(saldoNetoAl(movs, "CR", "PA", "2026-01-06"), -70);
});

test("los aportes no son deuda", () => {
  const movs = [mv("1", "AL", "PA", "prestamo", "2026-01-01", 500, { naturaleza: "aporte" }), mv("2", "AL", "PA", "prestamo", "2026-01-01", 100)];
  assert.equal(saldos2(movs)[0].saldo, 100);
});

test("interesDelMes: saldo diario × tasa / 365", () => {
  const movs = [mv("1", "PA", "CR", "prestamo", "2026-11-01", 3650), mv("2", "PA", "CR", "abono", "2026-11-16", 3650)];
  // 15 días con 3650 a 10 % anual = 15.
  assert.equal(interesDelMes(movs, "PA", "CR", 0.1, "2026-11-01"), 15);
  assert.equal(interesDelMes(movs, "PA", "CR", 0, "2026-11-01"), 0);
});

test("neteosPosibles", () => {
  const n = neteosPosibles(saldos2([mv("1", "PA", "CR", "prestamo", "2026-01-01", 100), mv("2", "CR", "PA", "prestamo", "2026-01-02", 40)]));
  assert.equal(n.length, 1);
  assert.equal(n[0].monto, 40);
});

test("historialPrestamo y abonosPorCargo", () => {
  const movs = [
    mv("p", "OR", "PA", "prestamo", "2026-01-01", 1000, { ordenes: ["ECOM-0001"], vence: "2026-03-01" }),
    mv("c", "OR", "PA", "costo", "2026-03-01", 200, { ordenes: ["ECOM-0001"], vence: "2026-03-01" }),
    mv("a", "OR", "PA", "abono", "2026-03-02", 1100),
  ];
  const h = historialPrestamo(movs, "p", abonosPorCargo(movs))!;
  assert.equal(h.costoTotal, 200);
  assert.equal(h.pagado, 1000);
  assert.equal(h.pendiente, 0);
  assert.equal(h.costoPct, 0.2);
});

test("ahorroPrepago", () => {
  const c = { tipo: "prestamo" as const, fecha: "2026-01-01", vence: "2026-03-12", pendiente: 1000 };
  // 70 días de plazo; faltan 35 → la mitad de 200.
  assert.equal(ahorroPrepago(c, 0.2, "2026-02-05"), 100);
  assert.equal(ahorroPrepago(c, null, "2026-02-05"), null);
  assert.equal(ahorroPrepago(c, 0.2, "2026-04-01"), null);
});

test("conciliarConfirmaciones", () => {
  const movs = [mv("1", "PA", "CR", "prestamo", "2026-01-01", 100)];
  const r = conciliarConfirmaciones(movs, [{ id: "x", acreedorId: "PA", deudorId: "CR", fechaCorte: "2026-01-31", saldoAcreedor: 100, saldoDeudor: 80, nota: null }]);
  assert.equal(r[0].sistema, 100);
  assert.equal(r[0].difDeudor, -20);
  assert.equal(r[0].cuadra, false);
});
