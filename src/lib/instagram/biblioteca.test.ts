import assert from "node:assert/strict";
import { test } from "node:test";
import { copyCompletoPorBuscar, frasePorBuscar, urlBibliotecaAnuncios, urlBibliotecaPrimeraLinea } from "./biblioteca";

// El copy real de IG-0026 (15 oct 2026): con la primera línea la Biblioteca daba 340 resultados; con todo el copy, 1.
const COPY_IG26 =
  "✨ Hay joyas bonitas... y hay joyas que cuentan tu historia.\nCrea un Cofre de Tesoros único con los dijes que representan a las personas, lugares, profesiones, hobbies y sueños que más amas. 💖\nMás de 500 dijes para diseñar una joya que nadie más tendrá.\n🎁 El regalo más personal es el que habla de quien lo recibe.";

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
  for (const x of [null, undefined, "", "   ", "🔥🔥🔥", "Hola"]) assert.equal(copyCompletoPorBuscar(x), null);
  assert.equal(urlBibliotecaAnuncios(null), null);
  assert.equal(urlBibliotecaPrimeraLinea(null), null);
});

test("biblioteca: el copy completo se limpia a letras y números, sin saltos de línea, emojis ni puntuación", () => {
  assert.equal(
    copyCompletoPorBuscar(COPY_IG26),
    "Hay joyas bonitas y hay joyas que cuentan tu historia Crea un Cofre de Tesoros único con los dijes que representan a las personas lugares profesiones hobbies y sueños que más amas Más de 500 dijes para diseñar una joya que nadie más tendrá El regalo más personal es el que habla de quien lo recibe",
  );
  // Los acentos decompuestos (e + ´) se juntan en una sola letra en vez de partir la palabra.
  assert.equal(copyCompletoPorBuscar("Cúrcuma para ti"), "Cúrcuma para ti");
  assert.equal(copyCompletoPorBuscar("Cúrcuma+ 50 cápsulas por $10"), "Cúrcuma 50 cápsulas por 10");
});

test("biblioteca: un copy larguísimo se corta en el límite de una palabra", () => {
  const largo = Array.from({ length: 400 }, (_, i) => `palabra${i}`).join(" ");
  const r = copyCompletoPorBuscar(largo) as string;
  assert.ok(r.length <= 700 && r.length > 600);
  assert.ok(largo.startsWith(r));
  assert.ok(!r.endsWith(" "));
  assert.ok(/palabra\d+$/.test(r), "no termina a media palabra");
});

test("biblioteca: la dirección busca el copy completo como frase exacta en todos los países y está bien codificada", () => {
  const u = urlBibliotecaAnuncios(COPY_IG26);
  assert.ok(u);
  const url = new URL(u);
  assert.equal(url.origin + url.pathname, "https://www.facebook.com/ads/library/");
  assert.equal(url.searchParams.get("q"), `"${copyCompletoPorBuscar(COPY_IG26)}"`);
  assert.equal(url.searchParams.get("search_type"), "keyword_exact_phrase");
  assert.equal(url.searchParams.get("country"), "ALL");
  assert.equal(url.searchParams.get("active_status"), "all");
});

test("biblioteca: la búsqueda de la primera línea es aparte y solo existe si es distinta del copy completo", () => {
  const u = urlBibliotecaPrimeraLinea(COPY_IG26);
  assert.ok(u);
  assert.equal(new URL(u).searchParams.get("q"), '"Hay joyas bonitas"');
  // Un copy de una sola frase corta: la primera línea es lo mismo que el copy completo.
  assert.equal(urlBibliotecaPrimeraLinea("Apoya tu bienestar corporal con Perfectx"), null);
});
