import assert from "node:assert/strict";
import test from "node:test";
import { compraQueVale, costoDrop, type ProductoFamilia } from "./costo";

const familia: ProductoFamilia[] = [
  { id: "padre", codigo: "BASE/ZEPHOCO", padreId: null },
  { id: "natural", codigo: "BASE/ZEPHOCO/NATURAL", padreId: "padre" },
  { id: "white", codigo: "BASE/ZEPHOCO/IVORY/WHITE", padreId: "padre" },
  { id: "dark", codigo: "BASE/ZEPHOCO/DARK", padreId: "padre" },
];

test("el costo propio en Dropi del país manda", () => {
  assert.deepEqual(costoDrop("white", new Map([["white", 1500], ["natural", 1323]]), familia, 900), { costo: 1500, origen: "dropi", de: null });
});

test("una variante sin costo toma el de otra variante del mismo producto (Zephoco White)", () => {
  assert.deepEqual(costoDrop("white", new Map([["natural", 1323]]), familia, null), { costo: 1323, origen: "variante", de: "BASE/ZEPHOCO/NATURAL" });
});

test("el principal va antes que las demás variantes, y el principal toma el de una variante", () => {
  assert.deepEqual(costoDrop("white", new Map([["natural", 1323], ["padre", 1400]]), familia, null), { costo: 1400, origen: "variante", de: "BASE/ZEPHOCO" });
  assert.deepEqual(costoDrop("padre", new Map([["dark", 1300]]), familia, null), { costo: 1300, origen: "variante", de: "BASE/ZEPHOCO/DARK" });
});

test("sin ninguno en la familia, el escrito a mano; y si no, nada (Melaxin)", () => {
  assert.deepEqual(costoDrop("melaxin", new Map(), [{ id: "melaxin", codigo: "SPRAY/MELAXIN/PEEL", padreId: null }], 2100), { costo: 2100, origen: "manual", de: null });
  assert.deepEqual(costoDrop("melaxin", new Map(), [], null), { costo: null, origen: null, de: null });
  assert.deepEqual(costoDrop(null, new Map(), [], 5), { costo: null, origen: null, de: null });
});

test("sin Dropi ni a mano, el de Compras pasado a colones (Melaxin: ECOM03-0148, US$2,36)", () => {
  const compra = compraQueVale(
    [
      { usd: 2.1, orden: "ECOM01-0442", paisId: "PA", fecha: "2026-08-28" },
      { usd: 2.36, orden: "ECOM03-0148", paisId: "CR", fecha: "2026-07-15" },
      { usd: 2.36, orden: "ECOM03-0108", paisId: "CR", fecha: "2026-05-12" },
    ],
    "CR",
  );
  assert.deepEqual(compra, { usd: 2.36, orden: "ECOM03-0148", mismoPais: true });
  const r = costoDrop("melaxin", new Map(), [], null, compra, 500);
  assert.equal(r.origen, "compras");
  assert.equal(r.costo, 1180);
  assert.match(r.de ?? "", /ECOM03-0148/);
  assert.equal(costoDrop("melaxin", new Map(), [], 1000, compra, 500).origen, "manual", "lo escrito a mano va antes que Compras");
});

test("sin compras del país, la más reciente de otro, y lo dice", () => {
  const compra = compraQueVale([{ usd: 2.1, orden: "ECOM01-0442", paisId: "PA", fecha: "2026-08-28" }], "CR");
  assert.equal(compra?.mismoPais, false);
  assert.match(costoDrop("x", new Map(), [], null, compra, 500).de ?? "", /de otro país/);
  assert.equal(compraQueVale([{ usd: 0, orden: "X", paisId: "CR", fecha: "2026-01-01" }], "CR"), null);
});
