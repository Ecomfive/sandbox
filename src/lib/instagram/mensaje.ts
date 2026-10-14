/**
 * La API de conversaciones de Meta permite pedir un mensaje concreto (`GET /{mid}?fields=…`). Para una publicación compartida no está
 * documentado qué devuelve (puede traer el enlace en `shares` o dentro de `attachments`), así que se prueba: la respuesta, o el error,
 * se guarda en `metricas.mensaje_meta` y, si en alguna parte trae el enlace de un reel o una publicación de instagram.com, se aprovecha.
 */

/** Los campos que se piden, de más a menos: si Meta rechaza alguno por no existir, falla toda la petición y se prueba con el siguiente grupo. */
export const CAMPOS_MENSAJE = ["id,created_time,from,to,message,attachments,shares", "id,created_time,message,attachments"] as const;

/** El id de un mensaje de Meta (el `mid` del aviso, sin el `:posición` que se le agrega a cada adjunto), o null si no tiene forma de id. */
export function midDeMensaje(mensajeId: string | null | undefined): string | null {
  if (!mensajeId) return null;
  const mid = mensajeId.replace(/:(?:\d{1,3}|texto)$/, "");
  return /^[A-Za-z0-9_-]{10,600}$/.test(mid) ? mid : null;
}

const ENLACE = /^https:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/[\w-]+/i;

/** El primer enlace de reel o publicación de instagram.com que haya en cualquier parte de la respuesta (cadenas anidadas a poca profundidad). */
export function enlaceEnRespuesta(valor: unknown, profundidad = 0): string | null {
  if (profundidad > 6) return null;
  if (typeof valor === "string") {
    if (valor.length > 2000) return null;
    const m = ENLACE.exec(valor.trim());
    if (!m) return null;
    try {
      const u = new URL(valor.trim());
      return `https://www.instagram.com${u.pathname}`;
    } catch {
      return null;
    }
  }
  if (Array.isArray(valor)) {
    for (const v of valor) {
      const r = enlaceEnRespuesta(v, profundidad + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof valor === "object" && valor !== null) {
    for (const v of Object.values(valor)) {
      const r = enlaceEnRespuesta(v, profundidad + 1);
      if (r) return r;
    }
  }
  return null;
}

/** La respuesta de Meta recortada para guardarla sin llenar la base: las direcciones de archivos (firmadas) pierden sus parámetros. */
export function respuestaParaGuardar(valor: unknown, max = 3000): unknown {
  const texto = JSON.stringify(valor, (_clave, v) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v.split("?")[0] : v));
  if (!texto) return null;
  if (texto.length <= max) return JSON.parse(texto);
  return { recortada: texto.slice(0, max) };
}
