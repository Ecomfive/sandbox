import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorColor, colorDeVariante } from "./color-variante";

test("color y talla: el color agrupa y lo demás es el resto, con la talla dicha con número", () => {
  assert.deepEqual(colorDeVariante({ Color: "Azul", Talla: "XXL" }), { color: "Azul", resto: "2XL" });
  assert.deepEqual(colorDeVariante({ Tono: " Beige ", Talla: "M", Largo: "L" }), { color: "Beige", resto: "M / L" });
});

test("solo color, sin color o sin opciones: no se agrupa", () => {
  assert.deepEqual(colorDeVariante({ Color: "Rojo" }), { color: null, resto: "" });
  assert.deepEqual(colorDeVariante({ Talla: "M" }), { color: null, resto: "" });
  assert.deepEqual(colorDeVariante(null), { color: null, resto: "" });
  assert.deepEqual(colorDeVariante({ Color: "", Talla: "M" }), { color: null, resto: "" });
});

test("agruparPorColor: las sueltas primero y cada color en el orden en que sale", () => {
  const h = [{ id: 1, color: "Azul" }, { id: 2, color: null }, { id: 3, color: "Negro" }, { id: 4, color: "Azul" }];
  const g = agruparPorColor(h);
  assert.deepEqual(g.map((x) => x.color), [null, "Azul", "Negro"]);
  assert.deepEqual(g[1].hijos.map((x) => x.id), [1, 4]);
  assert.deepEqual(agruparPorColor([{ color: "Rojo" }]).map((x) => x.color), ["Rojo"]);
});
