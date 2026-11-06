import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogoDrop, idDeProveedorDrop, normalizarCompetenciaDrop } from "./drop";

const fila = {
  dropId: "6ae5e72d907fa0ea62f7ff79",
  codigo: "ID-ONWAG",
  nombre: " Rhodiola  Rosea ",
  proveedor: "Ecomfive Costa Rica",
  precio: "c5721.45",
  sugerido: "c11673.50",
  stock: "240 total",
  categoria: "Salud y bienestar",
  creado: "2026-09-05T18:34:18.758Z",
  foto: "/_next/image?url=https%3A%2F%2Fstorage.googleapis.com%2Fboxful%2Ffoto.jpg&w=384&q=75",
};

test("un producto del catálogo de Drop", () => {
  const v = normalizarCompetenciaDrop(fila)!;
  assert.equal(v.nombre, "Rhodiola Rosea");
  assert.equal(v.codigo, "ID-ONWAG");
  assert.equal(v.precio, 5721.45);
  assert.equal(v.precioSugerido, 11673.5);
  assert.equal(v.stock, 240);
  assert.equal(v.categoria, "Salud y bienestar");
  assert.equal(v.foto, "https://storage.googleapis.com/boxful/foto.jpg");
  assert.equal(v.creadoEnDrop, "2026-09-05T18:34:18.758Z");
});

test("reconoce a nuestro proveedor y a los demás", () => {
  assert.equal(normalizarCompetenciaDrop(fila)!.esNuestro, true);
  assert.equal(normalizarCompetenciaDrop({ ...fila, proveedor: "Bionatural Lab" })!.esNuestro, false);
  assert.equal(normalizarCompetenciaDrop({ ...fila, proveedor: "No Ecomfive" })!.esNuestro, false);
});

test("un monto en dólares no se guarda como colones", () => {
  assert.equal(normalizarCompetenciaDrop({ ...fila, precio: "$10.75" })!.precio, null);
  assert.equal(normalizarCompetenciaDrop({ ...fila, sugerido: "USD 20" })!.precioSugerido, null);
});

test("no confía en lo que llega", () => {
  assert.equal(normalizarCompetenciaDrop(null), null);
  assert.equal(normalizarCompetenciaDrop({ ...fila, dropId: "../x" }), null);
  assert.equal(normalizarCompetenciaDrop({ ...fila, nombre: "" }), null);
  assert.equal(normalizarCompetenciaDrop({ ...fila, proveedor: "" }), null);
  assert.equal(normalizarCompetenciaDrop({ ...fila, codigo: "<b>" })!.codigo, null);
  assert.equal(normalizarCompetenciaDrop({ ...fila, creado: "ayer" })!.creadoEnDrop, null);
  assert.equal(normalizarCompetenciaDrop({ ...fila, foto: "https://boxful.sfo3.digitaloceanspaces.com/avatar.png" })!.foto, null);
  assert.equal(normalizarCompetenciaDrop({ ...fila, foto: "http://127.0.0.1/x.png" })!.foto, null);
  assert.equal(normalizarCompetenciaDrop({ ...fila, stock: "Agotado" })!.stock, null);
});

test("una lectura sin repetidos ni filas malas", () => {
  assert.equal(catalogoDrop([fila, fila, { dropId: "x" }]).length, 1);
  assert.equal(catalogoDrop("nada").length, 0);
});

test("el número de un proveedor no cambia entre lecturas", () => {
  assert.equal(idDeProveedorDrop("Bionatural Lab"), idDeProveedorDrop(" bionatural lab "));
  assert.notEqual(idDeProveedorDrop("Bionatural Lab"), idDeProveedorDrop("Miranova"));
  assert.ok(Number.isSafeInteger(idDeProveedorDrop("Miranova")));
});
