import assert from "node:assert/strict";
import { test } from "node:test";
import { leerMedicion, nivel, rutaGenerica } from "./metricas";

test("la ruta queda sin ids", () => {
  assert.equal(rutaGenerica("/compras/8f3e2a10-1b2c-4d5e-8f90-123456789abc?x=1"), "/compras/:id");
  assert.equal(rutaGenerica("/retiros/42"), "/retiros/:id");
  assert.equal(rutaGenerica("/ventas-tiendas/pipeline"), "/ventas-tiendas/pipeline");
});
test("niveles de Google", () => {
  assert.equal(nivel("LCP", 2000), "bueno");
  assert.equal(nivel("LCP", 3000), "mejorar");
  assert.equal(nivel("CLS", 0.3), "malo");
});
test("valida lo que llega", () => {
  assert.deepEqual(leerMedicion({ ruta: "/compras/123", metrica: "LCP", valor: 1234.56789 }), { ruta: "/compras/:id", metrica: "LCP", valor: 1234.5679 });
  assert.equal(leerMedicion({ ruta: "compras", metrica: "LCP", valor: 1 }), null);
  assert.equal(leerMedicion({ ruta: "/x", metrica: "FID", valor: 1 }), null);
  assert.equal(leerMedicion({ ruta: "/x", metrica: "LCP", valor: -1 }), null);
});
