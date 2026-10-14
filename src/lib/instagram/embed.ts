import { codigoDePublicacion } from "./repetidas";

/**
 * La página pública de «insertar» (embed) de un reel o una publicación de Instagram trae, dentro de un bloque `contextJSON`, lo que la
 * vista previa del enlace no da: **la dirección del archivo de video** (o de la imagen), **las vistas**, los comentarios y los me gusta.
 * Con el enlace de una captura se puede completar todo, sin importar cómo se compartió. Es un dato **no oficial**: Instagram puede
 * cambiar el formato o dejar de responder a los servidores.
 */
export interface DatosEmbed {
  esVideo: boolean | null;
  /** La dirección del video, solo si es de la red de archivos de Instagram o Facebook. */
  videoUrl: string | null;
  /** La dirección de la imagen (de una foto, o la portada de un video). */
  imagenUrl: string | null;
  vistas: number | null;
  megusta: number | null;
  comentarios: number | null;
  usuario: string | null;
  duracion: number | null;
  /** `clips` es un reel; `feed` una publicación del perfil. */
  producto: string | null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const cuenta = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** La dirección de la página de insertar de un enlace de reel o publicación, o null si el enlace no es de instagram.com. */
export function urlDeEmbed(enlace: string | null | undefined): string | null {
  const codigo = codigoDePublicacion(enlace);
  return codigo ? `https://www.instagram.com/p/${codigo}/embed/captioned/` : null;
}

/** Solo se descarga un archivo de la red de Instagram o de Facebook (https), nunca de otro sitio que ponga el bloque de datos. */
export function archivoPermitido(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 4000) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** El bloque `contextJSON` de la página (está escrito como texto dentro de otro JSON), ya leído; null si no está o no se entiende. */
export function contextoDeEmbed(html: string): Record<string, unknown> | null {
  const m = /"contextJSON":"((?:[^"\\]|\\.)*)"/.exec(html);
  if (!m) return null;
  try {
    const texto: unknown = JSON.parse(`"${m[1]}"`);
    const ctx: unknown = typeof texto === "string" ? JSON.parse(texto) : null;
    return esObjeto(ctx) ? ctx : null;
  } catch {
    return null;
  }
}

/** Lo que se aprovecha de la página de insertar, o null si no trae datos de la publicación. */
export function interpretarEmbed(html: string): DatosEmbed | null {
  const ctx = contextoDeEmbed(html);
  const datos = esObjeto(ctx?.gql_data) ? ctx.gql_data : null;
  const sm = esObjeto(datos?.shortcode_media) ? datos.shortcode_media : null;
  if (!sm) return null;
  const contar = (clave: string) => (esObjeto(sm[clave]) ? cuenta(sm[clave].count) : null);
  const dueno = esObjeto(sm.owner) ? sm.owner : null;
  const usuario = typeof dueno?.username === "string" && /^[\w.]{1,100}$/.test(dueno.username) ? dueno.username : null;
  const salida: DatosEmbed = {
    esVideo: typeof sm.is_video === "boolean" ? sm.is_video : null,
    videoUrl: archivoPermitido(sm.video_url),
    imagenUrl: archivoPermitido(sm.display_url),
    vistas: cuenta(sm.video_view_count) ?? cuenta(sm.video_play_count),
    megusta: contar("edge_liked_by") ?? contar("edge_media_preview_like"),
    comentarios: contar("edge_media_to_parent_comment") ?? contar("edge_media_to_comment"),
    usuario,
    duracion: typeof sm.video_duration === "number" && Number.isFinite(sm.video_duration) ? sm.video_duration : null,
    producto: typeof sm.product_type === "string" ? sm.product_type.slice(0, 30) : null,
  };
  return Object.values(salida).some((v) => v !== null) ? salida : null;
}
