import assert from "node:assert/strict";
import test from "node:test";
import { galeriaDeProducto, planFotos, planUnificar, repetidasDe, rutaFotoDropi, rutasSinUso, unaPorFoto } from "./fotos-dropi";
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

test("ruta: en la carpeta de la publicación, con la huella del contenido de nombre", () => {
  assert.equal(rutaFotoDropi("p1", "3A4F89569E6D1CB0238573B487465D9F", "png"), "publicaciones/p1/dropi/3a4f89569e6d1cb0238573b487465d9f.png");
  assert.equal(rutaFotoDropi("p1", "../../x", "jpg"), "publicaciones/p1/dropi/foto.jpg");
});

test("una por foto: la misma foto con otro nombre (mismo archivo) o con otro número de subida sale una vez, la primera", () => {
  // PUB-0446: nombres al azar distintos, el mismo archivo (la lectura los guarda con la huella de nombre).
  const fs = [
    { nombre: "b0e865aa-94e3-4d85-ba6c-e18249f8cd05.png", ruta: "publicaciones/p/dropi/aaa.png" },
    { nombre: "572be607-c0d5-4673-b7aa-f128495cc216.png", ruta: "publicaciones/p/dropi/aaa.png" },
    { nombre: "1779932274anti.jpg", ruta: "publicaciones/p/dropi/bbb.jpg" },
    { nombre: "1781111111anti.jpg", ruta: null },
    { nombre: "otra.jpg", ruta: "publicaciones/p/dropi/ccc.jpg" },
  ];
  assert.deepEqual(unaPorFoto(fs).map((f) => f.nombre), ["b0e865aa-94e3-4d85-ba6c-e18249f8cd05.png", "1779932274anti.jpg", "otra.jpg"]);
});

test("unificar: 17 archivos iguales con nombres distintos quedan en uno con su huella, y las 17 filas apuntan a él", () => {
  const h = "3a4f89569e6d1cb0238573b487465d9f";
  const filas = Array.from({ length: 17 }, (_, i) => ({ nombre: `uuid-${i}.png`, ruta: `publicaciones/p/dropi/uuid-${i}.png` }));
  const huellaDe = new Map<string, string | null>(filas.map((f) => [f.ruta, h]));
  huellaDe.set("publicaciones/p/dropi/otra.jpg", "ffffffffffffffffffffffffffffffff");
  const plan = planUnificar("p", [...filas, { nombre: "otra.jpg", ruta: "publicaciones/p/dropi/otra.jpg" }], huellaDe);
  assert.deepEqual(plan.mover, [
    { desde: "publicaciones/p/dropi/uuid-0.png", hacia: `publicaciones/p/dropi/${h}.png` },
    { desde: "publicaciones/p/dropi/otra.jpg", hacia: "publicaciones/p/dropi/ffffffffffffffffffffffffffffffff.jpg" },
  ]);
  assert.equal(plan.borrar.length, 16);
  assert.ok(!plan.borrar.includes("publicaciones/p/dropi/uuid-0.png"));
  assert.equal(plan.cambiarRuta.length, 18);
  assert.ok(plan.cambiarRuta.slice(0, 17).every((c) => c.ruta === `publicaciones/p/dropi/${h}.png`));
  assert.equal(plan.distintas, 2);
});

test("unificar: si el archivo ya tiene su huella de nombre no se mueve nada; sin huella no se toca", () => {
  const h = "0123456789abcdef0123456789abcdef";
  const filas = [
    { nombre: "a.png", ruta: `publicaciones/p/dropi/${h}.png` },
    { nombre: "b.png", ruta: "publicaciones/p/dropi/b.png" },
    { nombre: "c.png", ruta: "publicaciones/p/dropi/c.png" },
    { nombre: "d.png", ruta: null },
  ];
  const plan = planUnificar("p", filas, new Map([[`publicaciones/p/dropi/${h}.png`, h], ["publicaciones/p/dropi/b.png", h], ["publicaciones/p/dropi/c.png", null]]));
  assert.deepEqual(plan.mover, []);
  assert.deepEqual(plan.borrar, ["publicaciones/p/dropi/b.png"]);
  assert.deepEqual(plan.cambiarRuta, [{ nombre: "b.png", ruta: `publicaciones/p/dropi/${h}.png` }]);
  assert.equal(plan.distintas, 3);
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
