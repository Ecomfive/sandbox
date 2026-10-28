import assert from "node:assert/strict";
import { test } from "node:test";
import { conciliarAlertas, esDecision, estadoDeProductos, type PublicacionParaStock } from "./sin-stock";

const pub = (dropiIds: string[], extra: Partial<PublicacionParaStock> = {}): PublicacionParaStock => ({ nombre: `Pub ${dropiIds[0]}`, dropiIds, skuId: null, skuNombre: null, viva: true, ...extra });

test("las publicaciones del mismo producto se juntan y su stock se suma", () => {
  const pubs = [
    pub(["8406"], { skuId: "a", skuNombre: "Aceite de calabaza" }),
    pub(["11178"], { skuId: "a", skuNombre: "Aceite de calabaza" }),
    pub(["7591"]),
  ];
  const r = estadoDeProductos(pubs, new Map([["8406", 0], ["11178", 3], ["7591", 0]]));
  assert.deepEqual(
    r.map((p) => [p.clave, p.nombre, p.dropiIds, p.stock]),
    [
      ["sku:a", "Aceite de calabaza", ["8406", "11178"], 3],
      ["dropi:7591", "Pub 7591", ["7591"], 0],
    ],
  );
});

test("lo archivado del todo o sin ID no cuenta; sin lectura el stock es null", () => {
  const r = estadoDeProductos([pub(["1"], { viva: false }), pub([]), pub(["2"])], new Map());
  assert.deepEqual(r.map((p) => [p.clave, p.stock]), [["dropi:2", null]]);
});

test("abre las que se quedaron sin stock y cierra las que volvieron a tener", () => {
  const productos = [
    { clave: "sku:a", skuId: "a", nombre: "A", dropiIds: ["1"], stock: 0 },
    { clave: "sku:b", skuId: "b", nombre: "B", dropiIds: ["2"], stock: 0 },
    { clave: "sku:c", skuId: "c", nombre: "C", dropiIds: ["3"], stock: 12 },
    { clave: "sku:d", skuId: "d", nombre: "D", dropiIds: ["4"], stock: null },
  ];
  const r = conciliarAlertas(productos, [
    { id: "x", clave: "sku:b" },
    { id: "y", clave: "sku:c" },
    { id: "z", clave: "sku:d" },
  ]);
  assert.deepEqual(r.abrir.map((p) => p.clave), ["sku:a"], "b ya tiene una alerta viva");
  assert.deepEqual(r.cerrar, ["y"], "sin lectura (d) no se cierra");
});

test("decisiones válidas", () => {
  assert.equal(esDecision("comprar"), true);
  assert.equal(esDecision("otra"), false);
});
