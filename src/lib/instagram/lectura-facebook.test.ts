import assert from "node:assert/strict";
import test from "node:test";
import { archivoFacebookPermitido, archivosDeEmbedFacebook, interpretarFacebook, interpretarPaginaFacebook } from "./lectura-externa";

// Probado el 15 oct 2026 con un reel público de la página «Facebook»: el id de la página sale del código de la página del reel, su nombre
// de abrir `facebook.com/<id>` y el archivo de la página de «insertar» (`plugins/video.php`).
const META = (titulo: string, descripcion: string, url = "https://www.facebook.com/reel/10153231379946729/") =>
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

test("Facebook: una publicación que no es video trae la foto y el nombre de la página en el título (anuncio de Custom Venezuela, 15 oct 2026)", () => {
  const html = '<meta property="og:type" content="video.other"/><meta property="og:title" content="Custom Venezuela"/><meta property="og:description" content="Los detalles marcan la diferencia."/><meta property="og:url" content="https://www.facebook.com/customvenezuela/posts/los-detalles-marcan-la-diferencia/122340408620224822/"/><meta property="og:image" content="https://www.facebook.com/ads/image/?d=AQIf6pKGEc"/>';
  const r = interpretarFacebook(html);
  assert.ok(r);
  assert.equal(r.nombrePagina, "Custom Venezuela");
  assert.equal(r.imagen, "https://www.facebook.com/ads/image/?d=AQIf6pKGEc");
  assert.equal(r.vistas, null);
  assert.equal(r.reacciones, null);
  assert.equal(r.copy, "Los detalles marcan la diferencia.");
  // Un reel (título con cifras) no toma ese título como nombre de la página.
  const reel = interpretarFacebook('<meta property="og:title" content="2,8&#xa0;mill. reproducciones &#xb7; 1353 reacciones | How to share with just friends. | Facebook"/><meta property="og:description" content="How to share"/>');
  assert.equal(reel?.nombrePagina, null);
  // Una imagen de otro sitio no se acepta.
  assert.equal(interpretarFacebook('<meta property="og:title" content="Tienda"/><meta property="og:image" content="https://evil.com/a.jpg"/>')?.imagen, null);
});

test("Facebook: el título es «cifras | texto completo | nombre de la página»; el texto sale completo y no cortado a 200 (reel de Oferta VE, 17 oct 2026)", () => {
  const completo = '⭐️ "Dejé de pagarle al técnico cada vez que necesitaba colgar algo."\nFranklin V.\n\nPagar a alguien cada vez que necesitas colgar un cuadro o armar un mueble te sale carísimo a la larga. Este nivel láser 3 en 1 te da la medida exacta.\n👉 Pide el tuyo con 20% OFF';
  const html = (t: string) => t.replace(/"/g, "&quot;");
  const r = interpretarFacebook(META(html(`1026 reproducciones &#xb7; 4 comentarios | ${completo} | Oferta VE`), html(`${completo.slice(0, 120)}...`), "https://www.facebook.com/reel/5676386115919148/"));
  assert.ok(r);
  assert.equal(r.vistas, 1026);
  assert.equal(r.comentarios, 4);
  assert.equal(r.reacciones, null);
  assert.equal(r.copy, completo);
  assert.equal(r.nombrePagina, "Oferta VE");
});

test("Facebook: las cifras se leen aunque el título no traiga la última parte, y el texto puede llevar « | » dentro", () => {
  // Título cortado por Facebook, sin nombre de página al final: solo cifras y texto.
  const r = interpretarFacebook(META("12&#xa0;mil reproducciones &#xb7; 11 reacciones | Hogar | decoración y más", "Hogar..."));
  assert.equal(r?.vistas, 12000);
  assert.equal(r?.reacciones, 11);
  // La última parte siempre se toma como el nombre de la página; el texto es lo de en medio.
  assert.equal(r?.nombrePagina, "decoración y más");
  assert.equal(r?.copy, "Hogar");
  // Con «Facebook» al final (el formato anterior) no se confunde con el nombre de una página.
  const antes = interpretarFacebook(META("2,8&#xa0;mill. reproducciones &#xb7; 1353 reacciones | How to share. | Facebook", "How to share."));
  assert.equal(antes?.nombrePagina, null);
  assert.equal(antes?.copy, "How to share.");
});

test("Facebook: un copy que solo trae descripción (sin título largo) se queda con la descripción", () => {
  const r = interpretarFacebook(META("Oferta de hoy | Facebook", "Oferta de hoy en toda la tienda"));
  assert.equal(r?.copy, "Oferta de hoy en toda la tienda");
});
