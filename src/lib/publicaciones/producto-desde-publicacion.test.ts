import assert from "node:assert/strict";
import { test } from "node:test";
import { fotoParaProducto, pareceCompuesto, sugerirComponentes } from "./producto-desde-publicacion";

const base = "https://abc.supabase.co/storage/v1/object/public/wms-productos";

test("solo se copia la foto que está en nuestro almacenamiento, en la carpeta de publicaciones", () => {
  const propia = `${base}/publicaciones/borrador/uuid/1-foto.jpg`;
  assert.equal(fotoParaProducto([null, "https://cdn.dropi.pa/x.jpg", propia]), propia);
  assert.equal(fotoParaProducto(["https://cdn.dropi.pa/x.jpg"]), null);
  assert.equal(fotoParaProducto([`${base}/productos/uuid/foto.jpg`]), null);
  assert.equal(fotoParaProducto([`${base}/publicaciones/../productos/otro.jpg`]), null);
  assert.equal(fotoParaProducto([`${base}/publicaciones/uuid/foto.jpg?x=1`]), null);
  assert.equal(fotoParaProducto([]), null);
});

test("el nombre que suena a pack o combo abre la ficha como compuesto", () => {
  for (const n of ["Pack x2 Crema Nida", "COMBO Crema + Sérum", "Crema Nida 2x1", "Kit de limpieza", "Dúo de aceites", "Crema Nida x3"]) assert.equal(pareceCompuesto(n), true, n);
  for (const n of ["Crema Hidratante Nida 50 g", "Aceite de orégano 30 ml", "Mini taladro 12V"]) assert.equal(pareceCompuesto(n), false, n);
});

test("los componentes que se sugieren salen del nombre: un simple por cada parte del combo, o el simple del pack con su cantidad", () => {
  const simples = [
    { id: "a", codigo: "OXIDO/NITRICO", nombre: "Óxido Nítrico Gomitas" },
    { id: "b", codigo: "SHILAJIT", nombre: "Shilajit Resina" },
    { id: "c", codigo: "CREMA/NIDA", nombre: "Crema Hidratante Nida" },
    { id: "d", codigo: "CREMA/OTRA", nombre: "Crema de manos" },
  ];
  assert.deepEqual(sugerirComponentes("Oxido Nítrico + Shilajit 8 EN 1 Regalo", simples), [
    { componenteId: "a", cantidad: 1 },
    { componenteId: "b", cantidad: 1 },
  ]);
  assert.deepEqual(sugerirComponentes("Crema Hidratante Nida Pack 3", simples), [{ componenteId: "c", cantidad: 3 }]);
  // Sin pack ni combo no se adivina; una parte sin parecido se deja para buscarla a mano; «crema» sola no junta productos distintos.
  assert.deepEqual(sugerirComponentes("Crema Hidratante Nida", simples), []);
  assert.deepEqual(sugerirComponentes("Combo Shilajit + Producto Raro", simples), [{ componenteId: "b", cantidad: 1 }]);
  assert.deepEqual(sugerirComponentes("Combo Crema + Shilajit", simples).map((x) => x.componenteId), ["b"]);
  assert.deepEqual(sugerirComponentes("", simples), []);
});
