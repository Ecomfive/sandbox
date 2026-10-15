import type { DatosEmbed } from "./embed";
import type { VistaPublica } from "./vista-previa";

type Lectura<T> = { ok: true; datos: T } | { ok: false; error: string } | null;

/**
 * Junta lo que se leyó de la página pública del enlace en lo que se guarda: la vista previa (me gusta, comentarios, fecha, nombre y
 * cuenta) y la página de insertar (vistas, y me gusta y comentarios si la otra no los trae). Todo marcado como dato no oficial
 * (`fuente: "vista_previa"`) y con el motivo si alguna de las dos falló. También devuelve el copy de la publicación, para las capturas
 * que llegaron sin él (lo compartido desde el celular no lo trae). `ahora` solo existe para poder probarlo.
 */
export function cifrasDeLectura(vista: Lectura<VistaPublica>, embed: Lectura<DatosEmbed>, ahora: Date = new Date()): { metricas: Record<string, unknown>; autor: string | null; copy: string | null } {
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
