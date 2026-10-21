import assert from "node:assert/strict";
import test from "node:test";
import { hayQueReponer, mesesEntre, restarDias, resumirProductos, totalesPorDia, totalesPorMes, type ProductoDropi, type VentaDia } from "./ventas";

const CORTE = "2026-10-21";
const prod = (id: number, stock: number): ProductoDropi => ({ id, nombre: `P${id}`, lista: "activo", privado: false, variable: false, stock, primeraVenta: null, ultimaVenta: null });
const dia = (producto: number, d: string, pedidas: number, extra: Partial<VentaDia> = {}): VentaDia => ({ producto, dia: d, pedidas, ordenes: pedidas, canceladas: 0, rechazadas: 0, devueltas: 0, ...extra });

test("fechas: restar días y meses entre dos fechas", () => {
  assert.equal(restarDias(CORTE, 29), "2026-09-22");
  assert.equal(restarDias("2026-03-01", 1), "2026-02-28");
  assert.deepEqual(mesesEntre("2025-11-15", "2026-02-01"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("netas y ventanas de 30 días: los últimos 30 incluyen el corte y los 29 días antes", () => {
  const [r] = resumirProductos([prod(1, 100)], [dia(1, "2026-10-21", 10), dia(1, "2026-09-22", 5, { canceladas: 2 }), dia(1, "2026-09-21", 7), dia(1, "2026-10-22", 99)], CORTE);
  assert.equal(r.netas30, 13); // 10 + (5 − 2); el 22 oct es posterior al corte y no cuenta
  assert.equal(r.netas30Antes, 7);
  assert.equal(r.pedidas, 22);
  assert.equal(r.netasTotal, 20);
  assert.equal(r.porMes["2026-09"], 10);
  assert.equal(r.pctCancelacion, 2 / 22);
});

test("categorías por netas de 30 días", () => {
  const r = resumirProductos(
    [prod(1, 0), prod(2, 0), prod(3, 0), prod(4, 0), prod(5, 0)],
    [dia(1, CORTE, 100), dia(2, CORTE, 10), dia(3, CORTE, 1), dia(4, "2026-01-05", 3)],
    CORTE,
  );
  assert.deepEqual(r.map((x) => x.categoria), ["estrella", "se_vende", "lento", "sin_ventas", "nunca"]);
});

test("días de inventario y alertas de reposición", () => {
  const [sinStock, poco, bien, quieto] = resumirProductos([prod(1, 0), prod(2, 20), prod(3, 300), prod(4, 50)], [dia(1, CORTE, 60), dia(2, CORTE, 60), dia(3, CORTE, 60)], CORTE);
  assert.equal(sinStock.diasInventario, 0);
  assert.ok(sinStock.alertas.includes("Sin stock y se está vendiendo"));
  assert.ok(hayQueReponer(sinStock));
  assert.equal(poco.diasInventario, 10); // 20 ÷ (60 ÷ 30)
  assert.ok(poco.alertas.includes("Stock para 10 días"));
  assert.equal(bien.diasInventario, 150);
  assert.ok(!hayQueReponer(bien));
  assert.equal(quieto.diasInventario, null);
  assert.ok(quieto.alertas.includes("Stock quieto"));
});

test("devoluciones altas solo con 30 o más unidades pedidas", () => {
  const [mucho, poco] = resumirProductos([prod(1, 10), prod(2, 10)], [dia(1, CORTE, 40, { devueltas: 10 }), dia(2, CORTE, 10, { devueltas: 5 })], CORTE);
  assert.ok(mucho.alertas.includes("Devoluciones altas (25 %)"));
  assert.ok(!poco.alertas.some((a) => a.startsWith("Devoluciones")));
});

test("totales por mes y por día", () => {
  const dias = [dia(1, "2026-09-30", 4, { devueltas: 1 }), dia(2, "2026-10-21", 6), dia(2, "2026-10-20", 2, { canceladas: 2 })];
  const meses = totalesPorMes(dias, "2026-09-01", CORTE);
  assert.deepEqual(meses.map((m) => [m.mes, m.netas]), [["2026-09", 3], ["2026-10", 6]]);
  const ultimos = totalesPorDia(dias, CORTE, 3);
  assert.deepEqual(ultimos, [{ dia: "2026-10-19", pedidas: 0, netas: 0 }, { dia: "2026-10-20", pedidas: 2, netas: 0 }, { dia: "2026-10-21", pedidas: 6, netas: 6 }]);
});
