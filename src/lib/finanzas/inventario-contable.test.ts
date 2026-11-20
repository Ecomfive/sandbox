import assert from "node:assert/strict";
import { test } from "node:test";
import { ajusteProvision, estimarRenta, leerConsignacion, provisionObsoleto, separarConsignacion, valorizarPlataformas } from "./inventario-contable";
import type { FilaValorizada, ProductoInventario } from "./inventario-valorizado";

const prod = (skuId: string, valor: number, ultimaSalida: string | null): ProductoInventario =>
  ({ skuId, codigo: skuId, producto: skuId, unidades: 10, valor, costoUnitario: valor / 10, sinCosto: false, bodegas: 1, ultimaSalida }) as ProductoInventario;

test("provisionObsoleto por tramos", () => {
  const p = provisionObsoleto([prod("a", 100, "2026-11-01"), prod("b", 100, "2026-07-01"), prod("c", 100, "2026-04-01"), prod("d", 50, null)], "2026-11-19");
  assert.deepEqual(p.lineas.map((l) => [l.skuId, l.porcentaje]).sort(), [["b", 0.5], ["c", 1], ["d", 1]]);
  assert.equal(p.total, 200);
  assert.equal(p.valorObsoleto, 250);
  assert.equal(ajusteProvision(200, 250), -50);
});

test("separarConsignacion y leerConsignacion", () => {
  const B = "00000000-0000-0000-0000-0000000000b1";
  const f = (bodegaId: string) => ({ bodegaId, valor: 1 }) as FilaValorizada;
  const r = separarConsignacion([f(B), f("otra")], [B]);
  assert.equal(r.consignacion.length, 1);
  assert.equal(r.propias.length, 1);
  assert.deepEqual(leerConsignacion([B, B, "x", 3]), [B]);
  assert.deepEqual(leerConsignacion(null), []);
});

test("valorizarPlataformas", () => {
  const v = valorizarPlataformas(
    new Map([
      ["a", { dropi: 10, drop: 0, effi: 5, dunamixfy: 0 }],
      ["b", { dropi: 3, drop: 0, effi: 0, dunamixfy: 0 }],
    ]),
    new Map([["a", 2]]),
  );
  assert.equal(v.valor, 30);
  assert.equal(v.unidades, 18);
  assert.equal(v.sinCosto, 1);
});

test("estimarRenta: tradicional y CAIR", () => {
  const t = estimarRenta({ meses: 6, ingresos: 300_000, utilidadAntesImpuesto: 50_000, registrado: 0 })!;
  assert.equal(t.utilidadAnual, 100_000);
  assert.equal(t.tradicional, 25_000);
  assert.equal(t.cair, null);
  assert.equal(t.metodo, "tradicional");
  const c = estimarRenta({ meses: 6, ingresos: 1_000_000, utilidadAntesImpuesto: 10_000, registrado: 5_000 })!;
  // 2 M × 4.67 % × 25 % = 23 350 > 5 000.
  assert.equal(c.cair, 23_350);
  assert.equal(c.metodo, "cair");
  assert.equal(c.porRegistrar, 18_350);
  assert.equal(estimarRenta({ meses: 0, ingresos: 1, utilidadAntesImpuesto: 1, registrado: 0 }), null);
});
