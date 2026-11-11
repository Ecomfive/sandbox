import assert from "node:assert/strict";
import { test } from "node:test";
import { emparejarVariacion, type VarianteNuestra } from "./vincular-variaciones";

const v = (id: string, opciones: Record<string, string>, codigo = id): VarianteNuestra => ({ id, codigo, opciones });

test("por los mismos valores, en cualquier orden y sin acentos ni mayúsculas", () => {
  const base = [v("nat", { Color: "Natural" }), v("dark", { Color: "Dark" })];
  assert.equal(emparejarVariacion({ etiqueta: "Natural", sku: null }, base), "nat");
  assert.equal(emparejarVariacion({ etiqueta: "DARK", sku: null }, base), "dark");
  const tinte = [v("cb", { Color: "Chestnut Brown" }), v("bn", { Color: "Black Natural" }), v("bb", { Color: "Brown Black" })];
  assert.equal(emparejarVariacion({ etiqueta: "NATURAL BLACK", sku: "-2" }, tinte), "bn");
  const faja = [v("bm", { Color: "Beige", Talla: "M" }), v("nm", { Color: "Negro", Talla: "M" }), v("nxl", { Color: "Negro", Talla: "XL" })];
  assert.equal(emparejarVariacion({ etiqueta: "Negro / M", sku: null }, faja), "nm");
  assert.equal(emparejarVariacion({ etiqueta: "negro xl", sku: null }, faja), "nxl");
});

test("una talla se escribe de varias formas", () => {
  const tallas = [v("l", { Talla: "L" }), v("xl", { Talla: "XL" }), v("xxl", { Talla: "XXL" })];
  assert.equal(emparejarVariacion({ etiqueta: "2XL", sku: null }, tallas), "xxl");
  assert.equal(emparejarVariacion({ etiqueta: "L", sku: "-2" }, tallas), "l");
});

test("por el número, para las graduaciones, aunque Dropi lo escriba raro", () => {
  const lentes = ["+1.00", "+1.50", "+2.00", "+2.50", "+3.00", "+3.50", "+4.00"].map((g) => v(g, { Graduación: g }));
  assert.equal(emparejarVariacion({ etiqueta: "2/5", sku: "LENTES-3" }, lentes), "+2.50");
  assert.equal(emparejarVariacion({ etiqueta: "3", sku: null }, lentes), "+3.00");
  assert.equal(emparejarVariacion({ etiqueta: "+1.50/35 a 40 años", sku: null }, lentes), "+1.50");
  assert.equal(emparejarVariacion({ etiqueta: "+1:50", sku: null }, lentes), "+1.50");
});

test("por el mismo SKU", () => {
  const lista = [v("a", { Color: "Rojo" }, "BANDA/ROJA"), v("b", { Color: "Azul" }, "BANDA/AZUL")];
  assert.equal(emparejarVariacion({ etiqueta: "Otro nombre", sku: "banda/azul" }, lista), "b");
});

test("si ninguna o más de una calza, queda sin vincular", () => {
  const faja = [v("bm", { Color: "Beige", Talla: "M" }), v("nm", { Color: "Negro", Talla: "M" })];
  assert.equal(emparejarVariacion({ etiqueta: "Beige 2XL", sku: "-8" }, faja), null);
  assert.equal(emparejarVariacion({ etiqueta: "M", sku: null }, faja), null);
  assert.equal(emparejarVariacion({ etiqueta: "Natural", sku: null }, []), null);
  // Un número no se empareja con una talla o un color.
  assert.equal(emparejarVariacion({ etiqueta: "2", sku: null }, [v("x", { Talla: "S" })]), null);
});
