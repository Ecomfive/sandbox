import assert from "node:assert/strict";
import { test } from "node:test";
import { frasePorBuscar, urlBibliotecaAnuncios, urlGoogleDeInstagram } from "./biblioteca";

test("biblioteca: la frase es el arranque del copy, sin emojis y hasta el primer signo", () => {
  assert.equal(frasePorBuscar("⚡ Apoya tu bienestar corporal con Perfectx Joint & Bone Therapy Cream, la crema concentrada"), "Apoya tu bienestar corporal con Perfectx Joint");
  assert.equal(frasePorBuscar("✨Nuestro Soporte celular para retrovisor brinda mayor concentración al conductor"), "Nuestro Soporte celular para retrovisor brinda mayor concentración");
  assert.equal(frasePorBuscar("Estos son algunos de los beneficios de Los Guantes de Compresión Cobrevida🤗 ✔ Fácil de usar"), "Estos son algunos de los beneficios de Los");
});

test("biblioteca: salta las líneas vacías y sin letras, y completa si el primer tramo es demasiado corto", () => {
  assert.equal(frasePorBuscar("\n\n🔥🔥\nOferta limitada hoy mismo en toda la tienda"), "Oferta limitada hoy mismo en toda la tienda");
  assert.equal(frasePorBuscar("¡Ya llegó! Crema para articulaciones con colágeno"), "Ya llegó Crema para articulaciones con colágeno");
});

test("biblioteca: sin copy utilizable no hay búsqueda", () => {
  for (const x of [null, undefined, "", "   ", "🔥🔥🔥", "Hola"]) assert.equal(frasePorBuscar(x), null);
  assert.equal(urlBibliotecaAnuncios(null), null);
});

test("biblioteca: la dirección busca la frase exacta en todos los países y está bien codificada", () => {
  const u = urlBibliotecaAnuncios("⚡ Apoya tu bienestar corporal con Perfectx Joint & Bone Therapy Cream");
  assert.ok(u);
  const url = new URL(u);
  assert.equal(url.origin + url.pathname, "https://www.facebook.com/ads/library/");
  assert.equal(url.searchParams.get("q"), '"Apoya tu bienestar corporal con Perfectx Joint"');
  assert.equal(url.searchParams.get("search_type"), "keyword_exact_phrase");
  assert.equal(url.searchParams.get("country"), "ALL");
  assert.equal(url.searchParams.get("active_status"), "all");
});

test("biblioteca: con el nombre de la página busca sus palabras junto con las del copy", () => {
  const u = urlBibliotecaAnuncios("⚡ Apoya tu bienestar corporal con Perfectx Joint & Bone Therapy Cream", "Mundo Digital");
  assert.ok(u);
  const url = new URL(u);
  assert.equal(url.searchParams.get("q"), "Mundo Digital Apoya tu bienestar corporal con Perfectx Joint");
  assert.equal(url.searchParams.get("search_type"), "keyword_unordered");
  // Un nombre vacío o solo de símbolos vuelve a la frase exacta.
  for (const n of [null, undefined, "", "  ", "🔥🔥"]) assert.equal(new URL(urlBibliotecaAnuncios("Apoya tu bienestar corporal con Perfectx", n) as string).searchParams.get("search_type"), "keyword_exact_phrase");
});

test("google: busca en instagram.com la frase del copy, hasta 10 palabras", () => {
  const u = urlGoogleDeInstagram("✨Nuestro Soporte celular para retrovisor brinda mayor concentración al conductor al momento de manejar");
  assert.ok(u);
  const url = new URL(u);
  assert.equal(url.origin + url.pathname, "https://www.google.com/search");
  assert.equal(url.searchParams.get("q"), 'site:instagram.com "Nuestro Soporte celular para retrovisor brinda mayor concentración al conductor"');
  for (const x of [null, undefined, "", "🔥🔥", "Hola"]) assert.equal(urlGoogleDeInstagram(x), null);
});
