import assert from "node:assert/strict";
import test from "node:test";
import { archivoTikTokPermitido, cifraLocalizada, decodificarHtml, fechaEnPanama, interpretarFacebook, interpretarTikTok } from "./lectura-externa";

// La forma real del bloque de datos de la página de un video de TikTok (probada el 15 oct 2026 con @scout2015), reducida a lo que se lee.
const pagina = (item: unknown) => `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify({ __DEFAULT_SCOPE__: { "webapp.video-detail": { itemInfo: { itemStruct: item } } } })}</script></body></html>`;
const ITEM = {
  id: "6718335390845095173",
  desc: "Scramble up ur name & I’ll try to guess it😍❤️ #foryoupage #petsoftiktok #aesthetic",
  createTime: "1564234358",
  author: { uniqueId: "scout2015", nickname: "Scout, Suki & Stella" },
  stats: { diggCount: 35200, shareCount: 1511, commentCount: 5841, playCount: 159500, collectCount: "649" },
  video: { duration: 10, playAddr: "https://v16-webapp-prime.us.tiktok.com/video/tos/maliva/abc/?a=1&mime_type=video_mp4", cover: "https://p16-common-sign.tiktokcdn-us.com/x.jpeg" },
};

test("TikTok: lee el texto, la cuenta, la fecha, las cifras y el video de la página", () => {
  const r = interpretarTikTok(pagina(ITEM));
  assert.ok(r);
  assert.equal(r.copy, "Scramble up ur name & I’ll try to guess it😍❤️ #foryoupage #petsoftiktok #aesthetic");
  assert.equal(r.usuario, "scout2015");
  assert.equal(r.nombre, "Scout, Suki & Stella");
  assert.equal(r.fecha, "2019-07-27");
  assert.equal(r.megusta, 35200);
  assert.equal(r.comentarios, 5841);
  assert.equal(r.compartidos, 1511);
  assert.equal(r.vistas, 159500);
  assert.equal(r.enlace, "https://www.tiktok.com/@scout2015/video/6718335390845095173");
  assert.equal(r.videoUrl, ITEM.video.playAddr);
  assert.equal(r.duracion, 10);
});

test("TikTok: una página sin los datos del video (bloqueada o borrada) no devuelve nada", () => {
  assert.equal(interpretarTikTok("<html>captcha</html>"), null);
  assert.equal(interpretarTikTok(pagina(null)), null);
  assert.equal(interpretarTikTok('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">no es json</script>'), null);
  assert.equal(interpretarTikTok(pagina({ id: "x" })), null);
});

test("TikTok: solo se baja un video de la red de archivos de TikTok", () => {
  assert.equal(archivoTikTokPermitido("https://v16-webapp-prime.us.tiktok.com/video/a"), "https://v16-webapp-prime.us.tiktok.com/video/a");
  assert.equal(archivoTikTokPermitido("https://p16.tiktokcdn-us.com/a.mp4"), "https://p16.tiktokcdn-us.com/a.mp4");
  for (const u of ["http://v16.tiktok.com/a", "https://evil.com/tiktok.com", "https://tiktok.com.evil.com/a", "javascript:alert(1)", null, 5, "https://127.0.0.1/a"]) assert.equal(archivoTikTokPermitido(u), null, String(u));
  const r = interpretarTikTok(pagina({ ...ITEM, video: { playAddr: "https://evil.com/v.mp4", downloadAddr: "https://v16.tiktok.com/ok.mp4" } }));
  assert.equal(r?.videoUrl, "https://v16.tiktok.com/ok.mp4");
});

test("cifraLocalizada entiende las cifras de Facebook en español e inglés", () => {
  assert.equal(cifraLocalizada("1353"), 1353);
  assert.equal(cifraLocalizada("1.353"), 1353);
  assert.equal(cifraLocalizada("12 mil"), 12000);
  assert.equal(cifraLocalizada("2,8 mill."), 2_800_000);
  assert.equal(cifraLocalizada("2,8 mill."), 2_800_000);
  assert.equal(cifraLocalizada("2.8M"), 2_800_000);
  assert.equal(cifraLocalizada("1.3K"), 1300);
  assert.equal(cifraLocalizada("1,2 K"), 1200);
  assert.equal(cifraLocalizada("3 millones"), 3_000_000);
  assert.equal(cifraLocalizada("abc"), null);
  assert.equal(cifraLocalizada(null), null);
});

test("decodificarHtml", () => {
  assert.equal(decodificarHtml("2,8&#xa0;mill. reproducciones &#xb7; 1353 reacciones &amp; m&#xe1;s"), "2,8 mill. reproducciones · 1353 reacciones & más");
});

const fb = (titulo: string, descripcion: string, url = "https://www.facebook.com/reel/10153231379946729/") =>
  `<meta property="og:type" content="video.other"/><meta property="og:title" content="${titulo}"/><meta property="og:description" content="${descripcion}"/><meta property="og:url" content="${url}"/>`;

test("Facebook: el título trae las reproducciones y las reacciones; la descripción, el texto (texto real, 15 oct 2026)", () => {
  const r = interpretarFacebook(fb("2,8&#xa0;mill. reproducciones &#xb7; 1353 reacciones | How to share with just friends. | Facebook", "How to share with just friends."));
  assert.ok(r);
  assert.equal(r.copy, "How to share with just friends.");
  assert.equal(r.vistas, 2_800_000);
  assert.equal(r.reacciones, 1353);
  assert.equal(r.enlace, "https://www.facebook.com/reel/10153231379946729/");
});

test("Facebook: en inglés y con comentarios y compartidos", () => {
  const r = interpretarFacebook(fb("2.8M views &#xb7; 1.3K reactions &#xb7; 52 comments &#xb7; 12 shares | Oferta de hoy | Facebook", "Oferta de hoy en toda la tienda"));
  assert.equal(r?.vistas, 2_800_000);
  assert.equal(r?.reacciones, 1300);
  assert.equal(r?.comentarios, 52);
  assert.equal(r?.compartidos, 12);
  assert.equal(r?.copy, "Oferta de hoy en toda la tienda");
});

test("Facebook: un título sin cifras da solo el texto; una página que pide iniciar sesión no da nada", () => {
  const sola = interpretarFacebook(fb("Oferta de hoy | Facebook", "Oferta de hoy"));
  assert.equal(sola?.copy, "Oferta de hoy");
  assert.equal(sola?.vistas, null);
  assert.equal(interpretarFacebook(fb("Inicia sesi&#xf3;n o reg&#xed;strate para verlo", "Ve publicaciones, fotos y mucho m&#xe1;s en Facebook.")), null);
  assert.equal(interpretarFacebook("<html></html>"), null);
});

test("TikTok: los guardados salen de collectCount y la fecha es la de Panamá, no la de UTC (@snappypick, 17 oct 2026)", () => {
  // Publicado el 9 oct 2026 a las 03:00 UTC = 8 oct, 10 de la noche en Panamá: TikTok lo muestra «10-8».
  const segundos = String(Date.UTC(2026, 9, 9, 3, 0, 0) / 1000);
  const r = interpretarTikTok(pagina({ ...ITEM, createTime: segundos, stats: { diggCount: 21900, shareCount: 11700, commentCount: 520, playCount: 850500, collectCount: "8074" } }));
  assert.equal(r?.guardados, 8074);
  assert.equal(r?.fecha, "2026-10-08");
  assert.equal(fechaEnPanama(Date.UTC(2026, 9, 9, 6, 0, 0) / 1000), "2026-10-09");
  assert.equal(interpretarTikTok(pagina({ ...ITEM, stats: { diggCount: 1 } }))?.guardados, null);
});
