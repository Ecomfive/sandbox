import assert from "node:assert/strict";
import { test } from "node:test";
import { rutaPropia } from "./ruta-almacen";

const P = "https://x.supabase.co/storage/v1/object/public/wms-productos/";
const U = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("acepta solo la carpeta propia del módulo", () => {
  assert.equal(rutaPropia(`${P}compras/${U}/1-foto.jpg`, P, "compras"), `compras/${U}/1-foto.jpg`);
  assert.equal(rutaPropia(`${P}productos/${U}/1-foto.jpg`, P, "compras"), null);
  assert.equal(rutaPropia(`${P}filtros/${U}/1-foto.jpg`, P, "compras"), null);
  assert.equal(rutaPropia(`${P}filtros/${U}/1-foto.jpg`, P, "filtros"), `filtros/${U}/1-foto.jpg`);
  // Rutas importadas de ClickUp
  assert.equal(rutaPropia(`${P}compras/clickup/${U}/campo_foto.jpg`, P, "compras"), `compras/clickup/${U}/campo_foto.jpg`);
  assert.equal(rutaPropia(`${P}filtros/86e37b7a8.jpg`, P, "filtros"), "filtros/86e37b7a8.jpg");
});

test("rechaza rutas raras o de otro sitio", () => {
  assert.equal(rutaPropia(`${P}compras/${U}/../../productos/x.jpg`, P, "compras"), null);
  assert.equal(rutaPropia(`${P}compras/a b/x.jpg`, P, "compras"), null);
  assert.equal(rutaPropia(`${P}compras/`, P, "compras"), null);
  assert.equal(rutaPropia(`${P}comprasx/${U}/x.jpg`, P, "compras"), null);
  assert.equal(rutaPropia(`https://otro.com/compras/${U}/x.jpg`, P, "compras"), null);
  assert.equal(rutaPropia(null, P, "compras"), null);
});

test("nombreArchivoSeguro deja un nombre sin carpetas ni puntos dobles", async () => {
  const { nombreArchivoSeguro, esUuid } = await import("./ruta-almacen");
  assert.equal(nombreArchivoSeguro("../wms-productos/x.png"), "wms-productos-x.png");
  assert.equal(nombreArchivoSeguro("Extracto Junio ñ.xlsx"), "Extracto-Junio-n.xlsx");
  assert.equal(nombreArchivoSeguro("..\..\a.csv"), "a.csv");
  assert.equal(nombreArchivoSeguro(""), "archivo");
  assert.equal(esUuid("../wms-productos/probe"), false);
  assert.equal(esUuid("0f8fad5b-d9cb-469f-a165-70867728950e"), true);
});
