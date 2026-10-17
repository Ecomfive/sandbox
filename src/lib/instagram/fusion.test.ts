import assert from "node:assert/strict";
import { test } from "node:test";
import { enviosDe, fusionar, todosLosEnvios, unirTextos, type FilaFusionable } from "./fusion";

const fila = (extra: Partial<FilaFusionable> = {}): FilaFusionable => ({
  mensaje_id: "m1:0",
  recibido_en: "2026-10-14T20:14:00.000Z",
  remitente_id: "222",
  remitente_usuario: "jhokserg",
  remitente_nombre: null,
  tipo: "post",
  enlace: null,
  titulo: "Copy",
  media_id: "777",
  texto_mensaje: null,
  video_ruta: null,
  video_bytes: null,
  video_error: null,
  autor_usuario: null,
  metricas: null,
  pagina_destino: null,
  notas: null,
  estado: "nuevo",
  ...extra,
});

test("fusionar: un archivo que llegó sin enlace se completa con el enlace y las cifras de la otra llegada", () => {
  const archivo = fila({ video_ruta: "a/video.mp4", video_bytes: 100 });
  const enlace = fila({ mensaje_id: "m2:0", recibido_en: "2026-10-14T20:16:00.000Z", tipo: "reel", enlace: "https://www.instagram.com/p/AB/", autor_usuario: "vohanh", metricas: { like_count: 9, nombre_pagina: "Mi Tienda", fuente: "vista_previa" } });
  const { cambios, archivoSobrante } = fusionar(archivo, enlace);
  assert.equal(cambios.enlace, "https://www.instagram.com/p/AB/");
  assert.equal(cambios.autor_usuario, "vohanh");
  assert.equal(cambios.video_ruta, undefined);
  assert.equal(archivoSobrante, null);
  const m = cambios.metricas as Record<string, unknown>;
  assert.equal(m.like_count, 9);
  assert.equal(m.nombre_pagina, "Mi Tienda");
  assert.deepEqual((m.envios as { mensaje_id: string }[]).map((e) => e.mensaje_id), ["m2:0"]);
});

test("fusionar: al revés, el enlace sin archivo recibe el archivo", () => {
  const enlace = fila({ enlace: "https://www.instagram.com/p/AB/" });
  const archivo = fila({ mensaje_id: "m2:0", video_ruta: "b/video.mp4", video_bytes: 5, video_error: null });
  const { cambios } = fusionar(enlace, archivo);
  assert.equal(cambios.video_ruta, "b/video.mp4");
  assert.equal(cambios.video_bytes, 5);
  assert.equal(cambios.video_error, null);
});

test("fusionar: nada de lo que la principal ya tenía se pisa, y el archivo repetido queda para borrar", () => {
  const principal = fila({ enlace: "https://www.instagram.com/p/AA/", titulo: "Mío", pagina_destino: "https://a.com", autor_usuario: "yo", video_ruta: "p/video.mp4", metricas: { like_count: 1, fuente: "manual" } });
  const otra = fila({ mensaje_id: "m2:0", enlace: "https://www.instagram.com/p/BB/", titulo: "Otro", pagina_destino: "https://b.com", autor_usuario: "otro", video_ruta: "o/video.mp4", metricas: { like_count: 99, comments_count: 4 } });
  const { cambios, archivoSobrante } = fusionar(principal, otra);
  for (const k of ["enlace", "titulo", "pagina_destino", "autor_usuario", "video_ruta"]) assert.equal(cambios[k], undefined, k);
  assert.equal(archivoSobrante, "o/video.mp4");
  const m = cambios.metricas as Record<string, unknown>;
  assert.equal(m.like_count, 1);
  assert.equal(m.comments_count, 4);
  assert.equal(m.fuente, "manual");
});

test("fusionar: une los textos y las notas sin repetir, y toma la decisión de la otra si la principal sigue «nuevo»", () => {
  const principal = fila({ texto_mensaje: "mira esta tienda", notas: "revisar precio" });
  const otra = fila({ mensaje_id: "m2:0", texto_mensaje: "mira esta tienda", notas: "pedir muestra", estado: "por_testear" });
  const { cambios } = fusionar(principal, otra);
  assert.equal(cambios.texto_mensaje, undefined);
  assert.equal(cambios.notas, "revisar precio\npedir muestra");
  assert.equal(cambios.estado, "por_testear");
  const conDecision = fusionar(fila({ estado: "descartado" }), fila({ mensaje_id: "m3:0", estado: "por_testear" }));
  assert.equal(conDecision.cambios.estado, undefined);
});

test("envíos: se suman sin repetir mensaje, ordenados por fecha, y los datos raros se ignoran", () => {
  const a = fila({ metricas: { envios: [{ mensaje_id: "m9:0", remitente_id: "5", remitente_usuario: "ana", remitente_nombre: null, recibido_en: "2026-10-14T19:00:00.000Z", tipo: "reel" }, { basura: 1 }, null, "x"] } });
  const b = fila({ mensaje_id: "m2:0", recibido_en: "2026-10-14T21:00:00.000Z", metricas: { envios: [{ mensaje_id: "m9:0", remitente_id: "5", recibido_en: "2026-10-14T19:00:00.000Z" }] } });
  const { cambios } = fusionar(a, b);
  const ids = (cambios.metricas as { envios: { mensaje_id: string }[] }).envios.map((e) => e.mensaje_id);
  assert.deepEqual(ids, ["m9:0", "m2:0"]);
  assert.deepEqual(todosLosEnvios(fila({ metricas: { envios: [{ mensaje_id: "m9:0", remitente_id: "5", recibido_en: "2026-10-14T19:00:00.000Z" }] } })).map((e) => e.mensaje_id), ["m9:0", "m1:0"]);
  assert.deepEqual(enviosDe({ envios: "x" }), []);
  assert.deepEqual(enviosDe(null), []);
});

test("unir textos: sin repetir y sin pasarse del límite", () => {
  assert.equal(unirTextos(null, null), null);
  assert.equal(unirTextos("a", null), "a");
  assert.equal(unirTextos(null, "b"), "b");
  assert.equal(unirTextos("hola mundo", "mundo"), "hola mundo");
  assert.equal(unirTextos("a", "b"), "a\nb");
  assert.equal(unirTextos("x".repeat(3990), "y".repeat(50))?.length, 4000);
});
