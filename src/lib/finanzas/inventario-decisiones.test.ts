import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProductoInventario } from "./inventario-valorizado";
import {
  cajaSinReposicion,
  claveMerma,
  costoMantener,
  inventarioMuerto,
  leerAjustesInventario,
  mermaPorMes,
  montoMerma,
  puntosDeReorden,
  sobrestock,
  validarAjuste,
  type EntradaReorden,
} from "./inventario-decisiones";

const prod = (o: Partial<ProductoInventario>): ProductoInventario => ({
  skuId: "s1",
  codigo: "A-1",
  producto: "Producto A",
  unidades: 100,
  valor: 1000,
  costoUnitario: 10,
  sinCosto: false,
  bodegas: 1,
  ultimaSalida: "2026-10-01",
  diasSinSalida: 22,
  tramo: null,
  vendidas: 90,
  costoVendido: 900,
  rotacion: 3.6,
  dio: 100,
  ...o,
});

test("leerAjustesInventario usa predeterminados y rechaza valores fuera de rango", () => {
  assert.deepEqual(leerAjustesInventario([]), { sobrestockDias: 120, alertaCosto: 0.1, seguridadDias: 14, coberturaDias: 60 });
  const a = leerAjustesInventario([
    { clave: "inventario_sobrestock_dias", valor: 90 },
    { clave: "inventario_alerta_costo", valor: "0.15" },
    { clave: "inventario_reorden", valor: { seguridad: 7, cobertura: 2000 } },
  ]);
  assert.equal(a.sobrestockDias, 90);
  assert.equal(a.alertaCosto, 0.15);
  assert.equal(a.seguridadDias, 7);
  assert.equal(a.coberturaDias, 60);
});

test("validarAjuste guarda la alerta como fracción y valida rangos", () => {
  assert.deepEqual(validarAjuste("alertaCosto", "12,5"), { valor: 0.125 });
  assert.deepEqual(validarAjuste("sobrestock", 100), { valor: 100 });
  assert.ok("error" in validarAjuste("sobrestock", 5));
  assert.ok("error" in validarAjuste("cobertura", "abc"));
});

test("sobrestock: el exceso es la parte por encima del umbral; sin ventas, todo", () => {
  const r = sobrestock(
    [prod({ skuId: "a", dio: 200, valor: 1000 }), prod({ skuId: "b", dio: 60 }), prod({ skuId: "c", vendidas: 0, dio: null, valor: 300 })],
    120,
  );
  assert.equal(r.productos, 2);
  assert.equal(r.filas.find((f) => f.skuId === "a")!.exceso, 400);
  assert.equal(r.filas.find((f) => f.skuId === "c")!.exceso, 300);
  assert.equal(r.exceso, 700);
});

test("costoMantener: anual y mensual", () => {
  assert.deepEqual(costoMantener(1200, 0.2), { anual: 240, mensual: 20 });
  assert.deepEqual(costoMantener(-5, 0.2), { anual: 0, mensual: 0 });
});

test("inventarioMuerto: descuento por antigüedad topado en el que recupera el costo", () => {
  const productos = [
    prod({ skuId: "viejo", ultimaSalida: "2026-01-01", costoUnitario: 10, unidades: 10, valor: 100 }),
    prod({ skuId: "caro", ultimaSalida: "2026-07-01", costoUnitario: 18, unidades: 5, valor: 90 }),
    prod({ skuId: "vende", unidades: 5 }),
    prod({ skuId: "sinprecio", costoUnitario: 4, unidades: 2, valor: 8 }),
  ];
  const vendidas = new Map([["vende", 3]]);
  const precios = new Map([
    ["viejo", { precio: 30, fuente: "ventas" as const }],
    ["caro", { precio: 20, fuente: "lista" as const }],
  ]);
  const r = inventarioMuerto(productos, vendidas, precios, "2026-10-23", 0.24);
  assert.equal(r.productos, 3);
  const viejo = r.filas.find((f) => f.skuId === "viejo")!;
  assert.equal(viejo.descuentoSugerido, 0.5); // 180+ días: 50 %, el máximo es 66 %
  assert.equal(viejo.precioLiquidacion, 15);
  assert.equal(viejo.recuperacion, 150);
  const caro = r.filas.find((f) => f.skuId === "caro")!;
  assert.equal(caro.descuentoMaximo, 0.1);
  assert.equal(caro.descuentoSugerido, 0.1); // 90+ días pediría 35 %, pero no recuperaría el costo
  assert.equal(caro.precioLiquidacion, 18);
  const sp = r.filas.find((f) => f.skuId === "sinprecio")!;
  assert.equal(sp.precioLiquidacion, 4);
  assert.equal(sp.descuentoSugerido, null);
});

test("puntosDeReorden: fecha, cantidad y caja en orden de urgencia", () => {
  const e = (o: Partial<EntradaReorden>): EntradaReorden => ({
    skuId: "x",
    codigo: "X",
    producto: "X",
    stock: 100,
    enCamino: 0,
    vendidas: 90,
    costoUnitario: 10,
    plazoDias: 30,
    via: "mar",
    ...o,
  });
  const caja = { semanas: ["2026-10-19", "2026-10-26", "2026-11-02"], cajaFinal: [1500, 1500, 1500], cajaMinima: 500 };
  const r = puntosDeReorden([e({ skuId: "ya", stock: 20 }), e({ skuId: "luego", stock: 54 }), e({ skuId: "nada", vendidas: 0 })], { seguridadDias: 14, coberturaDias: 60 }, "2026-10-23", caja);
  assert.equal(r.length, 2);
  // ritmo 1/día, punto = 44
  assert.equal(r[0].skuId, "ya");
  assert.equal(r[0].puntoReorden, 44);
  assert.equal(r[0].estado, "comprar_ya");
  assert.equal(r[0].fechaCompra, "2026-10-23");
  assert.equal(r[0].cantidad, 60);
  assert.equal(r[0].monto, 600);
  assert.equal(r[0].semana, 0);
  assert.equal(r[0].caja, "alcanza");
  assert.equal(r[1].skuId, "luego");
  assert.equal(r[1].diasParaComprar, 10);
  assert.equal(r[1].fechaCompra, "2026-11-02");
  assert.equal(r[1].semana, 2);
  assert.equal(r[1].cajaDespues, 300);
  assert.equal(r[1].caja, "no_alcanza");
});

test("cajaSinReposicion devuelve lo que la reposición al ritmo restaba", () => {
  assert.deepEqual(cajaSinReposicion([100, 50, 0], [[10, 10, 10]]), [110, 70, 30]);
});

test("merma por mes y monto a llevar al libro", () => {
  const meses = mermaPorMes(
    [
      { mes: "2026-09-01", skuId: "a", codigo: "A", producto: "A", faltante: 2, sobrante: 0, valorFaltante: 20, valorSobrante: 0, sinCosto: false },
      { mes: "2026-09-01", skuId: "b", codigo: "B", producto: "B", faltante: 0, sobrante: 1, valorFaltante: 0, valorSobrante: 5, sinCosto: true },
      { mes: "2026-10-01", skuId: "a", codigo: "A", producto: "A", faltante: 1, sobrante: 0, valorFaltante: 10, valorSobrante: 0, sinCosto: false },
    ],
    new Map([["2026-09-01", 20]]),
  );
  assert.equal(meses[0].mes, "2026-10-01");
  assert.equal(meses[1].neto, 15);
  assert.equal(meses[1].sinCosto, 1);
  assert.equal(meses[1].enLibro, 20);
  assert.equal(montoMerma(meses[1], "faltantes"), 20);
  assert.equal(montoMerma(meses[1], "neto"), 15);
  assert.equal(claveMerma("2026-09-01"), "merma-inventario:2026-09");
});
