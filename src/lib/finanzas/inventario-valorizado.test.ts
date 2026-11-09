import assert from "node:assert/strict";
import test from "node:test";
import {
  ajusteConteo,
  leerConteo,
  leerTasa,
  resumirInventario,
  rotacionYDio,
  tramoLento,
  validarFilaConteo,
  vencimientosValorizados,
  type FilaValorizada,
} from "./inventario-valorizado";

const fila = (p: Partial<FilaValorizada>): FilaValorizada => ({
  bodegaId: "b1",
  bodega: "Despacho",
  bodegaTipo: "propia",
  skuId: "s1",
  codigo: "A1",
  producto: "Producto uno",
  loteId: null,
  lote: null,
  vencimiento: null,
  unidades: 10,
  costoUnitario: 2,
  costoFuente: "vigente",
  valor: 20,
  sinCosto: false,
  ultimaSalida: "2026-10-20",
  ...p,
});

test("tramoLento y rotacionYDio", () => {
  assert.equal(tramoLento("2026-10-01", "2026-10-23"), null);
  assert.equal(tramoLento("2026-08-20", "2026-10-23"), "60");
  assert.equal(tramoLento("2026-07-01", "2026-10-23"), "90");
  assert.equal(tramoLento("2026-01-01", "2026-10-23"), "180");
  assert.equal(tramoLento(null, "2026-10-23"), "sin_salidas");
  // 900 de costo vendido en 90 días = 10 al día: 1 000 de inventario son 100 días y 3,65 vueltas al año.
  assert.deepEqual(rotacionYDio(1000, 900), { rotacion: 3.65, dio: 100 });
  assert.deepEqual(rotacionYDio(1000, 0), { rotacion: 0, dio: null });
  assert.deepEqual(rotacionYDio(0, 100), { rotacion: null, dio: null });
});

test("resumirInventario: total, bodegas, productos sin costo, negativos, lento y costo de mantener", () => {
  const filas = [
    fila({}),
    fila({ bodegaId: "b2", bodega: "Fulfillment", unidades: 5, valor: 10, ultimaSalida: "2026-06-01" }),
    fila({ skuId: "s2", codigo: "B2", producto: "Producto dos", unidades: 7, costoUnitario: null, costoFuente: null, valor: 0, sinCosto: true, ultimaSalida: null }),
    fila({ skuId: "s3", codigo: "C3", unidades: -3, valor: 0 }),
  ];
  const r = resumirInventario(filas, new Map([["s1", { unidades: 30, costo: 60 }], ["s9", { unidades: 3, costo: 30 }]]), "2026-10-23", 0.2);
  assert.equal(r.valor, 30);
  assert.equal(r.unidades, 22);
  assert.equal(r.productos, 2);
  assert.deepEqual(r.sinCosto, { productos: 1, unidades: 7 });
  assert.equal(r.negativos, 3);
  assert.deepEqual(r.porBodega.map((b) => [b.bodega, b.valor, b.productos, b.sinCosto]), [["Despacho", 20, 2, 1], ["Fulfillment", 10, 1, 0]]);
  const s1 = r.porProducto.find((p) => p.skuId === "s1")!;
  assert.equal(s1.unidades, 15);
  assert.equal(s1.costoUnitario, 2);
  assert.equal(s1.ultimaSalida, "2026-10-20");
  assert.equal(s1.tramo, null);
  assert.equal(s1.dio, 45); // 30 ÷ (60 ÷ 90)
  assert.equal(r.porProducto.find((p) => p.skuId === "s2")!.tramo, "sin_salidas");
  assert.deepEqual(r.lento.sin_salidas, { productos: 1, valor: 0 });
  // El DIO total usa todo lo vendido (también lo que ya no tiene stock).
  assert.equal(r.costoVendido, 90);
  assert.equal(r.dio, 30);
  assert.equal(r.costoMantenerAnual, 6);
  assert.equal(r.costoMantenerMensual, 0.5);
});

test("vencimientosValorizados: costo del lote o del producto; los vigentes no salen", () => {
  const filas = [fila({ loteId: "l1", costoUnitario: 5, costoFuente: "lote" }), fila({ skuId: "s2", costoUnitario: 3 })];
  const base = { codigo: "X", producto: "x", lote: "L", vencimiento: "2026-10-01", diasRestantes: -22 };
  const v = vencimientosValorizados(
    [
      { ...base, skuId: "s1", loteId: "l1", cantidad: 4, estado: "vencido" },
      { ...base, skuId: "s2", loteId: "l2", cantidad: 2, estado: "por_vencer" },
      { ...base, skuId: "s3", loteId: "l3", cantidad: 9, estado: "por_vencer" },
      { ...base, skuId: "s1", loteId: "l4", cantidad: 9, estado: "vigente" },
    ],
    filas,
  );
  assert.equal(v.lotes.length, 3);
  assert.equal(v.vencido, 20);
  assert.equal(v.porVencer, 6);
  assert.equal(v.lotes.find((l) => l.loteId === "l3")!.costoUnitario, null);
});

test("leerConteo: títulos, suma de repetidos, descartes y lote", () => {
  const r = leerConteo([
    ["Conteo de prueba"],
    ["Código", "Bodega", "Unidades", "Lote"],
    ["A1", "Despacho", 10, null],
    ["a1", "despacho", 5, ""],
    ["C3", "Despacho", 4, "L-1"],
    ["B2", "", 3, null],
    ["B2", "Despacho", -1, null],
    ["B2", "Despacho", 2.5, null],
    [null, null, null, null],
  ]);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.deepEqual(r.filas, [
    { fila: 3, producto: "A1", bodega: "Despacho", unidades: 15, lote: null },
    { fila: 5, producto: "C3", bodega: "Despacho", unidades: 4, lote: "L-1" },
  ]);
  assert.equal(r.descartadas, 3);
  assert.ok("error" in leerConteo([["Producto", "Cantidad"], ["A1", 3]]));
});

test("validarFilaConteo, ajusteConteo y leerTasa", () => {
  assert.deepEqual(validarFilaConteo({ fila: 2, producto: " A1 ", bodega: "Despacho", unidades: 3, lote: "" }), { fila: 2, producto: "A1", bodega: "Despacho", unidades: 3, lote: null });
  assert.equal(validarFilaConteo({ producto: "A1", bodega: "Despacho", unidades: "3" }), null);
  assert.equal(validarFilaConteo({ producto: "A1", bodega: "Despacho", unidades: -1 }), null);
  assert.equal(validarFilaConteo(null), null);
  assert.equal(ajusteConteo(10, 15), -5);
  assert.equal(ajusteConteo(10, -2), 12);
  assert.equal(leerTasa(0.25), 0.25);
  assert.equal(leerTasa("0.1"), 0.1);
  assert.equal(leerTasa(3), 0.2);
  assert.equal(leerTasa(null), 0.2);
});
