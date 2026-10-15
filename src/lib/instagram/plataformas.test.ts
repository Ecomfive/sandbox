import assert from "node:assert/strict";
import test from "node:test";
import { codigoDeContenido, plataformaDeEnlace, plataformaDeMetricas, reconocerEnlace } from "./plataformas";

test("Instagram: se limpia el enlace y se saca el código", () => {
  const r = reconocerEnlace("https://www.instagram.com/reel/DeSh9KxMqNy/?igsh=MWx0dnZ6bTFzY2Z5Zg==");
  assert.deepEqual(r, { plataforma: "instagram", enlace: "https://www.instagram.com/reel/DeSh9KxMqNy/", codigo: "DeSh9KxMqNy", tipo: "reel", corto: false });
  assert.equal(reconocerEnlace("https://instagram.com/tienda.pty/p/AbC_1-x/")?.codigo, "AbC_1-x");
  assert.equal(reconocerEnlace("https://www.instagram.com/tienda.pty/"), null);
  assert.equal(reconocerEnlace("http://www.instagram.com/reel/AbC123/"), null);
});

test("TikTok: el enlace largo trae la cuenta y el id del video", () => {
  const r = reconocerEnlace("https://www.tiktok.com/@scout2015/video/6718335390845095173?_r=1&u_code=abc&is_from_webapp=1");
  assert.deepEqual(r, { plataforma: "tiktok", enlace: "https://www.tiktok.com/@scout2015/video/6718335390845095173", codigo: "6718335390845095173", tipo: "video", corto: false });
  assert.equal(reconocerEnlace("https://m.tiktok.com/@a.b/video/6718335390845095173")?.enlace, "https://www.tiktok.com/@a.b/video/6718335390845095173");
  // Un perfil, o un video de otro sitio, no es un contenido.
  assert.equal(reconocerEnlace("https://www.tiktok.com/@scout2015"), null);
  assert.equal(reconocerEnlace("https://evil.com/@scout2015/video/6718335390845095173"), null);
});

test("TikTok: los enlaces cortos se reconocen y se marcan como cortos", () => {
  for (const u of ["https://vm.tiktok.com/ZMrAbCdEf/", "https://vt.tiktok.com/ZS8AbCdEf/?utm=x", "https://www.tiktok.com/t/ZT8AbCdEf/"]) {
    const r = reconocerEnlace(u);
    assert.ok(r, u);
    assert.equal(r.plataforma, "tiktok");
    assert.equal(r.corto, true);
    assert.match(r.codigo, /^corto-/);
    assert.ok(!r.enlace.includes("?"));
  }
  assert.equal(reconocerEnlace("https://vm.tiktok.com/")?.corto, undefined);
});

test("Facebook: reel, watch, video y publicación", () => {
  assert.equal(reconocerEnlace("https://www.facebook.com/reel/10153231379946729/?s=single_unit")?.enlace, "https://www.facebook.com/reel/10153231379946729");
  const watch = reconocerEnlace("https://www.facebook.com/watch/?v=10153231379946729&ref=sharing");
  assert.equal(watch?.enlace, "https://www.facebook.com/reel/10153231379946729");
  assert.equal(watch?.codigo, "10153231379946729");
  assert.equal(reconocerEnlace("https://m.facebook.com/tienda.pa/videos/10153231379946729/")?.enlace, "https://www.facebook.com/tienda.pa/videos/10153231379946729");
  const post = reconocerEnlace("https://www.facebook.com/tienda.pa/posts/pfbid02AbCdEfGhIjKlMnOp?__cft__=x");
  assert.equal(post?.tipo, "post");
  assert.equal(post?.enlace, "https://www.facebook.com/tienda.pa/posts/pfbid02AbCdEfGhIjKlMnOp");
  assert.equal(reconocerEnlace("https://www.facebook.com/permalink.php?story_fbid=1234567890&id=100001&ref=x")?.enlace, "https://www.facebook.com/permalink.php?story_fbid=1234567890&id=100001");
});

test("Facebook: los enlaces de compartir y fb.watch son cortos", () => {
  const a = reconocerEnlace("https://www.facebook.com/share/r/1AbCdEfGhI/?mibextid=xyz");
  assert.deepEqual(a, { plataforma: "facebook", enlace: "https://www.facebook.com/share/r/1AbCdEfGhI/", codigo: "corto-1AbCdEfGhI", tipo: "video", corto: true });
  assert.equal(reconocerEnlace("https://www.facebook.com/share/p/1AbCdEfGhI/")?.tipo, "post");
  const w = reconocerEnlace("https://fb.watch/xYz12AbC_/");
  assert.equal(w?.corto, true);
  assert.equal(w?.enlace, "https://fb.watch/xYz12AbC_/");
});

test("Facebook: lo que no es un contenido se ignora", () => {
  for (const u of ["https://www.facebook.com/", "https://www.facebook.com/tienda.pa", "https://www.facebook.com/groups/123456789/", "https://www.facebook.com/reel/abc", "https://facebook.com.evil.com/reel/10153231379946729", "http://www.facebook.com/reel/10153231379946729", "no es un enlace", null, undefined, ""]) {
    assert.equal(reconocerEnlace(u as string), null, String(u));
  }
});

test("codigoDeContenido y plataformaDeEnlace", () => {
  assert.equal(codigoDeContenido("https://www.tiktok.com/@scout2015/video/6718335390845095173"), "6718335390845095173");
  assert.equal(codigoDeContenido("https://www.instagram.com/p/AbC123/"), "AbC123");
  assert.equal(codigoDeContenido(null), null);
  assert.equal(plataformaDeEnlace("https://www.tiktok.com/@a/video/6718335390845095173"), "tiktok");
  assert.equal(plataformaDeEnlace("https://fb.watch/xYz12AbC_/"), "facebook");
  assert.equal(plataformaDeEnlace(null), "instagram");
});

test("plataformaDeMetricas: sin dato es Instagram", () => {
  assert.equal(plataformaDeMetricas("tiktok"), "tiktok");
  assert.equal(plataformaDeMetricas("facebook"), "facebook");
  for (const v of [undefined, null, "", "instagram", "otra", 5]) assert.equal(plataformaDeMetricas(v), "instagram");
});

test("Facebook: los demás enlaces que manda la app (compartir sin letra, fotos, grupos, videos con título)", () => {
  const sin = reconocerEnlace("https://www.facebook.com/share/1AbCdEfGhI/?mibextid=x");
  assert.deepEqual(sin, { plataforma: "facebook", enlace: "https://www.facebook.com/share/1AbCdEfGhI/", codigo: "corto-1AbCdEfGhI", tipo: "otro", corto: true });
  assert.equal(reconocerEnlace("https://www.facebook.com/photo/?fbid=1234567890123&set=a.99")?.enlace, "https://www.facebook.com/photo/?fbid=1234567890123");
  assert.equal(reconocerEnlace("https://www.facebook.com/photo.php?fbid=1234567890123")?.codigo, "1234567890123");
  assert.equal(reconocerEnlace("https://www.facebook.com/tienda.pa/photos/a.123456/1234567890123/?type=3")?.enlace, "https://www.facebook.com/photo/?fbid=1234567890123");
  assert.equal(reconocerEnlace("https://www.facebook.com/groups/ventaspanama/posts/1234567890123/")?.enlace, "https://www.facebook.com/groups/ventaspanama/posts/1234567890123");
  assert.equal(reconocerEnlace("https://www.facebook.com/groups/ventaspanama/permalink/1234567890123/")?.tipo, "post");
  assert.equal(reconocerEnlace("https://www.facebook.com/tienda.pa/videos/mi-titulo/1234567890123/")?.enlace, "https://www.facebook.com/tienda.pa/videos/1234567890123");
  assert.equal(reconocerEnlace("https://www.facebook.com/watch/live/?v=1234567890123")?.enlace, "https://www.facebook.com/reel/1234567890123");
  assert.equal(reconocerEnlace("https://www.facebook.com/groups/ventaspanama/"), null);
});
