import assert from "node:assert/strict";
import test from "node:test";
import { archivoFacebookPermitido, archivosDeEmbedFacebook, interpretarFacebook, interpretarPaginaFacebook } from "./lectura-externa";

// Probado el 15 oct 2026 con un reel público de la página «Facebook»: el id de la página sale del código de la página del reel, su nombre
// de abrir `facebook.com/<id>` y el archivo de la página de «insertar» (`plugins/video.php`).
const META = (titulo: string, descripcion: string, url: string) =>
  `<meta property="og:type" content="video.other"/><meta property="og:title" content="${titulo}"/><meta property="og:description" content="${descripcion}"/><meta property="og:url" content="${url}"/>`;

test("Facebook: el id de la página sale del código de la página del reel", () => {
  const html = META("2,8&#xa0;mill. reproducciones &#xb7; 1353 reacciones | How to share with just friends. | Facebook", "How to share with just friends.", "https://www.facebook.com/reel/10153231379946729/") + '<script>{"props":{"pageID":"100064860875397","upstreamPlayerSource":null,"v":"10153231379946729"}}</script>';
  assert.equal(interpretarFacebook(html)?.paginaId, "100064860875397");
  // Sin `pageID`, el dueño del video.
  const conDueno = META("1 reproducción | Texto | Facebook", "Texto", "https://www.facebook.com/reel/10153231379946729/") + '<script>"owner":{"__typename":"User","id":"100064860875397","__isVideoOwner":"User"}</script>';
  assert.equal(interpretarFacebook(conDueno)?.paginaId, "100064860875397");
  assert.equal(interpretarFacebook(META("1 reproducción | Texto | Facebook", "Texto", "https://www.facebook.com/reel/1/"))?.paginaId, null);
});

test("Facebook: el nombre de la página sale de su vista previa", () => {
  const r = interpretarPaginaFacebook(META("Nuvo Venezuela", "Nuvo Venezuela. 12&#xa0;300&#xa0;seguidores", "https://www.facebook.com/nuvovenezuela/"));
  assert.deepEqual(r, { nombre: "Nuvo Venezuela", usuario: "nuvovenezuela" });
  // Una página sin nombre de usuario en la dirección (solo un número) queda sin usuario.
  assert.equal(interpretarPaginaFacebook(META("Tienda &amp; Más", "x", "https://www.facebook.com/profile.php?id=100064860875397"))?.usuario, null);
  assert.equal(interpretarPaginaFacebook(META("Tienda &amp; Más", "x", "https://www.facebook.com/profile.php?id=100064860875397"))?.nombre, "Tienda & Más");
  // Pide iniciar sesión: no es una página.
  assert.equal(interpretarPaginaFacebook(META("Inicia sesi&#xf3;n o reg&#xed;strate para verlo", "x", "https://www.facebook.com/login/")), null);
  assert.equal(interpretarPaginaFacebook("<html></html>"), null);
});

test("Facebook: el archivo sale de la página de insertar, con sus caracteres escapados", () => {
  const html = '{"aspect_ratio":1.77,"hd_src":"https:\\/\\/video-mia5-1.xx.fbcdn.net\\/o1\\/v\\/t2\\/f2\\/m412\\/AQO.mp4?_nc_cat=101\\u0026_nc_sid=8bf8fe\\u0026oe=6AD6","sd_src":"https:\\/\\/video-mia3-1.xx.fbcdn.net\\/o1\\/v\\/AQP.mp4?_nc_cat=111","x":1}';
  const r = archivosDeEmbedFacebook(html);
  assert.equal(r.hd, "https://video-mia5-1.xx.fbcdn.net/o1/v/t2/f2/m412/AQO.mp4?_nc_cat=101&_nc_sid=8bf8fe&oe=6AD6");
  assert.equal(r.sd, "https://video-mia3-1.xx.fbcdn.net/o1/v/AQP.mp4?_nc_cat=111");
  assert.deepEqual(archivosDeEmbedFacebook('{"hd_src":null,"sd_src":null}'), { hd: null, sd: null });
  assert.deepEqual(archivosDeEmbedFacebook("<html></html>"), { hd: null, sd: null });
});

test("Facebook: solo se baja un archivo de la red de archivos de Facebook", () => {
  assert.ok(archivoFacebookPermitido("https://video-mia5-1.xx.fbcdn.net/o1/v/a.mp4"));
  assert.ok(archivoFacebookPermitido("https://lookaside.fbsbx.com/lookaside/a"));
  for (const u of ["http://video.xx.fbcdn.net/a.mp4", "https://fbcdn.net.evil.com/a.mp4", "https://evil.com/fbcdn.net", "https://127.0.0.1/a", "javascript:alert(1)", null, 5]) assert.equal(archivoFacebookPermitido(u), null, String(u));
  // Un archivo de otro sitio dentro del bloque de datos no se acepta.
  assert.deepEqual(archivosDeEmbedFacebook('{"hd_src":"https:\\/\\/evil.com\\/a.mp4","sd_src":"https:\\/\\/video.xx.fbcdn.net\\/b.mp4"}'), { hd: null, sd: "https://video.xx.fbcdn.net/b.mp4" });
});
