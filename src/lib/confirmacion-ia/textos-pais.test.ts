import { test } from "node:test";
import assert from "node:assert/strict";
import { textosCiudad } from "./textos-pais";

test("Costa Rica pide el cantón y Panamá la ciudad o el corregimiento", () => {
  assert.equal(textosCiudad("CR").campo, "Cantón o ciudad");
  assert.match(textosCiudad("cr").ejemploDireccion, /cantón/);
  assert.equal(textosCiudad("PA").campo, "Ciudad o corregimiento");
  assert.equal(textosCiudad(null).campo, "Ciudad o corregimiento");
});
