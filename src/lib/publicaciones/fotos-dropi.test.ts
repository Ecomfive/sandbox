import assert from "node:assert/strict";
import test from "node:test";
import { galeriaDeProducto, planFotos, repetidasDe, rutaFotoDropi, rutasSinUso } from "./fotos-dropi";
import { CDN_FOTOS_DROPI, CLAVE_FOTO_JS, claveFoto, nombreSinPrefijo } from "./republicar-dropi";

const producto = {
  id: 8751,
  gallery: [
    { urlS3: "panama/products/8751/1779932274veganic 4.png", main: false, variation_id: null },
    { urlS3: "panama/products/8751/1779932274veganic.jpg", main: true, variation_id: null },
    { urlS3: "panama/products/8751/var.jpg", main: false, variation_id: 3 },
    { urlS3: "panama/products/8751/1779932274veganic.jpg", main: false, variation_id: null },
  ],
};

test("galería: sin variaciones ni repetidas, la principal primero y con su orden", () => {
  assert.deepEqual(galeriaDeProducto(producto, "pa"), [
    { nombre: "1779932274veganic.jpg", url: `${CDN_FOTOS_DROPI}/panama/products/8751/1779932274veganic.jpg`, alternas: [], principal: true, orden: 0 },
    { nombre: "1779932274veganic 4.png", url: `${CDN_FOTOS_DROPI}/panama/products/8751/1779932274veganic%204.png`, alternas: [], principal: false, orden: 1 },
  ]);
});

test("plan: baja lo que falta, pone al día lo copiado y marca lo que Dropi ya no lista", () => {
  const galeria = galeriaDeProducto(producto, "pa");
  const plan = planFotos(galeria, [
    { nombre: "1779932274veganic 4.png", principal: true, orden: 0, enDropi: true },
    { nombre: "vieja.jpg", principal: false, orden: 2, enDropi: true },
    { nombre: "ya-fuera.jpg", principal: false, orden: 3, enDropi: false },
  ]);
  assert.deepEqual(plan.bajar.map((f) => f.nombre), ["1779932274veganic.jpg"]);
  assert.deepEqual(plan.actualizar, [{ nombre: "1779932274veganic 4.png", principal: false, orden: 1 }]);
  assert.deepEqual(plan.fuera, ["vieja.jpg"]);
  assert.deepEqual(planFotos(galeria, galeria.map((f) => ({ nombre: f.nombre, principal: f.principal, orden: f.orden, enDropi: true }))), { bajar: [], actualizar: [], fuera: [], repetidas: [], rutasBorrar: [] });
});

test("ruta: en la carpeta de la publicación, sin espacios ni caracteres raros", () => {
  assert.equal(rutaFotoDropi("p1", "1779932274veganic 4.png", "png"), "publicaciones/p1/dropi/1779932274veganic-4.png");
  assert.equal(rutaFotoDropi("p1", "../../x.jpg", "jpg"), "publicaciones/p1/dropi/x.jpg");
});

test("clave: la misma foto con otro número de subida, formato o espacios es la misma", () => {
  assert.equal(claveFoto("1779932274veganic.jpg"), "veganic");
  assert.equal(claveFoto("17800000001779932274veganic.jpg"), "veganic");
  assert.equal(claveFoto("veganic.PNG"), "veganic");
  assert.notEqual(claveFoto("veganic 4.png"), claveFoto("veganic.jpg"));
  assert.equal(claveFoto("1779932274.jpg"), "1779932274", "solo números: no se queda vacía");
  assert.equal(nombreSinPrefijo("17800000001779932274veganic.jpg"), "veganic.jpg");
  assert.equal(nombreSinPrefijo("veganic.jpg"), "veganic.jpg");
});

test("clave: la del favorito (JS) da lo mismo que la de TypeScript", () => {
  const { ck, nl } = new Function(`${CLAVE_FOTO_JS}; return { ck, nl };`)() as { ck: (s: string) => string; nl: (s: string) => string };
  for (const n of ["1779932274veganic.jpg", "17800000001779932274veganic.jpg", "veganic 4.png", "1779932274.jpg", "Foto Rara (2).JPEG", "x"]) {
    assert.equal(ck(n), claveFoto(n), n);
    assert.equal(nl(n), nombreSinPrefijo(n), n);
  }
});

test("galería: la misma foto listada varias veces por Dropi (con otros números) sale una sola vez, la principal primero", () => {
  const g = galeriaDeProducto({
    id: 8751,
    gallery: [
      { urlS3: "panama/products/8751/1781111111anti.jpg", main: false, variation_id: null },
      { urlS3: "panama/products/8751/1779932274anti.jpg", main: true, variation_id: null },
      { urlS3: "panama/products/8751/17800000001779932274anti.jpg", main: true, variation_id: null },
      { urlS3: "panama/products/8751/1779932275otra.png", main: false, variation_id: null },
    ],
  }, "pa");
  assert.deepEqual(g.map((f) => [f.nombre, f.principal, f.orden]), [["1779932274anti.jpg", true, 0], ["1779932275otra.png", false, 1]]);
});

test("repetidas: de las copias de una misma foto se queda la que Dropi lista hoy y se quitan las demás, con sus archivos", () => {
  const g = [
    { nombre: "1779932274anti.jpg", principal: true, orden: 0, enDropi: true, ruta: "publicaciones/p/dropi/1779932274anti.jpg" },
    { nombre: "17800000001779932274anti.jpg", principal: true, orden: 1, enDropi: true, ruta: "publicaciones/p/dropi/17800000001779932274anti.jpg" },
    { nombre: "1781111111anti.jpg", principal: true, orden: 2, enDropi: true, ruta: "publicaciones/p/dropi/1781111111anti.jpg" },
    { nombre: "1779932275otra.png", principal: false, orden: 3, enDropi: true, ruta: "publicaciones/p/dropi/1779932275otra.png" },
  ];
  const { conservar, repetidas } = repetidasDe(g, new Set(["1781111111anti.jpg"]));
  assert.equal(conservar.get("anti")!.nombre, "1781111111anti.jpg");
  assert.deepEqual(repetidas.map((x) => x.nombre).sort(), ["1779932274anti.jpg", "17800000001779932274anti.jpg"]);
  assert.deepEqual(rutasSinUso(repetidas, conservar.values()).sort(), ["publicaciones/p/dropi/1779932274anti.jpg", "publicaciones/p/dropi/17800000001779932274anti.jpg"]);
  // Si dos copias comparten el archivo en Storage, no se borra el que se queda.
  assert.deepEqual(rutasSinUso([{ ...g[0], ruta: "r" }], [{ ...g[1], ruta: "r" }]), []);
});

test("plan: 17 copias de la principal en el sistema y una sola en Dropi → una se queda, 16 se quitan y no se baja nada", () => {
  const guardadas = Array.from({ length: 17 }, (_, i) => ({ nombre: `17${String(80000000 + i)}anti.jpg`, principal: true, orden: i, enDropi: true }));
  const galeria = galeriaDeProducto({ id: 1, gallery: [{ urlS3: "panama/products/1/1780000005anti.jpg", main: true, variation_id: null }] }, "pa");
  const plan = planFotos(galeria, guardadas);
  assert.deepEqual(plan.bajar, []);
  assert.equal(plan.repetidas.length, 16);
  assert.deepEqual(plan.actualizar.map((a) => [a.principal, a.orden]), [[true, 0]]);
  assert.deepEqual(plan.fuera, []);
});

test("plan: una foto que Dropi lista con otro número no se vuelve a bajar", () => {
  const galeria = galeriaDeProducto({ id: 1, gallery: [{ urlS3: "panama/products/1/1790000000anti.jpg", main: true, variation_id: null }] }, "pa");
  const plan = planFotos(galeria, [{ nombre: "1779932274anti.jpg", principal: true, orden: 0, enDropi: true }]);
  assert.deepEqual(plan.bajar, []);
  assert.deepEqual(plan.fuera, []);
  assert.deepEqual(plan.repetidas, []);
});
