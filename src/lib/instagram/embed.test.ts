import assert from "node:assert/strict";
import { test } from "node:test";
import { archivoPermitido, contextoDeEmbed, interpretarEmbed, urlDeEmbed } from "./embed";

// La página de insertar guarda su bloque de datos como TEXTO dentro de otro JSON: aquí se arma igual que la real.
const pagina = (shortcodeMedia: unknown) => {
  const interno = JSON.stringify({ context: { type: "GraphVideo" }, gql_data: { shortcode_media: shortcodeMedia } });
  const externo = JSON.stringify({ contextJSON: interno });
  return `<html><body><script>window.__x = ${externo};</script></body></html>`;
};

const REEL = {
  __typename: "GraphVideo",
  shortcode: "DFqpz-OxUx2",
  is_video: true,
  display_url: "https://scontent-mia5-1.cdninstagram.com/v/portada.jpg?x=1",
  video_url: "https://scontent-mia3-3.cdninstagram.com/o1/v/t2/f2/m367/archivo.mp4?sig=abc",
  video_view_count: 974,
  video_duration: 24.125,
  edge_liked_by: { count: 43 },
  edge_media_to_comment: { count: 5 },
  owner: { id: "1", username: "nuvotienda.ve", is_verified: false },
  product_type: "clips",
};

test("embed: la dirección sale del código del enlace y solo de instagram.com", () => {
  assert.equal(urlDeEmbed("https://www.instagram.com/reel/DFqpz-OxUx2/"), "https://www.instagram.com/p/DFqpz-OxUx2/embed/captioned/");
  assert.equal(urlDeEmbed("https://www.instagram.com/nuvotienda.ve/"), null);
  assert.equal(urlDeEmbed("https://evil.example/p/ABC/"), null);
  assert.equal(urlDeEmbed(null), null);
});

test("embed: lee el video, las vistas, las cifras, la cuenta y el tipo de un reel", () => {
  const d = interpretarEmbed(pagina(REEL));
  assert.deepEqual(d, {
    esVideo: true,
    videoUrl: "https://scontent-mia3-3.cdninstagram.com/o1/v/t2/f2/m367/archivo.mp4?sig=abc",
    imagenUrl: "https://scontent-mia5-1.cdninstagram.com/v/portada.jpg?x=1",
    vistas: 974,
    megusta: 43,
    comentarios: 5,
    usuario: "nuvotienda.ve",
    duracion: 24.125,
    producto: "clips",
  });
});

test("embed: una foto trae su imagen y no un video", () => {
  const d = interpretarEmbed(pagina({ is_video: false, display_url: "https://scontent.cdninstagram.com/v/foto.jpg", owner: { username: "tienda" }, edge_media_preview_like: { count: 7 } }));
  assert.equal(d?.esVideo, false);
  assert.equal(d?.videoUrl, null);
  assert.equal(d?.imagenUrl, "https://scontent.cdninstagram.com/v/foto.jpg");
  assert.equal(d?.megusta, 7);
});

test("embed: nunca se acepta un archivo de otro sitio, de http ni una dirección rara", () => {
  for (const u of ["https://evil.example/a.mp4", "http://scontent.cdninstagram.com/a.mp4", "https://cdninstagram.com.evil.example/a.mp4", "javascript:alert(1)", "https://localhost/a.mp4", null, 5]) assert.equal(archivoPermitido(u), null);
  assert.ok(archivoPermitido("https://scontent.xx.fbcdn.net/v/a.mp4"));
  const d = interpretarEmbed(pagina({ ...REEL, video_url: "https://evil.example/a.mp4", display_url: "http://x.cdninstagram.com/a.jpg" }));
  assert.equal(d?.videoUrl, null);
  assert.equal(d?.imagenUrl, null);
});

test("embed: valores raros no dan cifras (negativos, texto) ni un usuario inventado", () => {
  const d = interpretarEmbed(pagina({ ...REEL, video_view_count: -4, edge_liked_by: { count: "43" }, edge_media_to_comment: { count: 1.4 }, owner: { username: "con espacios <b>" } }));
  assert.equal(d?.vistas, null);
  assert.equal(d?.megusta, null);
  assert.equal(d?.comentarios, 1);
  assert.equal(d?.usuario, null);
});

test("embed: una página sin el bloque de datos, o con otro formato, no da nada y no falla", () => {
  for (const h of ["", "<html>inicia sesión</html>", '{"contextJSON":"no es json"}', '{"contextJSON":"{\\"gql_data\\":{}}"}', pagina(null)]) assert.equal(interpretarEmbed(h), null);
  assert.equal(contextoDeEmbed("sin nada"), null);
});
