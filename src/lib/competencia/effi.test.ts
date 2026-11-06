import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogoEffi, claveEffi, normalizarCompetenciaEffi } from "./effi";

const fila = {
  codigo: "J0nPtLjrK157H1UwbZwoJA%3D%3D",
  nombre: " LEMME  BURN ",
  foto: "https://effierp.s3.us-east-2.amazonaws.com/public/images/app/articulos/58353_17938036590593_215444.jpg",
  proveedor: "SICOMMER LAB CR",
  proveedorId: "58353",
  categoria: "SALUD Y BIENESTAR",
  stock: "1,080",
  ventas: "2,145",
  precio: "₡4,173",
  sugerido: "₡13,000",
};

test("un artículo del catálogo de Effi", () => {
  const v = normalizarCompetenciaEffi(fila)!;
  assert.equal(v.nombre, "LEMME BURN");
  assert.equal(v.clave, "58353_17938036590593_215444.jpg");
  assert.equal(v.proveedorId, 58353);
  assert.equal(v.precio, 4173);
  assert.equal(v.precioSugerido, 13000);
  assert.equal(v.stock, 1080);
  assert.equal(v.ventas, 2145);
  assert.equal(v.categoria, "SALUD Y BIENESTAR");
  assert.equal(v.esNuestro, false);
});

test("nuestro proveedor es la cuenta ECOMFIVE, por su ID", () => {
  assert.equal(normalizarCompetenciaEffi({ ...fila, proveedorId: "55868", proveedor: "ECOMFIVE" })!.esNuestro, true);
  assert.equal(normalizarCompetenciaEffi({ ...fila, proveedor: "ECOMFIVE" })!.esNuestro, false);
});

test("un monto en otra moneda no se guarda como colones", () => {
  assert.equal(normalizarCompetenciaEffi({ ...fila, precio: "$10.75" })!.precio, null);
});

test("sin foto, la clave sale del proveedor y el nombre", () => {
  assert.equal(claveEffi(null, 58353, "Lemme Burn"), "58353-lemme burn");
  assert.equal(normalizarCompetenciaEffi({ ...fila, foto: "" })!.clave, "58353-lemme burn");
});

test("no confía en lo que llega", () => {
  assert.equal(normalizarCompetenciaEffi(null), null);
  assert.equal(normalizarCompetenciaEffi({ ...fila, nombre: "" }), null);
  assert.equal(normalizarCompetenciaEffi({ ...fila, proveedor: "" }), null);
  assert.equal(normalizarCompetenciaEffi({ ...fila, proveedorId: "abc" }), null);
  assert.equal(normalizarCompetenciaEffi({ ...fila, proveedorId: "-3" }), null);
  assert.equal(normalizarCompetenciaEffi({ ...fila, foto: "https://otro.com/x.jpg" })!.foto, null);
  assert.equal(normalizarCompetenciaEffi({ ...fila, foto: "http://127.0.0.1/x.jpg" })!.foto, null);
  assert.equal(normalizarCompetenciaEffi({ ...fila, stock: "Agotado" })!.stock, null);
});

test("una lectura: sin repetidos, y dos variantes con la misma foto no se pisan", () => {
  assert.equal(catalogoEffi([fila, fila, { nombre: "" }]).length, 1);
  const dos = catalogoEffi([fila, { ...fila, nombre: "LEMME BURN X2" }]);
  assert.equal(dos.length, 2);
  assert.notEqual(dos[0].clave, dos[1].clave);
  assert.equal(catalogoEffi("nada").length, 0);
});
