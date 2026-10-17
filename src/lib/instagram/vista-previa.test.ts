import assert from "node:assert/strict";
import { test } from "node:test";
import { descripcionDeLaPagina, enlaceLegible, interpretarVistaPrevia, lecturaPublicaActiva, nombreDeVistaPrevia, tituloDeLaPagina } from "./vista-previa";

test("vista previa: lee me gusta, comentarios, cuenta y fecha de un texto real de Instagram", () => {
  const real = "43 likes, 12 comments - nuvotienda.ve on February 4, 2025: &quot;&#x2728;Nuestro Soporte celular para retrovisor brinda mayor";
  assert.deepEqual(interpretarVistaPrevia(real), { megusta: 43, comentarios: 12, usuario: "nuvotienda.ve", fecha: "2025-02-04", nombre: null, copy: "✨Nuestro Soporte celular para retrovisor brinda mayor" });
});

test("vista previa: miles con coma, K y M, un solo dato, y los que no se pueden leer", () => {
  assert.equal(interpretarVistaPrevia('1,234 likes, 56 comments - tienda on March 9, 2026: "x"')?.megusta, 1234);
  assert.equal(interpretarVistaPrevia('1.2K likes, 3 comments - tienda on March 9, 2026: "x"')?.megusta, 1200);
  assert.equal(interpretarVistaPrevia('2M likes, 3 comments - tienda on March 9, 2026: "x"')?.megusta, 2_000_000);
  assert.deepEqual(interpretarVistaPrevia('1 like - tienda on March 9, 2026: "x"'), { megusta: 1, comentarios: null, usuario: "tienda", fecha: "2026-03-09", nombre: null, copy: "x" });
  assert.deepEqual(interpretarVistaPrevia('7 comments - tienda on March 9, 2026: "x"'), { megusta: null, comentarios: 7, usuario: "tienda", fecha: "2026-03-09", nombre: null, copy: "x" });
  // Una fecha que no existe no se inventa; un texto cualquiera o vacío no da nada.
  assert.equal(interpretarVistaPrevia('1 like - tienda on February 31, 2026: "x"')?.fecha, null);
  assert.equal(interpretarVistaPrevia("Instagram: inicia sesión"), null);
  assert.equal(interpretarVistaPrevia(null), null);
});

test("vista previa: el texto sale de og:description (en cualquier orden de atributos) o de description", () => {
  const og = '<head><meta property="og:description" content="5 likes, 1 comments - a.b on May 1, 2025: &quot;hola&quot;" /></head>';
  assert.equal(descripcionDeLaPagina(og), "5 likes, 1 comments - a.b on May 1, 2025: &quot;hola&quot;");
  assert.equal(descripcionDeLaPagina('<meta content="x y" property="og:description">'), "x y");
  assert.equal(descripcionDeLaPagina('<meta name="description" content="solo descripción">'), "solo descripción");
  assert.equal(descripcionDeLaPagina("<html></html>"), null);
});

test("vista previa: solo se lee el enlace de un reel o una publicación de instagram.com", () => {
  assert.equal(enlaceLegible("https://www.instagram.com/reel/DFqpz-OxUx2/"), true);
  assert.equal(enlaceLegible("https://www.instagram.com/p/DeR1_WGsSMh/"), true);
  assert.equal(enlaceLegible("https://www.instagram.com/nuvotienda.ve/reel/DFqpz-OxUx2/"), true);
  assert.equal(enlaceLegible("https://www.instagram.com/nuvotienda.ve/"), false);
  assert.equal(enlaceLegible("http://www.instagram.com/reel/abc/"), false);
  assert.equal(enlaceLegible("https://evil.example/reel/abc/"), false);
  assert.equal(enlaceLegible("https://instagram.com.evil.example/p/abc/"), false);
  assert.equal(enlaceLegible("javascript:alert(1)"), false);
});

test("vista previa: la lectura está encendida salvo que se apague con 0, false o no", () => {
  assert.equal(lecturaPublicaActiva(undefined), true);
  assert.equal(lecturaPublicaActiva(""), true);
  assert.equal(lecturaPublicaActiva("1"), true);
  for (const v of ["0", "false", "no", " FALSE "]) assert.equal(lecturaPublicaActiva(v), false);
});

test("vista previa: el nombre de la cuenta sale del título, sin entidades HTML", () => {
  assert.equal(nombreDeVistaPrevia("Nuvo Venezuela on Instagram: &quot;&#x2728;Nuestro Soporte"), "Nuvo Venezuela");
  assert.equal(nombreDeVistaPrevia("Tom &amp; Jerry&#039;s Shop on Instagram: &quot;hola&quot;"), "Tom & Jerry's Shop");
  assert.equal(nombreDeVistaPrevia("Instagram"), null);
  assert.equal(nombreDeVistaPrevia(null), null);
  assert.equal(tituloDeLaPagina('<meta property="og:title" content="Nuvo Venezuela on Instagram: &quot;x&quot;" />'), "Nuvo Venezuela on Instagram: &quot;x&quot;");
  const r = interpretarVistaPrevia('43 likes, 12 comments - nuvotienda.ve on February 4, 2025: "x"', "Nuvo Venezuela on Instagram: &quot;x&quot;");
  assert.deepEqual(r, { megusta: 43, comentarios: 12, usuario: "nuvotienda.ve", fecha: "2025-02-04", nombre: "Nuvo Venezuela", copy: "x" });
});
