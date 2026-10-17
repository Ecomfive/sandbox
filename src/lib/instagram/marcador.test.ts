import assert from "node:assert/strict";
import test from "node:test";
import { codigoMarcador, decodificarLectura, marcadorBiblioteca } from "./marcador";

test("el marcador es un javascript: que se puede poner en un enlace", () => {
  const m = marcadorBiblioteca("https://mom-beta-proveduria.vercel.app/ruta/ignorada");
  assert.ok(m.startsWith("javascript:"));
  const codigo = decodeURIComponent(m.slice("javascript:".length));
  assert.ok(codigo.includes('"https://mom-beta-proveduria.vercel.app"'), "lleva solo el origen de la plataforma");
  assert.ok(!codigo.includes("/ruta/ignorada"));
  assert.ok(!codigo.includes("__ORIGEN__"));
  // Es JavaScript válido (no se ejecuta aquí: solo se compila).
  assert.doesNotThrow(() => new Function(codigo));
  // Es una sola línea: un favorito no lleva saltos de línea.
  assert.ok(!/[\r\n]/.test(codigo));
});

test("el marcador solo manda la lectura a una plataforma segura", () => {
  assert.doesNotThrow(() => codigoMarcador("http://localhost:3000"));
  assert.throws(() => codigoMarcador("http://ejemplo.com"));
  assert.throws(() => codigoMarcador("javascript:alert(1)"));
  assert.throws(() => codigoMarcador("no es una dirección"));
});

test("el marcador, ejecutado sobre una página falsa de la Biblioteca, arma la lectura que la plataforma decodifica", () => {
  const texto = "​\nActivo\nIdentificador de la biblioteca: 1428370656108071\nEn circulación desde el 10 oct 2026\nVer detalles del anuncio\nMundo Digital\nPublicidad\n⚡ Apoya tu bienestar corporal con Perfectx — ñandú\nMás información";
  const hoja = { children: [], textContent: "Identificador de la biblioteca: 1428370656108071" };
  const enlace = { href: "https://l.facebook.com/l.php?u=http%3A%2F%2Fclicksitienda.com%2Fp" };
  const paginaAnunciante = { href: "https://www.facebook.com/nenagoslingshop/" };
  const raiz = { innerText: texto, contains: (x: unknown) => x === hoja, querySelector: () => enlace, querySelectorAll: () => [enlace, paginaAnunciante] };
  const hijo: Record<string, unknown> = { ...hoja, parentElement: raiz };
  const abiertas: string[] = [];
  const documento = {
    querySelectorAll: () => [hijo],
    body: { innerText: "~4 resultados\n" + texto },
  };
  const ventana = { open: (u: string) => (abiertas.push(u), {}) };
  const ubicacion = { hostname: "www.facebook.com", pathname: "/ads/library/", href: "https://www.facebook.com/ads/library/?q=x" };
  const f = new Function("document", "location", "window", "alert", "btoa", "unescape", "encodeURIComponent", codigoMarcador("https://mom-beta-proveduria.vercel.app"));
  f(documento, ubicacion, ventana, (m: string) => assert.fail(m), btoa, unescape, encodeURIComponent);
  assert.equal(abiertas.length, 1);
  assert.ok(abiertas[0].startsWith("https://mom-beta-proveduria.vercel.app/instagram/biblioteca#d="));
  const lectura = decodificarLectura(abiertas[0].slice(abiertas[0].indexOf("#"))) as { v: number; u: string; r: string; t: { x: string; l: string | null; p: string | null }[] };
  assert.equal(lectura.v, 1);
  assert.equal(lectura.r, "~4 resultados");
  assert.equal(lectura.t.length, 1);
  assert.equal(lectura.t[0].x, texto, "el texto con acentos, emojis y símbolos vuelve intacto");
  assert.equal(lectura.t[0].l, enlace.href);
  assert.equal(lectura.t[0].p, paginaAnunciante.href, "el enlace de la página del anunciante viaja con la tarjeta");
});

test("decodificarLectura devuelve null con un fragmento roto", () => {
  assert.equal(decodificarLectura(""), null);
  assert.equal(decodificarLectura("#otra=1"), null);
  assert.equal(decodificarLectura("#d=!!!"), null);
  assert.equal(decodificarLectura("#d=AAAA"), null);
});
