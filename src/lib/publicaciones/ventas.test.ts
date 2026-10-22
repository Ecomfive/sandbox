import assert from "node:assert/strict";
import test from "node:test";
import { estadoVentaSugerido, hayQueReponer, mesesEntre, restarDias, resumirProductos, totalesPorDia, totalesPorMes, ventasDePublicacion, type ProductoDropi, type VentaDia } from "./ventas";

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

test("estado de venta sugerido con los cortes de ClickUp", () => {
  assert.equal(estadoVentaSugerido(600, 10), "mas_vendidos");
  assert.equal(estadoVentaSugerido(100, 10), "estable");
  assert.equal(estadoVentaSugerido(20, 10), "lento");
  assert.equal(estadoVentaSugerido(0, 10), "estancado");
  assert.equal(estadoVentaSugerido(900, 0), "sin_stock");
});

test("una publicación con dos IDs de Dropi suma los dos", () => {
  const resumen = new Map(resumirProductos([prod(1, 30), prod(2, 0)], [dia(1, CORTE, 40), dia(2, CORTE, 20, { devueltas: 5 }), dia(2, "2026-08-10", 3)], CORTE).map((r) => [r.id, r]));
  const v = ventasDePublicacion([1, 2, 99], resumen)!;
  assert.deepEqual(v.ids, [1, 2]);
  assert.equal(v.netas30, 55);
  assert.equal(v.stock, 30);
  assert.equal(v.diasInventario, 16); // 30 ÷ (55 ÷ 30)
  assert.equal(v.stockEstado, "alcanza");
  assert.equal(v.estadoSugerido, "lento");
  assert.equal(v.porMes["2026-08"], 3);
  assert.equal(ventasDePublicacion([99], resumen), null);
});

test("el stock de la última lectura de Dropi manda sobre el de la carga de ventas", () => {
  // La antena 8684: la carga decía 0 (sin stock y se vende) y Dropi ya tenía 2.
  const resumen = new Map(resumirProductos([prod(8684, 0)], [dia(8684, CORTE, 90)], CORTE).map((r) => [r.id, r]));
  assert.equal(ventasDePublicacion([8684], resumen)!.stockEstado, "sin_stock_vende");
  const v = ventasDePublicacion([8684], resumen, new Map([[8684, 2]]))!;
  assert.equal(v.stock, 2);
  assert.equal(v.stockEstado, "se_acaba");
  // Un ID que la lectura no trae se queda con el de la carga.
  assert.equal(ventasDePublicacion([8684], resumen, new Map([[1, 5]]))!.stock, 0);
});
