/** Una captura que sale de un mensaje de Instagram: lo que alguien del equipo compartió con la cuenta de fuentes. */
export interface CapturaInstagram {
  /** El id del mensaje de Meta + la posición del adjunto: es la llave para no guardar dos veces el mismo aviso. */
  mensajeId: string;
  remitenteId: string;
  tipo: "reel" | "post" | "video" | "otro";
  /** El enlace de Instagram (instagram.com/reel/…), si el aviso lo trae. */
  enlace: string | null;
  /** El copy, si Meta lo manda en el título del adjunto. */
  titulo: string | null;
  mediaId: string | null;
  /** Lo que la persona escribió en el mismo mensaje. */
  textoMensaje: string | null;
  /** Una página que la persona pegó en el mensaje (que no sea de Instagram ni de Facebook): la sugerencia de página de destino. */
  paginaDestino: string | null;
  /** La dirección del archivo de video, si el adjunto trae una que no es de la página de Instagram. */
  urlVideo: string | null;
}

const TIPO_ADJUNTO: Record<string, CapturaInstagram["tipo"]> = {
  ig_reel: "reel",
  reel: "reel",
  ig_post: "post",
  post: "post",
  video: "video",
  share: "otro",
  fallback: "otro",
};

const HOSTS_INSTAGRAM = /(^|\.)(instagram\.com|instagr\.am)$/i;
const HOSTS_META = /(^|\.)(instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.me|fb\.watch|l\.facebook\.com|l\.instagram\.com)$/i;
const ENLACE_EN_TEXTO = /https?:\/\/[^\s<>"']+/gi;
const ENLACE_PUBLICACION = /^\/(?:[\w.]+\/)?(?:reels?|p|tv)\/[\w-]+/i;

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function urlHttp(v: unknown): URL | null {
  const t = texto(v, 4000);
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** Los enlaces de un texto escrito por una persona (sin la puntuación final). */
export function enlacesDeTexto(t: string | null): URL[] {
  if (!t) return [];
  const salida: URL[] = [];
  for (const m of t.match(ENLACE_EN_TEXTO) ?? []) {
    const u = urlHttp(m.replace(/[.,;:!?)\]]+$/, ""));
    if (u) salida.push(u);
  }
  return salida;
}

/** La primera página del texto que no es de Instagram ni de Facebook: la sugerencia de página de destino. */
export function paginaDestinoDeTexto(t: string | null): string | null {
  return enlacesDeTexto(t).find((u) => !HOSTS_META.test(u.hostname))?.toString() ?? null;
}

/** Un mensaje (el contenido de `messaging[]` o de `changes[].value`): ¿qué capturas trae? */
function capturasDeMensaje(evento: Record<string, unknown>): CapturaInstagram[] {
  const mensaje = esObjeto(evento.message) ? evento.message : null;
  if (!mensaje || mensaje.is_echo === true) return [];
  const mid = texto(mensaje.mid, 300);
  const remitente = esObjeto(evento.sender) ? texto(evento.sender.id, 100) : null;
  if (!mid || !remitente) return [];

  const textoMensaje = texto(mensaje.text, 4000);
  const paginaDestino = paginaDestinoDeTexto(textoMensaje);
  const adjuntos = Array.isArray(mensaje.attachments) ? mensaje.attachments : [];
  const salida: CapturaInstagram[] = [];

  adjuntos.forEach((a, i) => {
    if (!esObjeto(a)) return;
    const tipo = typeof a.type === "string" ? TIPO_ADJUNTO[a.type] : undefined;
    if (!tipo) return; // imagen, audio, archivo, sticker, mención en historia…: no es un producto compartido
    const carga = esObjeto(a.payload) ? a.payload : {};
    const url = urlHttp(carga.url);
    const esDeInstagram = !!url && HOSTS_INSTAGRAM.test(url.hostname);
    const id = carga.reel_video_id ?? carga.id;
    salida.push({
      mensajeId: `${mid}:${i}`,
      remitenteId: remitente,
      tipo,
      enlace: esDeInstagram ? url.toString() : null,
      titulo: texto(carga.title, 4000),
      mediaId: typeof id === "number" || typeof id === "string" ? String(id).slice(0, 100) : null,
      textoMensaje,
      paginaDestino,
      urlVideo: url && !esDeInstagram ? url.toString() : null,
    });
  });

  // Sin adjunto, pero la persona pegó el enlace de un reel o una publicación: también cuenta.
  if (salida.length === 0) {
    const enlace = enlacesDeTexto(textoMensaje).find((u) => HOSTS_INSTAGRAM.test(u.hostname) && ENLACE_PUBLICACION.test(u.pathname));
    if (enlace) {
      salida.push({
        mensajeId: `${mid}:texto`,
        remitenteId: remitente,
        tipo: /\/reels?\//i.test(enlace.pathname) ? "reel" : /\/p\//i.test(enlace.pathname) ? "post" : "otro",
        enlace: enlace.toString(),
        titulo: null,
        mediaId: null,
        textoMensaje,
        paginaDestino,
        urlVideo: null,
      });
    }
  }
  return salida;
}

/**
 * Lee el aviso de Meta y devuelve las capturas que trae. Entiende las dos formas en que llegan los mensajes de Instagram
 * (`entry[].messaging[]` y `entry[].changes[].value`) y se ignora lo que no es un producto compartido: los ecos de lo que
 * manda la propia cuenta, las imágenes sueltas, los audios y las menciones en historias.
 */
export function extraerCapturas(cuerpo: unknown): CapturaInstagram[] {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.entry)) return [];
  const salida: CapturaInstagram[] = [];
  for (const entrada of cuerpo.entry) {
    if (!esObjeto(entrada)) continue;
    if (Array.isArray(entrada.messaging)) {
      for (const e of entrada.messaging) if (esObjeto(e)) salida.push(...capturasDeMensaje(e));
    }
    if (Array.isArray(entrada.changes)) {
      for (const c of entrada.changes) if (esObjeto(c) && c.field === "messages" && esObjeto(c.value)) salida.push(...capturasDeMensaje(c.value));
    }
  }
  return salida;
}

/** Un archivo MP4 o MOV por su firma (`ftyp` a partir del 5.º byte): el tipo que declare el servidor no se toma en cuenta. */
export function esVideoMp4(bytes: Uint8Array): boolean {
  return bytes.length > 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

/** Un WebM por su firma (EBML). */
export function esVideoWebm(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export type FormatoVideo = { extension: "mp4" | "webm"; tipo: "video/mp4" | "video/webm" };

/** El formato de un video descargado, o null si no es un video que aceptemos (una página HTML, un error, una imagen…). */
export function formatoDeVideo(bytes: Uint8Array): FormatoVideo | null {
  if (esVideoMp4(bytes)) return { extension: "mp4", tipo: "video/mp4" };
  if (esVideoWebm(bytes)) return { extension: "webm", tipo: "video/webm" };
  return null;
}
