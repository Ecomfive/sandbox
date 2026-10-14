/**
 * El mismo contenido puede llegar varias veces: dos personas lo comparten, o una misma lo comparte por dos caminos (el 14 oct,
 * IG-0011 llegó como archivo y IG-0012 como enlace, y los dos traían **el mismo identificador de Meta**). Se reconoce por ese
 * identificador (`reel_video_id` / `ig_post_media_id`) o por el código del enlace de Instagram.
 */

/** El código de la publicación en su enlace (`/p/DeR1_WGsSMh/` → `DeR1_WGsSMh`), o null si no es un enlace de reel o publicación. */
export function codigoDePublicacion(enlace: string | null | undefined): string | null {
  if (!enlace) return null;
  try {
    const u = new URL(enlace);
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null;
    return /\/(?:reels?|p|tv)\/([\w-]+)/i.exec(u.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export interface CapturaParaRepetidas {
  numero: number;
  enlace: string | null;
  mediaId: string | null;
}

/**
 * Para cada captura que repite a otra anterior, el N.º de la primera de su grupo. Dos capturas son la misma si comparten el
 * identificador de Meta o el código del enlace (y por transitividad: A y B por el id, B y C por el enlace → las tres). La primera
 * de cada grupo no aparece en el resultado.
 */
export function repetidasDe(capturas: CapturaParaRepetidas[]): Map<number, number> {
  const padre = new Map<number, number>();
  const raiz = (n: number): number => {
    let r = n;
    while (padre.get(r) !== r) r = padre.get(r) as number;
    return r;
  };
  for (const c of capturas) padre.set(c.numero, c.numero);
  const vistas = new Map<string, number>();
  for (const c of capturas) {
    for (const clave of [c.mediaId ? `id:${c.mediaId}` : null, codigoDePublicacion(c.enlace) ? `cod:${codigoDePublicacion(c.enlace)}` : null]) {
      if (!clave) continue;
      const otra = vistas.get(clave);
      if (otra === undefined) vistas.set(clave, c.numero);
      else {
        const a = raiz(otra);
        const b = raiz(c.numero);
        if (a !== b) padre.set(Math.max(a, b), Math.min(a, b));
      }
    }
  }
  const salida = new Map<number, number>();
  for (const c of capturas) {
    const r = raiz(c.numero);
    if (r !== c.numero) salida.set(c.numero, r);
  }
  return salida;
}

export interface DatosCompartibles {
  enlace: string | null;
  autor_usuario: string | null;
  metricas: Record<string, unknown> | null;
}

/** Lo que se copia de una captura a otra del mismo contenido: solo lo que la segunda no tiene. */
const CLAVES_A_COPIAR = ["like_count", "comments_count", "view_count", "share_count", "fecha_publicacion", "nombre_pagina"] as const;

/**
 * Lo que `destino` no tiene y `origen` sí (enlace, cuenta, nombre de la página, cifras y fecha), para completarla cuando es el mismo
 * contenido. Nunca pisa un dato que ya tiene. Devuelve null si no hay nada que copiar.
 */
export function datosQueFaltan(destino: DatosCompartibles, origen: DatosCompartibles): Partial<DatosCompartibles> | null {
  const cambios: Partial<DatosCompartibles> = {};
  if (!destino.enlace && origen.enlace) cambios.enlace = origen.enlace;
  if (!destino.autor_usuario && origen.autor_usuario) cambios.autor_usuario = origen.autor_usuario;
  const mDestino = destino.metricas ?? {};
  const mOrigen = origen.metricas ?? {};
  const copiadas: Record<string, unknown> = {};
  for (const clave of CLAVES_A_COPIAR) {
    if (mDestino[clave] === undefined && mOrigen[clave] !== undefined) copiadas[clave] = mOrigen[clave];
  }
  if (Object.keys(copiadas).length > 0) {
    cambios.metricas = { ...mDestino, ...copiadas, fuente: mDestino.fuente ?? mOrigen.fuente ?? "vista_previa" };
  }
  return Object.keys(cambios).length > 0 ? cambios : null;
}
