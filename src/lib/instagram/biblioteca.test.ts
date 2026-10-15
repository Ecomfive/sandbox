import assert from "node:assert/strict";
import { test } from "node:test";
import { copyCompletoPorBuscar, urlAnunciosDePagina, urlBibliotecaAnuncios, urlBusquedaTikTok, urlTopAdsTikTok } from "./biblioteca";

// El copy real de IG-0026 (15 oct 2026): con la primera línea la Biblioteca daba 340 resultados; con todo el copy, 1.
const COPY_IG26 =
  "✨ Hay joyas bonitas... y hay joyas que cuentan tu historia.\nCrea un Cofre de Tesoros único con los dijes que representan a las personas, lugares, profesiones, hobbies y sueños que más amas. 💖\nMás de 500 dijes para diseñar una joya que nadie más tendrá.\n🎁 El regalo más personal es el que habla de quien lo recibe.";

test("biblioteca: sin copy utilizable no hay búsqueda", () => {
  for (const x of [null, undefined, "", "   ", "🔥🔥🔥", "Hola"]) assert.equal(copyCompletoPorBuscar(x), null);
  assert.equal(urlBibliotecaAnuncios(null), null);
  assert.equal(urlBusquedaTikTok(null), null);
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

test("biblioteca: los anuncios de una página se buscan por su nombre exacto, sin la ciudad que agrega Facebook", () => {
  const u = urlAnunciosDePagina("Nenagoslingshop");
  assert.ok(u);
  assert.equal(new URL(u).searchParams.get("q"), '"Nenagoslingshop"');
  assert.equal(new URL(u).searchParams.get("search_type"), "keyword_exact_phrase");
  assert.equal(new URL(urlAnunciosDePagina("Oferta VE | Caracas") as string).searchParams.get("q"), '"Oferta VE"');
  assert.equal(new URL(urlAnunciosDePagina("Tienda & Más · Panamá") as string).searchParams.get("q"), '"Tienda Más"');
  for (const n of [null, undefined, "", "  ", "🔥", "|"]) assert.equal(urlAnunciosDePagina(n), null, String(n));
});

test("TikTok: la búsqueda usa las primeras palabras del copy y los Top Ads, el país", () => {
  const u = urlBusquedaTikTok(COPY_IG26);
  assert.ok(u);
  assert.equal(new URL(u).origin + new URL(u).pathname, "https://www.tiktok.com/search");
  assert.equal(new URL(u).searchParams.get("q"), "Hay joyas bonitas y hay joyas que cuentan tu historia");
  assert.equal(new URL(urlTopAdsTikTok("pa")).searchParams.get("region"), "PA");
  assert.equal(new URL(urlTopAdsTikTok(null)).searchParams.get("region"), "US");
  assert.equal(new URL(urlTopAdsTikTok("<script>")).searchParams.get("region"), "US");
});
