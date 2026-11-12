import assert from "node:assert/strict";
import test from "node:test";
import { costoPromedioDeCompras, cuentasDelPedido, type CostoProducto } from "./costos";

const costos = new Map<string, CostoProducto>([
  ["a", { costo: 3.73, fuente: "promedio_pais" }],
  ["b", { costo: 2, fuente: "promedio_todos" }],
]);

test("ingresos y costos: costo por cantidad, sin servicios; margen con lo que se sabe", () => {
  const c = cuentasDelPedido(
    32.9,
    [
      { skuId: "a", cantidad: 2, esServicio: false },
      { skuId: "b", cantidad: 1, esServicio: false },
      { skuId: null, cantidad: 1, esServicio: true },
    ],
    costos,
    null,
    5.15,
  );
  assert.equal(c.costoProductos, 9.46);
  assert.equal(c.lineasSinCosto, 0);
  assert.deepEqual(c.fuentes.sort(), ["promedio_pais", "promedio_todos"]);
  assert.equal(c.margen, 18.29);
  assert.equal(c.margenPct, 55.6);
});

test("ingresos y costos: una línea sin producto o sin costo se cuenta aparte; sin nada costeado no hay margen", () => {
  const parcial = cuentasDelPedido(20, [{ skuId: "a", cantidad: 1, esServicio: false }, { skuId: "x", cantidad: 1, esServicio: false }], costos, 1.5, null);
  assert.equal(parcial.lineasSinCosto, 1);
  assert.equal(parcial.margen, 14.77);
  const nada = cuentasDelPedido(20, [{ skuId: null, cantidad: 1, esServicio: false }], costos, null, null);
  assert.equal(nada.margen, null);
  assert.equal(nada.margenPct, null);
});

test("costo promedio de compra: del país, si no de todos; sin descartadas ni anuladas", () => {
  const PA = "pa";
  const c = (unidades: number, costoUnitario: number | null, paisId: string, etapa = "recibido", anulada = false) => ({ unidades, costoUnitario, paisId, etapa, anulada });
  // Panamá: (100 × 2 + 300 × 3) ÷ 400 = 2.75; la descartada, la anulada y la sin costo no cuentan.
  assert.deepEqual(costoPromedioDeCompras([c(100, 2, PA), c(300, 3, PA), c(500, 9, PA, "descartado"), c(50, 9, PA, "recibido", true), c(70, null, PA), c(10, 1, "cr")], PA), {
    costo: 2.75,
    fuente: "promedio_pais",
  });
  // Sin compras con costo en Panamá: el de todos los países.
  assert.deepEqual(costoPromedioDeCompras([c(10, 1, "cr"), c(30, 2, "mx"), c(5, null, PA)], PA), { costo: 1.75, fuente: "promedio_todos" });
  assert.equal(costoPromedioDeCompras([c(5, null, PA)], PA), null);
});
