import assert from "node:assert/strict";
import { test } from "node:test";
import { articulosDeLectura, margenEffi, montoEffi, normalizarArticulo, tarifasEffi } from "./articulos";

const articulo = {
  id: "121",
  descripcion: "Rhodiola Rosea",
  referencia: "",
  gtin: "7441",
  url_foto: "https://effi.com.co/public/foto.jpg",
  nombre_categoria: "Salud y Belleza",
  nombre_categoria_dropshipping: "Salud y Bienestar",
  p_costo: "801.0000",
  p_costo_ultimo: "900.0000",
  p_min_venta: "5449.0000",
  precios_venta: "Dropshipping: 5449.0000; Sugerida: 19000.0000; Garantías: 0.0000",
  stock_empresa: "231",
  dropshipping: "1",
  stock_bodegas: [
    { sucursal: "1", nombre_sucursal: "Principal", bodega: "1", nombre_bodega: "Principal", stock: "150.0000" },
    { sucursal: "1", nombre_sucursal: "Principal", bodega: "2", nombre_bodega: "Garantías", stock: "3.0000" },
    { sucursal: "1", nombre_sucursal: "Principal", bodega: "3", nombre_bodega: "Conecta Shop", stock: "78.0000" },
  ],
};

test("los montos de Effi", () => {
  assert.equal(montoEffi("5449.0000"), 5449);
  assert.equal(montoEffi("₡5,449"), 5449);
  assert.equal(montoEffi(12), 12);
  assert.equal(montoEffi("-3"), null);
  assert.equal(montoEffi(""), null);
  assert.equal(montoEffi(null), null);
});

test("las tarifas salen del texto de Effi", () => {
  const t = tarifasEffi("Dropshipping: 5449.0000; Tarifa: especial: 10; Garantías: 0; sin monto");
  assert.equal(t.get("dropshipping"), 5449);
  assert.equal(t.get("tarifa: especial"), 10);
  assert.equal(t.get("garantias"), 0);
  assert.equal(t.size, 3);
  assert.equal(tarifasEffi(null).size, 0);
});

test("reconoce la tarifa aunque se llame distinto o venga con otro separador", () => {
  const a = normalizarArticulo({ ...articulo, precios_venta: "Tarifa Dropshipping: $5,449<br>Tarifa Sugerida: $19,000<br>Tarifa Garantías: $0" })!;
  assert.equal(a.precioDropshipping, 5449);
  assert.equal(a.precioSugerido, 19000);
});

test("solo cuenta nuestras bodegas: las de los dropshippers no entran", () => {
  const a = normalizarArticulo(articulo)!;
  assert.equal(a.stockPrincipal, 150);
  assert.equal(a.stockGarantias, 3);
});

test("un artículo completo", () => {
  const a = normalizarArticulo(articulo)!;
  assert.equal(a.effiId, "121");
  assert.equal(a.nombre, "Rhodiola Rosea");
  assert.equal(a.referencia, null);
  assert.equal(a.categoria, "Salud y Bienestar");
  assert.equal(a.precioDropshipping, 5449);
  assert.equal(a.precioSugerido, 19000);
  assert.equal(a.precioMinimo, 5449);
  assert.equal(a.costo, 900);
  assert.equal(a.compartido, true);
});

test("sin bodegas el stock no se sabe, y sin último costo vale el manual", () => {
  const a = normalizarArticulo({ ...articulo, stock_bodegas: [], p_costo_ultimo: "0.0000" })!;
  assert.equal(a.stockPrincipal, null);
  assert.equal(a.costo, 801);
});

test("no confía en lo que llega", () => {
  assert.equal(normalizarArticulo(null), null);
  assert.equal(normalizarArticulo({ id: "abc", descripcion: "x" }), null);
  assert.equal(normalizarArticulo({ id: "1" }), null);
  assert.equal(normalizarArticulo({ ...articulo, url_foto: "http://x/y.jpg" })!.fotoUrl, null);
  assert.equal(articulosDeLectura("nada").length, 0);
  assert.equal(articulosDeLectura([articulo, articulo, { id: "x" }]).length, 1);
});

test("el margen", () => {
  assert.deepEqual(margenEffi(1000, 400, 100), { utilidad: 500, margen: 0.5 });
  assert.deepEqual(margenEffi(1000, 400, null), { utilidad: 600, margen: 0.6 });
  assert.equal(margenEffi(null, 400, 100), null);
  assert.equal(margenEffi(1000, null, 100), null);
  assert.equal(margenEffi(0, 400, 100), null);
});
