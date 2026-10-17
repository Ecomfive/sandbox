import assert from "node:assert/strict";
import { test } from "node:test";
import type { DatosEmbed } from "./embed";
import { archivoDeLectura, candidatosDeArchivo, cifrasDeLectura, mezclarLectura } from "./lectura";
import type { VistaPublica } from "./vista-previa";

const AHORA = new Date("2026-10-14T20:00:00.000Z");
const vista: VistaPublica = { megusta: 43, comentarios: 12, usuario: "nuvotienda.ve", fecha: "2025-02-04", nombre: "Nuvo Venezuela", copy: "Nuestro Soporte celular para retrovisor" };
const embed: DatosEmbed = { esVideo: true, videoUrl: "https://x.cdninstagram.com/v.mp4", imagenUrl: "https://x.cdninstagram.com/p.jpg", vistas: 974, megusta: 40, comentarios: 5, usuario: "otro", duracion: 24.125, producto: "clips" };

test("lectura: la vista previa manda en me gusta, comentarios y cuenta; la página de insertar aporta las vistas", () => {
  const r = cifrasDeLectura({ ok: true, datos: vista }, { ok: true, datos: embed }, AHORA);
  assert.deepEqual(r.metricas, {
    like_count: 43,
    comments_count: 12,
    view_count: 974,
    fecha_publicacion: "2025-02-04",
    nombre_pagina: "Nuvo Venezuela",
    duracion: 24.1,
    producto: "clips",
    fuente: "vista_previa",
    leido_en: "2026-10-14T20:00:00.000Z",
  });
  assert.equal(r.autor, "nuvotienda.ve");
});

test("lectura: si la vista previa falla, la página de insertar cubre me gusta, comentarios y cuenta, y queda el motivo", () => {
  const r = cifrasDeLectura({ ok: false, error: "La vista previa no trae cifras." }, { ok: true, datos: embed }, AHORA);
  assert.equal(r.metricas.like_count, 40);
  assert.equal(r.metricas.comments_count, 5);
  assert.equal(r.metricas.vista_previa_error, "La vista previa no trae cifras.");
  assert.equal(r.autor, "otro");
});

test("lectura: si las dos fallan solo quedan los motivos y no se marca como leído", () => {
  const r = cifrasDeLectura({ ok: false, error: "a" }, { ok: false, error: "b" }, AHORA);
  assert.deepEqual(r.metricas, { vista_previa_error: "a", embed_error: "b" });
  assert.equal(r.autor, null);
  assert.deepEqual(cifrasDeLectura(null, null, AHORA), { metricas: {}, autor: null, copy: null });
});

test("lectura: el archivo es el video, o la imagen solo si es una foto (nunca la portada de un video)", () => {
  assert.equal(archivoDeLectura({ ok: true, datos: embed }), "https://x.cdninstagram.com/v.mp4");
  assert.equal(archivoDeLectura({ ok: true, datos: { ...embed, esVideo: false, videoUrl: null } }), "https://x.cdninstagram.com/p.jpg");
  assert.equal(archivoDeLectura({ ok: true, datos: { ...embed, videoUrl: null } }), null);
  assert.equal(archivoDeLectura({ ok: false, error: "x" }), null);
  assert.equal(archivoDeLectura(null), null);
});

test("mezclar: refresca las cifras y conserva la consulta a Meta y las notas unidas", () => {
  const actual = { consulta: { error: "x" }, notas_unidas: ["m1"], like_count: 2, fuente: "vista_previa" };
  const r = mezclarLectura(actual, { like_count: 50, view_count: 9, fuente: "vista_previa", leido_en: "t" });
  assert.deepEqual(r, { consulta: { error: "x" }, notas_unidas: ["m1"], like_count: 50, view_count: 9, fuente: "vista_previa", leido_en: "t" });
});

test("mezclar: lo corregido a mano no se pisa; solo se completa lo que falta", () => {
  const actual = { like_count: 1000, fuente: "manual" };
  const r = mezclarLectura(actual, { like_count: 50, comments_count: 7, view_count: 9, fuente: "vista_previa", leido_en: "t" });
  assert.deepEqual(r, { like_count: 1000, comments_count: 7, view_count: 9, fuente: "manual" });
  assert.deepEqual(mezclarLectura(null, { like_count: 3 }), { like_count: 3 });
});

test("candidatosDeArchivo: los videos (insertar y página principal) van antes que las imágenes, sin repetir", () => {
  const principal = { video: "https://y.cdninstagram.com/v2.mp4", imagen: "https://y.cdninstagram.com/p2.jpg", esVideo: true };
  const c = candidatosDeArchivo({ ok: true, datos: embed }, { ok: true, datos: vista, archivos: principal });
  assert.deepEqual(c.videos, ["https://x.cdninstagram.com/v.mp4", "https://y.cdninstagram.com/v2.mp4"]);
  // La portada de un video va al final de las imágenes: solo sirve cuando no hay video.
  assert.deepEqual(c.imagenes, ["https://y.cdninstagram.com/p2.jpg", "https://x.cdninstagram.com/p.jpg"]);
});

test("candidatosDeArchivo: un reel cuya página de insertar no trae el video lo toma de la página principal (IG-0005 e IG-0020)", () => {
  const sinVideo: DatosEmbed = { ...embed, videoUrl: null };
  const c = candidatosDeArchivo({ ok: true, datos: sinVideo }, { ok: false, error: "La vista previa no trae cifras.", archivos: { video: "https://y.cdninstagram.com/o1/v.mp4", imagen: null, esVideo: true } });
  assert.deepEqual(c.videos, ["https://y.cdninstagram.com/o1/v.mp4"]);
});

test("candidatosDeArchivo: una publicación de imagen aporta su foto y ningún video", () => {
  const foto: DatosEmbed = { ...embed, esVideo: false, videoUrl: null };
  const c = candidatosDeArchivo({ ok: true, datos: foto }, null);
  assert.deepEqual(c.videos, []);
  assert.deepEqual(c.imagenes, ["https://x.cdninstagram.com/p.jpg"]);
  assert.deepEqual(candidatosDeArchivo(null, null), { videos: [], imagenes: [] });
  assert.deepEqual(candidatosDeArchivo({ ok: false, error: "x" }, { ok: false, error: "y" }), { videos: [], imagenes: [] });
});
