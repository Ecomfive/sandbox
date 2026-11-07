import assert from "node:assert/strict";
import { test } from "node:test";
import { archivoDeFoto, cambiosPrecioNuestros } from "./effi-precios";

const S3 = "https://effierp.s3.us-east-2.amazonaws.com/public/images/app/articulos/";
const nuestro = (id: string, clave: string, precio: number | null, precioSugerido: number | null = 19000) => ({ id, effiClave: clave, precio, precioSugerido });
const articulo = (archivo: string, precioDropshipping: number | null, precioSugerido: number | null = 19000) => ({ fotoUrl: `${S3}${archivo}?v=2`, precioDropshipping, precioSugerido });

test("el archivo de la foto es la clave del catálogo", () => {
  assert.equal(archivoDeFoto(`${S3}55868_1_2.jpg?x=1`), "55868_1_2.jpg");
  assert.equal(archivoDeFoto(null), "");
});

test("el precio que bajó Francis en Effi pasa al análisis, con el anterior para el historial", () => {
  const c = cambiosPrecioNuestros([nuestro("a", "dht.jpg", 4999), nuestro("b", "igual.jpg", 5449)], [articulo("dht.jpg", 3949), articulo("igual.jpg", 5449)]);
  assert.deepEqual(c, [{ id: "a", precio: 3949, precioSugerido: 19000, precioAntes: 4999 }]);
});

test("si solo cambia el sugerido, se corrige sin anotar cambio de precio", () => {
  assert.deepEqual(cambiosPrecioNuestros([nuestro("a", "x.jpg", 5000, 15000)], [articulo("x.jpg", 5000, 18000)]), [{ id: "a", precio: 5000, precioSugerido: 18000, precioAntes: null }]);
});

test("sin foto que coincida o sin precio en la API no se toca nada", () => {
  assert.deepEqual(cambiosPrecioNuestros([nuestro("a", "x.jpg", 5000)], [articulo("otro.jpg", 3000), articulo("x.jpg", null)]), []);
  assert.deepEqual(cambiosPrecioNuestros([nuestro("a", "", 5000)], [{ fotoUrl: null, precioDropshipping: 3000, precioSugerido: null }]), []);
});
