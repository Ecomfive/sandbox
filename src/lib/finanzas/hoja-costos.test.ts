import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFila, cerradaPorCierre, compraVigente, costoEn, filasDesdeCompras, leerMontoAsociado, paresCargaInicial, pendienteDesglosar, productosSinCosto, repartirPorPeso, resumirProductos, sinFinanciamiento, type CatalogoCostos, type FilaHoja } from "./hoja-costos";
import type { CostoPuesto } from "./compras-costos";

const asoc = (p: Partial<FilaHoja["asociados"]> = {}): FilaHoja["asociados"] => ({
  asoc_comision_banco_1: 0,
  asoc_comision_banco_2: 0,
  asoc_comision_cambio: 0,
  asoc_impuesto: 0,
  asoc_envio: 0,
  asoc_otros: 0,
  ...p,
});

test("el costo total suma el de compra, los asociados por unidad y el financiamiento (como el disparador)", () => {
  const c = calcularFila({ cantidad: 500, costoUnitario: 1, asociados: asoc({ asoc_comision_banco_1: 10, asoc_envio: 40 }), financiamiento: 0.02, costoFinalManual: null });
  assert.equal(c.asociadosUnidad, 0.1);
  assert.equal(c.costoTotal, 1.12);
  assert.equal(c.pctFinanciamiento, 2);
});

test("el costo final manual manda sobre el cálculo", () => {
  const c = calcularFila({ cantidad: 500, costoUnitario: 1, asociados: asoc({ asoc_envio: 40 }), financiamiento: 0, costoFinalManual: 1.43 });
  assert.equal(c.costoCalculado, 1.08);
  assert.equal(c.costoTotal, 1.43);
});

test("un monto asociado se lee en dólares; vacío es cero; negativo o con letras es error", () => {
  assert.deepEqual(leerMontoAsociado(""), { valor: 0 });
  assert.deepEqual(leerMontoAsociado("$1,234.5"), { valor: 1234.5 });
  assert.deepEqual(leerMontoAsociado("1.234,56"), { valor: 1234.56 });
  assert.ok("error" in leerMontoAsociado("-3"));
  assert.ok("error" in leerMontoAsociado("diez"));
});

test("vale la última compra llegada en o antes de la fecha del pedido; antes de la primera, la primera", () => {
  const compras = [
    { llegada: "2025-04-28", costo: 0.92 },
    { llegada: "2025-09-01", costo: 0.9 },
    { llegada: "2026-01-22", costo: 0.86 },
  ];
  assert.equal(compraVigente(compras, "2025-10-15")?.costo, 0.9);
  assert.equal(compraVigente(compras, "2026-01-22")?.costo, 0.86);
  assert.equal(compraVigente(compras, "2024-12-01")?.costo, 0.92);
  assert.equal(compraVigente([], "2025-01-01"), null);
});

test("un pack suma sus componentes y una variante sin compras toma la de su principal", () => {
  const cat: CatalogoCostos = {
    compras: new Map([["simple", [{ llegada: "2026-01-01", costo: 1.1 }]]]),
    componentes: new Map([["pack", [{ componente: "simple", cantidad: 2 }]], ["roto", [{ componente: "nada", cantidad: 1 }]]]),
    padre: new Map([["variante", "simple"]]),
  };
  assert.equal(costoEn(cat, "pack", "2026-02-01"), 2.2);
  assert.equal(costoEn(cat, "variante", "2026-02-01"), 1.1);
  assert.equal(costoEn(cat, "roto", "2026-02-01"), null);
  assert.equal(costoEn(cat, null, "2026-02-01"), null);
});

test("entra a la hoja solo lo que está En Bodega o Completado, con el FOB por unidad y su financiamiento", () => {
  const base = { codigo: "ECOM01-0110", nombre: "X", proveedor: null, abierta: false, gastos: 0, gastosPorConcepto: {}, gastosPendientes: 0, total: 550, unidades: 500, unitarioReal: 1.1, unitarioVigente: null, diferencia: null, pesoGastos: 0 };
  const linea = { skuId: "s1", codigo: "ACEITE", producto: "Aceite", cantidad: 500, fob: 550, gastos: 0, unitarioReal: 1.1, vigente: null, diferencia: null };
  const costos = [
    { ...base, compraId: "c1", etapa: "completado", fechaLlegada: "2026-01-22", fob: 550, lineas: [linea], financiamiento: { total: 55 } },
    { ...base, compraId: "c2", etapa: "en_bodega", fechaLlegada: null, fob: 550, lineas: [linea] },
    { ...base, compraId: "c3", etapa: "tracking", fechaLlegada: null, fob: 550, lineas: [linea] },
  ] as unknown as CostoPuesto[];
  const filas = filasDesdeCompras(costos, new Map([["c2", "2026-11-20"]]), () => "ACEITE");
  assert.equal(filas.length, 2);
  assert.equal(filas[0].origen_clave, "compra:c1:s1");
  assert.equal(filas[0].costo_unitario, 1.1);
  assert.equal(filas[0].financiamiento, 0.11);
  assert.equal(filas[1].fecha_llegada, "2026-11-20");
  assert.equal(filas[1].estatus, "En bodega");
});

test("resumen por producto: vigente, promedio ponderado y lo que falta completar", () => {
  const fila = (id: string, llegada: string, cantidad: number, costoTotal: number, manual: number | null): FilaHoja & { costoTotal: number } => ({
    id, skuId: "s", numero: 3, sku: "A", producto: "A", compraId: null, codigoCompra: id, llegada, cantidad, costoUnitario: 1,
    asociados: asoc(), nota: null, financiamiento: 0, costoFinalManual: manual, origen: "compras", editadoPor: null, editadoEn: null, costoTotal,
  });
  const r = resumirProductos([fila("a", "2025-04-28", 930, 1, 1), fila("b", "2026-01-22", 500, 1.3, null)]).get("s")!;
  assert.equal(r.vigente, 1.3);
  assert.equal(r.compras, 2);
  assert.equal(r.porCompletar, 1);
  assert.ok(r.variacion !== null && r.variacion > 10);
});

test("con stock y sin costo: también los de la lista sin compra vinculada", () => {
  assert.deepEqual(productosSinCosto(new Set(["a", "b"]), new Set(["a"]), new Set(["c"])).sort(), ["b", "c"]);
});

test("el costo por unidad se divide por lo recibido y dice de dónde sale el financiamiento", () => {
  const base = { codigo: "ECOM01-0200", nombre: "X", proveedor: null, abierta: false, gastos: 0, gastosPorConcepto: {}, gastosPendientes: 0, total: 1000, unidades: 1000, unitarioReal: 1, unitarioVigente: null, diferencia: null, pesoGastos: 0, etapa: "en_bodega", fechaLlegada: "2026-11-01", fob: 1000 };
  const linea = { skuId: "s1", codigo: "A", producto: "A", cantidad: 1000, recibida: 960, fob: 1000, gastos: 0, unitarioReal: 1, vigente: null, diferencia: null };
  const [real] = filasDesdeCompras([{ ...base, compraId: "c1", lineas: [linea], financiamiento: { total: 96, real: 96 } }] as unknown as CostoPuesto[], new Map(), () => "A");
  assert.equal(real.cantidad, 960);
  assert.equal(real.cantidad_pedida, 1000);
  assert.equal(real.costo_unitario, 1.041667);
  assert.equal(real.financiamiento, 0.1);
  assert.equal(real.financiamiento_tipo, "real");
  const [est] = filasDesdeCompras([{ ...base, compraId: "c2", lineas: [{ ...linea, recibida: null }], financiamiento: { total: 50, real: 0 } }] as unknown as CostoPuesto[], new Map(), () => "A");
  assert.equal(est.cantidad, 1000);
  assert.equal(est.cantidad_pedida, null);
  assert.equal(est.financiamiento_tipo, "estimado");
  const [sin] = filasDesdeCompras([{ ...base, compraId: "c3", lineas: [linea] }] as unknown as CostoPuesto[], new Map(), () => "A");
  assert.equal(sin.financiamiento_tipo, "ninguno");
  assert.ok(sinFinanciamiento({ origen: "compras", financiamientoTipo: "ninguno" }));
  assert.ok(!sinFinanciamiento({ origen: "manual", financiamientoTipo: "ninguno" }));
});

test("repartir un costo de toda la compra con los centavos exactos", () => {
  assert.deepEqual(repartirPorPeso(100, [1, 1, 1]), [33.33, 33.34, 33.33]);
  assert.deepEqual(repartirPorPeso(50, [300, 100]), [37.5, 12.5]);
  assert.deepEqual(repartirPorPeso(10, [0, 5]), [5, 5]);
  assert.equal(repartirPorPeso(123.45, [7, 11, 13]).reduce((a, b) => a + b, 0).toFixed(2), "123.45");
});

test("pendiente de desglosar y meses cerrados", () => {
  assert.ok(pendienteDesglosar({ costoFinalManual: 1.4, costoFinalExcel: true, asociados: asoc() }));
  assert.ok(!pendienteDesglosar({ costoFinalManual: 1.4, costoFinalExcel: true, asociados: asoc({ asoc_envio: 5 }) }));
  assert.ok(!pendienteDesglosar({ costoFinalManual: 1.4, costoFinalExcel: false, asociados: asoc() }));
  assert.ok(cerradaPorCierre("2026-10-31", "2026-10-01"));
  assert.ok(!cerradaPorCierre("2026-11-01", "2026-10-01"));
  assert.ok(!cerradaPorCierre("2026-01-01", null));
});

test("la carga inicial se une con su fila de Compras por producto y código", () => {
  const pares = paresCargaInicial(
    [{ id: "k1", skuId: "s", codigo: "ecom01-0412 " }, { id: "k2", skuId: "s", codigo: "ECOM01-0999" }],
    [{ clave: "compra:c:s", skuId: "s", codigo: "ECOM01-0412" }, { clave: "compra:d:t", skuId: "t", codigo: "ECOM01-0999" }],
  );
  assert.deepEqual(pares.map((p) => [p.carga.id, p.compra.clave]), [["k1", "compra:c:s"]]);
});
