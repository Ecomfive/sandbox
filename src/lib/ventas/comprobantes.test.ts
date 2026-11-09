import test from "node:test";
import assert from "node:assert/strict";
import { nombreComprobante, rutaComprobante, rutaEsDeOrden, tipoValido } from "./comprobantes";

const ORDEN = "11111111-2222-3333-4444-555555555555";

test("la ruta queda en la carpeta de la orden y el nombre se limpia", () => {
  const r = rutaComprobante(ORDEN, "Foto de la entrega ñandú.JPG", 1, "abcdef12-0000");
  assert.ok(r.startsWith(`${ORDEN}/1-abcdef12-`));
  assert.ok(rutaEsDeOrden(r, ORDEN));
  assert.equal(nombreComprobante("../../x y"), "x-y");
  assert.equal(nombreComprobante(""), "comprobante");
});
test("rechaza rutas de otra orden o con escapes", () => {
  assert.equal(rutaEsDeOrden(`99999999-2222-3333-4444-555555555555/a.jpg`, ORDEN), false);
  assert.equal(rutaEsDeOrden(`${ORDEN}/../a.jpg`, ORDEN), false);
  assert.equal(rutaEsDeOrden(`${ORDEN}/sub/a.jpg`, ORDEN), false);
  assert.equal(rutaEsDeOrden(42, ORDEN), false);
});
test("tipos válidos", () => {
  assert.ok(tipoValido("entrega") && tipoValido("cobro"));
  assert.equal(tipoValido("firma"), false);
});
