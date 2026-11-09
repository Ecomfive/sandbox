import assert from "node:assert/strict";
import test from "node:test";
import { armarPreciosEffi, precioValido } from "./precios";

const vigentes = [
  { id: 11, nombre: "Tarifa Dropshipping" },
  { id: 12, nombre: "Tarifa Sugerida" },
  { id: 13, nombre: "Tarifa Garantías" },
];
const texto = "Tarifa Dropshipping: 5499.0000; Tarifa Sugerida: 19000.0000; Tarifa Garantías: 0.0000";

test("cambia solo la tarifa pedida y manda las demás con su valor actual (Effi deja en 0 las que faltan)", () => {
  assert.deepEqual(armarPreciosEffi(90, texto, vigentes, { precio: 5999 }), {
    id: 90,
    precios: [
      { tarifa_precio: 11, p_venta: 5999 },
      { tarifa_precio: 12, p_venta: 19000 },
      { tarifa_precio: 13, p_venta: 0 },
    ],
  });
  const ambos = armarPreciosEffi(90, texto, vigentes, { precio: 6000, precioSugerido: 21000, precioMinimo: 5500 });
  assert.ok(!("error" in ambos));
  assert.deepEqual(ambos.precios?.map((p) => p.p_venta), [6000, 21000, 0]);
  assert.equal(ambos.p_min_venta, 5500);
});

test("solo el precio mínimo no toca las tarifas", () => {
  assert.deepEqual(armarPreciosEffi(90, texto, vigentes, { precioMinimo: 5000 }), { id: 90, p_min_venta: 5000 });
});

test("si una tarifa vigente no se puede leer, no se manda nada", () => {
  const r = armarPreciosEffi(90, "Tarifa Dropshipping: 5499; Tarifa Sugerida: 19000", vigentes, { precio: 6000 });
  assert.ok("error" in r && r.error.includes("Garantías"));
});

test("sin tarifa Dropshipping o con dos, error", () => {
  assert.ok("error" in armarPreciosEffi(90, "Normal: 1; Otra: 2", [{ id: 1, nombre: "Normal" }, { id: 2, nombre: "Otra" }], { precio: 5 }));
  const dos = [...vigentes, { id: 14, nombre: "Dropshipping mayorista" }];
  assert.ok("error" in armarPreciosEffi(90, `${texto}; Dropshipping mayorista: 4000`, dos, { precio: 5 }));
  assert.ok("error" in armarPreciosEffi(90, texto, vigentes, {}));
});

test("precios escritos por la persona", () => {
  assert.equal(precioValido("5,499.5"), 5499.5);
  assert.equal(precioValido(12.345), 12.35);
  assert.equal(precioValido("-1"), null);
  assert.equal(precioValido("abc"), null);
  assert.equal(precioValido(20_000_000), null);
});
