import type { DatosEmbed } from "./embed";
import type { ArchivosDePagina, VistaPublica } from "./vista-previa";

type Lectura<T> = { ok: true; datos: T } | { ok: false; error: string } | null;
/** La lectura de la vista previa, con los archivos que anunció la página principal (`og:video`, `og:image`). */
export type LecturaVista = { ok: true; datos: VistaPublica; archivos?: ArchivosDePagina } | { ok: false; error: string; archivos?: ArchivosDePagina } | null;

/**
 * Junta lo que se leyó de la página pública del enlace en lo que se guarda: la vista previa (me gusta, comentarios, fecha, nombre y
 * cuenta) y la página de insertar (vistas, y me gusta y comentarios si la otra no los trae). Todo marcado como dato no oficial
 * (`fuente: "vista_previa"`) y con el motivo si alguna de las dos falló. También devuelve el copy de la publicación, para las capturas
 * que llegaron sin él (lo compartido desde el celular no lo trae). `ahora` solo existe para poder probarlo.
 */
export function cifrasDeLectura(vista: LecturaVista, embed: Lectura<DatosEmbed>, ahora: Date = new Date()): { metricas: Record<string, unknown>; autor: string | null; copy: string | null } {
  const v = vista?.ok ? vista.datos : null;
  const e = embed?.ok ? embed.datos : null;
  const m: Record<string, unknown> = {};
  const megusta = v?.megusta ?? e?.megusta ?? null;
  const comentarios = v?.comentarios ?? e?.comentarios ?? null;
  if (megusta !== null) m.like_count = megusta;
  if (comentarios !== null) m.comments_count = comentarios;
  if (e?.vistas != null) m.view_count = e.vistas;
  if (v?.fecha) m.fecha_publicacion = v.fecha;
  if (v?.nombre) m.nombre_pagina = v.nombre;
  if (e?.duracion != null) m.duracion = Math.round(e.duracion * 10) / 10;
  if (e?.producto) m.producto = e.producto;
  if (v || e) {
    m.fuente = "vista_previa";
    m.leido_en = ahora.toISOString();
  }
  if (vista && !vista.ok) m.vista_previa_error = vista.error;
  if (embed && !embed.ok) m.embed_error = embed.error;
  return { metricas: m, autor: v?.usuario ?? e?.usuario ?? null, copy: v?.copy ?? null };
}

/** La dirección del archivo que se puede copiar de la lectura: el video, o la imagen solo si la publicación es una foto (la portada de un video no cuenta). */
export function archivoDeLectura(embed: Lectura<DatosEmbed>): string | null {
  if (!embed?.ok) return null;
  return embed.datos.esVideo === false ? embed.datos.imagenUrl : embed.datos.videoUrl;
}

/**
 * Todo lo que se puede bajar de la lectura, de lo mejor a lo peor: los **videos** (el de la página de «insertar» si es un video y el `og:video` de la
 * página principal) y las **imágenes** (la foto de una publicación de imagen y, al final, la portada de un video que no entregó su archivo).
 * Quien llama decide qué usar: sin archivo, el primero que se pueda bajar; con una imagen guardada, solo un video la mejora.
 */
export function candidatosDeArchivo(embed: Lectura<DatosEmbed>, vista: LecturaVista): { videos: string[]; imagenes: string[] } {
  const e = embed?.ok ? embed.datos : null;
  const p = vista?.archivos;
  const sinNulos = (a: (string | null | undefined)[]): string[] => [...new Set(a.filter((x): x is string => !!x))];
  return {
    videos: sinNulos([e && e.esVideo !== false ? e.videoUrl : null, p?.video]),
    imagenes: sinNulos([e && e.esVideo === false ? e.imagenUrl : null, p?.imagen, e?.imagenUrl]),
  };
}

/**
 * Pone una lectura sobre lo que la captura ya tenía. Si una persona corrigió algo (`fuente: "manual"`), solo se completa lo que
 * falta y no se pisa nada; si no, se refrescan las cifras. Lo que no esté en la lectura (la consulta a Meta, las notas unidas) se conserva.
 */
export function mezclarLectura(actual: Record<string, unknown> | null, lectura: Record<string, unknown>): Record<string, unknown> {
  const base = { ...(actual ?? {}) };
  if (base.fuente !== "manual") return { ...base, ...lectura };
  const salida = { ...base };
  for (const [clave, valor] of Object.entries(lectura)) {
    if (clave === "fuente" || clave === "leido_en") continue;
    if (salida[clave] === undefined) salida[clave] = valor;
  }
  return salida;
}
