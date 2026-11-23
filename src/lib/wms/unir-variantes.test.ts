import assert from "node:assert/strict";
import test from "node:test";
import { claveVariante, emparejarVariantes } from "./unir-productos";

test("claveVariante: la misma graduación escrita de distintas formas", () => {
  assert.equal(claveVariante("LENTES/SMART/150", "LENTES/SMART"), "G:1.50");
  assert.equal(claveVariante("LENTES/TR90/ESTUCHE/1.50", "LENTES/LECTURA/TR90/ESTUCHE"), "G:1.50");
  assert.equal(claveVariante("LENTES/X/+1,5", "LENTES/X"), "G:1.50");
  assert.equal(claveVariante("LENTES/SMART/100", "LENTES/SMART"), "G:1.00");
  assert.equal(claveVariante("LENTES/X/4", "LENTES/X"), "G:4.00");
  assert.equal(claveVariante("CAMISA/STRETCH/CABALLERO/AZUL-M", "CAMISA/STRETCH/CABALLERO"), "AZULM");
  assert.equal(claveVariante("BOLSO/NAYLA/GRAN/Negro", "BOLSO/NAYLA/GRAN"), "NEGRO");
});

test("emparejarVariantes: Lentes Smart con TR90 (la +4.50 no tiene pareja y pasa como nueva)", () => {
  const tr = ["1.00", "1.50", "2.00", "2.50", "3.00", "3.50", "4.00"].map((g) => ({ id: `t${g}`, codigo: `LENTES/TR90/ESTUCHE/${g}`, nombre: `+${g}` }));
  const smart = ["100", "150", "200", "250", "300", "350", "400", "450"].map((g) => ({ id: `s${g}`, codigo: `LENTES/SMART/${g}`, nombre: g }));
  const p = emparejarVariantes(tr, "LENTES/LECTURA/TR90/ESTUCHE", smart, "LENTES/SMART");
  assert.equal(p.s100, "t1.00");
  assert.equal(p.s250, "t2.50");
  assert.equal(p.s400, "t4.00");
  assert.equal(p.s450, null);
});

test("emparejarVariantes: dos del que se va no van a la misma del que queda", () => {
  const p = emparejarVariantes([{ id: "q", codigo: "A/1.00", nombre: "" }], "A", [{ id: "x", codigo: "B/100", nombre: "" }, { id: "y", codigo: "B/1.00", nombre: "" }], "B");
  assert.equal(p.x, "q");
  assert.equal(p.y, null);
});
