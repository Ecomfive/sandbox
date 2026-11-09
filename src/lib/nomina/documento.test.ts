import assert from "node:assert/strict";
import test from "node:test";
import { enmascararDocumento, etiquetaNacionalidad } from "./documento";

test("cédulas y pasaportes enmascarados: nunca completos fuera de la ficha", () => {
  assert.equal(enmascararDocumento("8-123-396"), "8-***-396");
  assert.equal(enmascararDocumento("8-846-2312"), "8-***-312");
  assert.equal(enmascararDocumento("E-8-123456"), "E-***-456");
  assert.equal(enmascararDocumento("AB123456"), "AB***456");
  assert.equal(enmascararDocumento("123456789"), "12***789");
  assert.equal(enmascararDocumento("12345"), "***");
  assert.equal(enmascararDocumento(""), "");
  assert.equal(enmascararDocumento(null), "");
  for (const d of ["8-846-2312", "AB123456", "123456789"]) assert.ok(!enmascararDocumento(d).includes(d.slice(2, 6)));
});

test("nacionalidad de la planilla", () => {
  assert.equal(etiquetaNacionalidad("E"), "Extranjera");
  assert.equal(etiquetaNacionalidad("p"), "Panameña");
  assert.equal(etiquetaNacionalidad(null), "");
});
