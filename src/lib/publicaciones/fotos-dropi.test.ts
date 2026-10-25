import assert from "node:assert/strict";
import test from "node:test";
import { galeriaDeProducto, planFotos, rutaFotoDropi } from "./fotos-dropi";
import { CDN_FOTOS_DROPI } from "./republicar-dropi";

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
  assert.deepEqual(planFotos(galeria, galeria.map((f) => ({ nombre: f.nombre, principal: f.principal, orden: f.orden, enDropi: true }))), { bajar: [], actualizar: [], fuera: [] });
});

test("ruta: en la carpeta de la publicación, sin espacios ni caracteres raros", () => {
  assert.equal(rutaFotoDropi("p1", "1779932274veganic 4.png", "png"), "publicaciones/p1/dropi/1779932274veganic-4.png");
  assert.equal(rutaFotoDropi("p1", "../../x.jpg", "jpg"), "publicaciones/p1/dropi/x.jpg");
});
