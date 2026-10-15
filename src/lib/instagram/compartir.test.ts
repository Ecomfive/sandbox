import assert from "node:assert/strict";
import test from "node:test";
import { enlaceDeCompartido, esEnvioPropio, llaveDeEnvio } from "./compartir";

test("saca el enlace del reel de lo que Android entrega al compartir", () => {
  const r = enlaceDeCompartido({ text: "https://www.instagram.com/reel/DeSh9KxMqNy/?igsh=MWx0dnZ6bTFzY2Z5Zg==", title: "", url: "" });
  assert.deepEqual(r, { enlace: "https://www.instagram.com/reel/DeSh9KxMqNy/", tipo: "reel", plataforma: "instagram", corto: false, paginaDestino: null });
});

test("entiende una publicación y un enlace dentro de un texto", () => {
  const r = enlaceDeCompartido({ text: "Mira esto 👉 https://www.instagram.com/p/DeSh9KxMqNy/?utm_source=ig_web_copy_link ¡qué bueno!" });
  assert.equal(r?.enlace, "https://www.instagram.com/p/DeSh9KxMqNy/");
  assert.equal(r?.tipo, "post");
});

test("el enlace puede venir en url o en el título, y con el usuario en la ruta", () => {
  assert.equal(enlaceDeCompartido({ url: "https://www.instagram.com/reel/AbC_123-x/" })?.enlace, "https://www.instagram.com/reel/AbC_123-x/");
  assert.equal(enlaceDeCompartido({ title: "https://instagram.com/tienda.pty/reel/AbC_123-x/" })?.enlace, "https://www.instagram.com/tienda.pty/reel/AbC_123-x/");
});

test("una página de la tienda en lo compartido queda como sugerencia de destino", () => {
  const r = enlaceDeCompartido({ text: "https://www.instagram.com/reel/AbC_123-x/ https://tienda.com/producto" });
  assert.equal(r?.paginaDestino, "https://tienda.com/producto");
});

test("no es un enlace de reel o publicación: se ignora", () => {
  assert.equal(enlaceDeCompartido({ text: "https://www.instagram.com/tienda.pty/" }), null);
  assert.equal(enlaceDeCompartido({ text: "https://www.instagram.com/stories/tienda/123/" }), null);
  assert.equal(enlaceDeCompartido({ text: "https://evil.com/reel/AbC123/" }), null);
  assert.equal(enlaceDeCompartido({ text: "http://www.instagram.com/reel/AbC123/" }), null);
  assert.equal(enlaceDeCompartido({ text: "sin enlace" }), null);
  assert.equal(enlaceDeCompartido({}), null);
  assert.equal(enlaceDeCompartido({ url: null, text: null, title: null }), null);
});

test("la llave de un envío se repite en los mismos 10 minutos y cambia después", () => {
  const e = "https://www.instagram.com/reel/AbC_123-x/";
  const t = Date.UTC(2026, 9, 15, 12, 0, 30);
  assert.equal(llaveDeEnvio("u1", e, t), llaveDeEnvio("u1", e, t + 60_000));
  assert.notEqual(llaveDeEnvio("u1", e, t), llaveDeEnvio("u1", e, t + 11 * 60_000));
  assert.notEqual(llaveDeEnvio("u1", e, t), llaveDeEnvio("u2", e, t));
  assert.match(llaveDeEnvio("u1", e, t) as string, /^web:u1:AbC_123-x:\d+$/);
  assert.equal(llaveDeEnvio("u1", "https://www.instagram.com/tienda/", t), null);
});

test("un envío propio no se le pregunta a Instagram", () => {
  assert.equal(esEnvioPropio("web:u1:AbC:5"), true);
  assert.equal(esEnvioPropio("17841461625047923"), false);
});

test("TikTok: lo que comparte la app (texto con el enlace corto) se reconoce", () => {
  const r = enlaceDeCompartido({ text: "Mira este TikTok de @scout2015 https://vt.tiktok.com/ZS8AbCdEf/", title: "" });
  assert.equal(r?.plataforma, "tiktok");
  assert.equal(r?.corto, true);
  assert.equal(r?.enlace, "https://vt.tiktok.com/ZS8AbCdEf/");
  // El enlace de TikTok no se toma como la página de destino de la tienda.
  assert.equal(r?.paginaDestino, null);
  const largo = enlaceDeCompartido({ url: "https://www.tiktok.com/@scout2015/video/6718335390845095173?_r=1" });
  assert.equal(largo?.enlace, "https://www.tiktok.com/@scout2015/video/6718335390845095173");
  assert.equal(largo?.corto, false);
});

test("Facebook: el enlace de compartir y el de un reel se reconocen", () => {
  assert.equal(enlaceDeCompartido({ text: "https://www.facebook.com/share/r/1AbCdEfGhI/?mibextid=x" })?.corto, true);
  const reel = enlaceDeCompartido({ url: "https://www.facebook.com/reel/10153231379946729?s=yWDuG2&fs=e" });
  assert.equal(reel?.plataforma, "facebook");
  assert.equal(reel?.enlace, "https://www.facebook.com/reel/10153231379946729");
  assert.equal(enlaceDeCompartido({ text: "https://fb.watch/xYz12AbC_/" })?.plataforma, "facebook");
  assert.equal(enlaceDeCompartido({ text: "https://www.facebook.com/tienda.pa" }), null);
});

test("una página de tienda junto al enlace de TikTok sí queda como destino sugerido", () => {
  const r = enlaceDeCompartido({ text: "https://vt.tiktok.com/ZS8AbCdEf/ https://tienda.com/producto" });
  assert.equal(r?.paginaDestino, "https://tienda.com/producto");
});

test("la llave de un envío sirve para cualquier red", () => {
  const t = Date.UTC(2026, 9, 15, 12, 0, 0);
  assert.match(llaveDeEnvio("u1", "https://www.tiktok.com/@a/video/6718335390845095173", t) as string, /^web:u1:6718335390845095173:\d+$/);
  assert.match(llaveDeEnvio("u1", "https://fb.watch/xYz12AbC_/", t) as string, /^web:u1:corto-xYz12AbC_:\d+$/);
});
