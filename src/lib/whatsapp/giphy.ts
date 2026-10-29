// GIF y stickers de GIPHY para la bandeja (29 oct 2026). Se buscan con la clave del servidor (`GIPHY_API_KEY`, nunca en el navegador) y el navegador solo recibe lo que hace falta para
// mostrar la lista (id, título y una vista pequeña). Al enviar, el servidor vuelve a pedirle a GIPHY el archivo por su id: nunca se baja una dirección que mande el navegador.

export interface GifVista {
  id: string;
  titulo: string;
  /** Una imagen pequeña para la lista. */
  vista: string;
}

export interface ArchivosGif {
  titulo: string;
  /** El video MP4 (sin sonido) con el que se manda un GIF, grande y chico por si el grande pesa demasiado. */
  mp4: string | null;
  mp4Chico: string | null;
  /** Para un sticker: el WebP animado o, si no hay, el GIF. */
  webp: string | null;
  gif: string | null;
}

/** Las direcciones de archivos de GIPHY: solo `media*.giphy.com` por https. */
export function esUrlGiphy(texto: string): boolean {
  try {
    const u = new URL(texto);
    return u.protocol === "https:" && /^media\d*\.giphy\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export const esIdGiphy = (id: string): boolean => /^[A-Za-z0-9]{3,40}$/.test(id);

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const urlDe = (v: unknown): string | null => {
  const t = typeof v === "string" ? v : null;
  return t && esUrlGiphy(t) ? t : null;
};

/** La lista de una búsqueda o de lo más visto, solo con lo que se muestra. */
export function leerListaGiphy(json: unknown): GifVista[] {
  const lista = Array.isArray(obj(json).data) ? (obj(json).data as unknown[]) : [];
  const salida: GifVista[] = [];
  for (const g of lista.map(obj)) {
    const id = typeof g.id === "string" && esIdGiphy(g.id) ? g.id : null;
    const imagenes = obj(g.images);
    const vista = urlDe(obj(imagenes.fixed_width_small).url) ?? urlDe(obj(imagenes.fixed_width).url) ?? urlDe(obj(imagenes.downsized).url);
    if (id && vista) salida.push({ id, titulo: typeof g.title === "string" ? g.title.slice(0, 120) : "", vista });
  }
  return salida;
}

/** Los archivos de un GIF o sticker pedido por su id (`/v1/gifs/<id>`). */
export function leerArchivosGiphy(json: unknown): ArchivosGif | null {
  const g = obj(obj(json).data);
  if (typeof g.id !== "string") return null;
  const imagenes = obj(g.images);
  return {
    titulo: typeof g.title === "string" ? g.title.slice(0, 120) : "",
    mp4: urlDe(obj(imagenes.original_mp4).mp4) ?? urlDe(obj(imagenes.original).mp4),
    mp4Chico: urlDe(obj(imagenes.fixed_height).mp4) ?? urlDe(obj(imagenes.fixed_width).mp4),
    webp: urlDe(obj(imagenes.original).webp),
    gif: urlDe(obj(imagenes.original).url),
  };
}
