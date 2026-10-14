/**
 * Los campos que se piden a Instagram del reel o la publicación compartida (su id viene en el aviso del DM). Es una prueba de
 * lo que Meta deja leer de una publicación ajena: la respuesta completa (o el error) se guarda en `metricas.consulta` para
 * poder revisarla, y de ella solo se aprovecha lo que se entiende y es seguro.
 */
export const CAMPOS_MEDIA = "id,caption,comments_count,like_count,media_type,media_url,permalink,thumbnail_url,timestamp,username";

export interface MediaConsultada {
  usuario: string | null;
  megusta: number | null;
  comentarios: number | null;
  /** El enlace de Instagram de la publicación, solo si es de instagram.com. */
  enlace: string | null;
  /** La dirección del archivo de video, solo si la publicación es un video. */
  urlVideo: string | null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const cuenta = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

function urlHttps(v: unknown): URL | null {
  if (typeof v !== "string" || v.length > 4000) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Lo que se aprovecha de la respuesta de Instagram, o null si no es una respuesta con datos (un error, otra cosa). */
export function interpretarMedia(respuesta: unknown): MediaConsultada | null {
  if (!esObjeto(respuesta) || respuesta.error !== undefined) return null;
  const usuario = typeof respuesta.username === "string" && /^[\w.]{1,100}$/.test(respuesta.username) ? respuesta.username : null;
  const enlace = urlHttps(respuesta.permalink);
  const video = respuesta.media_type === "VIDEO" ? urlHttps(respuesta.media_url) : null;
  const salida: MediaConsultada = {
    usuario,
    megusta: cuenta(respuesta.like_count),
    comentarios: cuenta(respuesta.comments_count),
    enlace: enlace && /(^|\.)instagram\.com$/i.test(enlace.hostname) ? enlace.toString() : null,
    urlVideo: video ? video.toString() : null,
  };
  return Object.values(salida).some((v) => v !== null) ? salida : null;
}
