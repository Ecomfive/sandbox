import assert from "node:assert/strict";
import test from "node:test";
import { sumarProductoShopify, urlProductoShopify, contenidoInicial, faltantesLanding, leerReferencia, nombreArchivo, normalizarContenido, normalizarImagenes, rutaDeLanding, SECCIONES } from "./landing";

const ID = "0192f0aa-1111-7222-8333-444455556666";

test("normalizarContenido: recorta, ignora lo desconocido y completa las secciones sin repetir", () => {
  const c = normalizarContenido({
    titular: "x".repeat(500),
    beneficios: Array.from({ length: 9 }, () => ({ titulo: "B", detalle: "D", otro: 1 })),
    secciones: [{ clave: "garantia", visible: true }, { clave: "garantia", visible: false }, { clave: "nada" }, { clave: "portada", visible: false }],
    malicioso: "<script>",
  });
  assert.equal(c.titular.length, 140);
  assert.equal(c.beneficios.length, 4);
  assert.deepEqual(c.beneficios[0], { titulo: "B", detalle: "D" });
  assert.deepEqual(c.secciones.slice(0, 2), [{ clave: "garantia", visible: true }, { clave: "portada", visible: false }]);
  assert.equal(c.secciones.length, SECCIONES.length);
  // Las que no venían quedan al final y ocultas.
  assert.ok(c.secciones.slice(2).every((s) => !s.visible));
  assert.ok(!("malicioso" in c));
});

test("normalizarContenido: sin datos da el contenido de partida", () => {
  assert.deepEqual(normalizarContenido(null), contenidoInicial());
  assert.deepEqual(normalizarContenido({}), contenidoInicial());
});

test("rutaDeLanding: solo archivos de la carpeta de esa landing", () => {
  assert.ok(rutaDeLanding(`${ID}/portada-123.png`, ID));
  assert.ok(!rutaDeLanding(`${ID}/../otra/x.png`, ID));
  assert.ok(!rutaDeLanding(`${ID}/sub/x.png`, ID));
  assert.ok(!rutaDeLanding(`otra/${ID}/x.png`, ID));
  assert.ok(!rutaDeLanding(`${ID}/x.png?token=1`, ID));
});

test("normalizarImagenes: descarta rutas ajenas y pone la instrucción de partida", () => {
  const i = normalizarImagenes({ portada: { ruta: "otra/x.png", instruccion: "" }, detalle: { ruta: `${ID}/d.png`, instruccion: "Mía" } }, ID);
  assert.equal(i.portada.ruta, null);
  assert.ok(i.portada.instruccion.length > 10);
  assert.deepEqual(i.detalle, { ruta: `${ID}/d.png`, instruccion: "Mía" });
});

test("nombreArchivo: sin acentos ni caracteres raros", () => {
  assert.equal(nombreArchivo("Lámpara luna (1).PNG"), "Lampara-luna-1-.PNG");
  assert.equal(nombreArchivo("../../x"), "x");
  assert.equal(nombreArchivo(""), "imagen");
});

test("faltantesLanding: pide titular, precio, portada y lo de los bloques visibles", () => {
  const contenido = contenidoInicial();
  const imagenes = normalizarImagenes({}, ID);
  const f = faltantesLanding({ nombre: "X", precio: null, contenido, imagenes });
  assert.ok(f.includes("El titular") && f.includes("El precio") && f.includes("La imagen de portada"));
  // Las reseñas arrancan ocultas: no se piden.
  assert.ok(!f.some((x) => x.startsWith("Al menos una reseña")));
});

test("leerReferencia: título, encabezados en orden, imágenes grandes y botones de compra", () => {
  const html = `<html><head><title>Lámpara &amp; luna</title><script>var h1 = "<h1>no</h1>"</script></head><body>
    <img src="/logo.png"><img src="//cdn.tienda.com/a.jpg" width="800"><img data-src="b.webp"><img src="data:image/png;base64,xx">
    <img src="/mini.jpg" width="40">
    <h1>Ilumina tu <b>noche</b></h1><h2>Beneficios</h2><h3>Beneficios</h3><h2>Opiniones</h2>
    <button>Comprar ahora</button><a href="#">Lo quiero</a><a href="/">Inicio</a></body></html>`;
  const r = leerReferencia(html, "https://tienda.com/products/lampara");
  assert.equal(r.titulo, "Lámpara & luna");
  assert.deepEqual(
    r.encabezados.map((e) => `${e.nivel}:${e.texto}`),
    ["1:Ilumina tu noche", "2:Beneficios", "2:Opiniones"],
  );
  assert.deepEqual(r.imagenes, ["https://cdn.tienda.com/a.jpg", "https://tienda.com/products/b.webp"]);
  assert.equal(r.botonesCompra, 2);
});

test("leerReferencia: sin el carrito, el menú ni el pie de la tienda, y con entidades", () => {
  const html = `<header><h2>Menu</h2></header><h2>Tu carrito esta vacío</h2><h1>Torre &ndash; Regleta</h1><h2>Por qué elegirla</h2><footer><h2>Enlaces de interés</h2></footer>`;
  assert.deepEqual(
    leerReferencia(html, "https://t.com/").encabezados.map((e) => e.texto),
    ["Torre – Regleta", "Por qué elegirla"],
  );
});

test("urlProductoShopify y sumarProductoShopify: la descripción y las fotos del producto", () => {
  assert.equal(urlProductoShopify("https://oferfy.com/products/torre-regleta?variant=1"), "https://oferfy.com/products/torre-regleta.js");
  assert.equal(urlProductoShopify("https://oferfy.com/collections/x"), null);
  const base = leerReferencia("<h1>Torre</h1>", "https://oferfy.com/products/torre");
  const r = sumarProductoShopify(base, { description: "<h2>Beneficios</h2><h1>Torre</h1><img src='//cdn.shopify.com/d.jpg'>", images: ["//cdn.shopify.com/a.jpg"] }, "https://oferfy.com/products/torre");
  assert.deepEqual(r.encabezados.map((e) => e.texto), ["Torre", "Beneficios"]);
  assert.deepEqual(r.imagenes, ["https://cdn.shopify.com/a.jpg", "https://cdn.shopify.com/d.jpg"]);
});

test("mismaImagen: la misma foto en otro tamaño cuenta una vez", () => {
  const base = leerReferencia("<h1>X</h1><img src='https://t.com/cdn/shop/files/a.webp?v=1&width=1946'><img src='https://cdn.shopify.com/s/files/1/files/a.webp?v=1'><img src='https://t.com/b.jpg'>", "https://t.com/");
  assert.equal(base.imagenes.length, 2);
});
