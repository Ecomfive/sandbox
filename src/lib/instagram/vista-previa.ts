/**
 * Lo que la página pública de un reel o una publicación de Instagram dice en su vista previa (`og:description`), la misma que
 * leen WhatsApp o Facebook al pegar un enlace: «43 likes, 12 comments - cuenta on February 4, 2025: "copy…"». La API de Meta no deja
 * leer esas cifras de una publicación ajena, así que se toman de ahí: me gusta, comentarios, la cuenta y la fecha. Las vistas y los
 * compartidos no salen en la vista previa. Es un dato **no oficial**: Instagram puede cambiar el formato o dejar de responder.
 */
export interface VistaPublica {
  megusta: number | null;
  comentarios: number | null;
  usuario: string | null;
  /** AAAA-MM-DD */
  fecha: string | null;
  /** El nombre con que se muestra la cuenta («Nuvo Venezuela»), del título de la vista previa. Es el nombre de la página para buscar el anuncio. */
  nombre: string | null;
  /** El texto de la publicación (su copy), de lo que sigue a la fecha en la vista previa. Null si no hay. */
  copy: string | null;
}

const MESES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

/** «1,234» → 1234, «1.2K» → 1200, «3M» → 3000000. Cualquier otra cosa → null. */
export function cifraDeVistaPrevia(texto: string | undefined): number | null {
  if (!texto) return null;
  const m = texto.trim().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!m) return null;
  const factor = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? "").toUpperCase() as "K" | "M" | "B"] ?? 1;
  const n = Math.round(Number(m[1]) * factor);
  return Number.isFinite(n) ? n : null;
}

function contenidoDeMeta(html: string, propiedades: string[]): string | null {
  for (const propiedad of propiedades) {
    const orden1 = new RegExp(`<meta\\s+(?:property|name)="${propiedad}"\\s+content="([^"]*)"`, "i").exec(html);
    const orden2 = new RegExp(`<meta\\s+content="([^"]*)"\\s+(?:property|name)="${propiedad}"`, "i").exec(html);
    const t = (orden1 ?? orden2)?.[1];
    if (t) return t;
  }
  return null;
}

/** El texto de `og:description` (o, si falta, de `description`) de una página, sin interpretar. */
export function descripcionDeLaPagina(html: string): string | null {
  return contenidoDeMeta(html, ["og:description", "description"]);
}

/** El texto de `og:title` de una página, sin interpretar: «Nuvo Venezuela on Instagram: "copy…"». */
export function tituloDeLaPagina(html: string): string | null {
  return contenidoDeMeta(html, ["og:title"]);
}

/** Las pocas entidades HTML que pueden venir en un nombre: &amp; &quot; y las numéricas (&#039; &#x27;). */
function decodificar(t: string): string {
  return t
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** El nombre de la cuenta en «Nombre on Instagram: …», sin entidades HTML; null si el título no tiene esa forma. */
export function nombreDeVistaPrevia(titulo: string | null): string | null {
  if (!titulo) return null;
  const m = titulo.match(/^(.{1,120}?)\s+on Instagram\s*:/);
  if (!m) return null;
  const nombre = decodificar(m[1]).trim();
  return nombre ? nombre.slice(0, 120) : null;
}

/** El copy que sigue a la fecha: sin las comillas que lo envuelven ni los caracteres invisibles que Instagram intercala. */
function copyDeVistaPrevia(resto: string | undefined): string | null {
  if (!resto) return null;
  const t = decodificar(resto)
    .replace(/[​-‏⁠﻿]/g, "")
    .trim()
    .replace(/^"/, "")
    .replace(/"\.?\s*$/, "")
    .trim();
  return t ? t.slice(0, 4000) : null;
}

/** Lee «N likes, M comments - cuenta on Month D, YYYY: …» (y, si se pasa el título, el nombre de la cuenta). Devuelve null si el texto no tiene esa forma o no aporta ningún dato. */
export function interpretarVistaPrevia(descripcion: string | null, titulo: string | null = null): VistaPublica | null {
  if (!descripcion) return null;
  const m = descripcion.match(/^(.{0,80}?)\s-\s([\w.]{1,100})\s+on\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s*:([\s\S]*)$/);
  if (!m) return null;
  const [, cifras, usuario, mesTexto, diaTexto, anioTexto, resto] = m;
  const megusta = cifraDeVistaPrevia(/([\d.,]+\s*[KMB]?)\s+likes?\b/i.exec(cifras)?.[1]);
  const comentarios = cifraDeVistaPrevia(/([\d.,]+\s*[KMB]?)\s+comments?\b/i.exec(cifras)?.[1]);
  const mes = MESES[mesTexto.toLowerCase()];
  const dia = Number(diaTexto);
  const anio = Number(anioTexto);
  let fecha: string | null = null;
  if (mes) {
    const f = new Date(Date.UTC(anio, mes - 1, dia));
    if (f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia) fecha = f.toISOString().slice(0, 10);
  }
  return { megusta, comentarios, usuario, fecha, nombre: nombreDeVistaPrevia(titulo), copy: copyDeVistaPrevia(resto) };
}

/** El enlace de un reel o una publicación de instagram.com: lo único que se lee (no perfiles, ni otros sitios). */
export function enlaceLegible(enlace: string): boolean {
  try {
    const u = new URL(enlace);
    return u.protocol === "https:" && /^(www\.)?instagram\.com$/i.test(u.hostname) && /^\/(?:[\w.]+\/)?(?:reels?|p|tv)\/[\w-]+/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** La lectura se puede apagar sin tocar el código: `INSTAGRAM_LECTURA_PUBLICA=0` (también «false» o «no»). */
export function lecturaPublicaActiva(valor: string | undefined = process.env.INSTAGRAM_LECTURA_PUBLICA): boolean {
  return !["0", "false", "no"].includes((valor ?? "").trim().toLowerCase());
}
