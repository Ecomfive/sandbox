import assert from "node:assert/strict";
import test from "node:test";
import { contenidoInicial } from "./landing";
import { archivosShopify, dominioTienda, htmlDescripcion, textoErrores, variantesShopify } from "./shopify";

const formato = (n: number) => `US$${n.toFixed(2)}`;

test("htmlDescripcion: bloques visibles en orden, texto escapado e imágenes del espacio", () => {
  const c = contenidoInicial();
  c.subtitulo = "Luz <cálida> & suave";
  c.beneficios = [{ titulo: "Sin cables", detalle: "Batería USB" }, { titulo: "", detalle: "" }];
  c.resenas = [{ texto: "Me encantó", nombre: "Ana", ciudad: "Panamá" }];
  c.secciones = c.secciones.map((s) => ({ ...s, visible: s.clave !== "comparativa" }));
  const html = htmlDescripcion({ nombre: "Luna", contenido: c, imagenes: { detalle: "https://cdn.shopify.com/d.jpg", en_uso: null }, ofertas: [], formato });
  assert.match(html, /Luz &lt;cálida&gt; &amp; suave/);
  assert.match(html, /<li><strong>Sin cables<\/strong>: Batería USB<\/li>/);
  assert.match(html, /src="https:\/\/cdn.shopify.com\/d.jpg"/);
  assert.match(html, /Me encantó/);
  assert.doesNotMatch(html, /lo de siempre/);
  assert.ok(html.indexOf("Por qué") < html.indexOf("Preguntas frecuentes"));
});

test("htmlDescripcion: las ofertas se listan solo si hay más de una con precio", () => {
  const c = contenidoInicial();
  const una = htmlDescripcion({ nombre: "X", contenido: c, imagenes: {}, ofertas: [{ nombre: "1 unidad", unidades: 1, precio: 30 }], formato });
  assert.doesNotMatch(una, /Aprovecha/);
  const dos = htmlDescripcion({ nombre: "X", contenido: c, imagenes: {}, ofertas: [{ nombre: "1 unidad", unidades: 1, precio: 30 }, { nombre: "2x1", unidades: 2, precio: 45 }], formato });
  assert.match(dos, /2x1<\/strong> \(2 unidades\): US\$45.00/);
});

test("variantesShopify: una variante por oferta, o la única con el precio de la landing", () => {
  const sola = variantesShopify({ precio: 39.9, precioTachado: 69.9, ofertas: [] });
  assert.deepEqual(sola.variants, [{ optionValues: [{ optionName: "Title", name: "Default Title" }], price: "39.90", compareAtPrice: "69.90", inventoryPolicy: "CONTINUE" }]);
  const varias = variantesShopify({ precio: 39.9, precioTachado: 69.9, ofertas: [{ nombre: "1 unidad", unidades: 1, precio: 39.9 }, { nombre: "2x1", unidades: 2, precio: 59 }, { nombre: "2X1", unidades: 2, precio: 50 }, { nombre: "Sin precio", unidades: 3, precio: null }] });
  assert.deepEqual(varias.productOptions, [{ name: "Oferta", values: [{ name: "1 unidad" }, { name: "2x1" }] }]);
  assert.equal(varias.variants[0].compareAtPrice, "69.90");
  assert.equal(varias.variants[1].compareAtPrice, null);
  assert.equal(varias.variants[1].price, "59.00");
});

test("archivosShopify: conserva por id lo que no cambió y sube lo nuevo, con la portada primero", () => {
  const a = archivosShopify(
    { en_uso: { ruta: "l/2.jpg", url: "https://s/2" }, portada: { ruta: "l/1.jpg", url: "https://s/1" } },
    { portada: { mediaId: "gid://shopify/MediaImage/9", ruta: "l/1.jpg", url: null }, en_uso: { mediaId: "gid://shopify/MediaImage/8", ruta: "l/viejo.jpg", url: null } },
    "Luna",
  );
  assert.deepEqual(a, [
    { espacio: "portada", entrada: { id: "gid://shopify/MediaImage/9" } },
    { espacio: "en_uso", entrada: { originalSource: "https://s/2", contentType: "IMAGE", alt: "Luna · En uso" } },
  ]);
});

test("dominioTienda y textoErrores", () => {
  assert.equal(dominioTienda("oferfy"), "oferfy.myshopify.com");
  assert.equal(dominioTienda("https://Oferfy.myshopify.com/admin"), "oferfy.myshopify.com");
  assert.equal(dominioTienda("oferfystore.com"), null);
  assert.equal(dominioTienda(""), null);
  assert.equal(textoErrores([{ field: ["title"], message: "Title can't be blank" }]), "Title can't be blank");
  assert.equal(textoErrores([]), null);
});
