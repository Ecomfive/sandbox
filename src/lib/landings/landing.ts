// Generador de landings (Testing Lab › Producción, 20 oct 2026): qué tiene una landing y cómo se valida, sin base ni React
// para poder probarlo. La landing se guarda en `landings` (migración 0113): textos y secciones en `contenido`, una imagen por
// espacio en `imagenes` y las fotos del proveedor en `fotos_proveedor`.

/** Los espacios de imagen de la landing, en el orden en que se piden. `instruccion` es la que recibirá Gemini. */
export const ESPACIOS_IMAGEN = [
  { clave: "portada", etiqueta: "Portada", instruccion: "Foto de producto cuadrada, fondo limpio que combine con el producto, luz suave, el producto centrado y completo." },
  { clave: "detalle", etiqueta: "Detalle", instruccion: "Primer plano del producto que muestre su material, textura o la parte que lo hace distinto." },
  { clave: "en_uso", etiqueta: "En uso", instruccion: "El producto en uso por una persona, en un ambiente cotidiano y realista, sin texto sobre la imagen." },
  { clave: "variantes", etiqueta: "Variantes", instruccion: "Las variantes del producto (colores o tamaños) una al lado de la otra, fondo neutro." },
  { clave: "empaque", etiqueta: "Empaque", instruccion: "Lo que recibe el cliente: el producto con su empaque y accesorios, sobre una mesa." },
] as const;
export type EspacioImagen = (typeof ESPACIOS_IMAGEN)[number]["clave"];
export const ES_ESPACIO = (v: string): v is EspacioImagen => ESPACIOS_IMAGEN.some((e) => e.clave === v);

/** Los bloques de la landing y su orden de partida. */
export const SECCIONES = [
  { clave: "portada", etiqueta: "Portada y precio" },
  { clave: "beneficios", etiqueta: "Beneficios" },
  { clave: "en_uso", etiqueta: "Imagen en uso" },
  { clave: "variantes", etiqueta: "Variantes" },
  { clave: "ofertas", etiqueta: "Ofertas" },
  { clave: "comparativa", etiqueta: "Comparativa" },
  { clave: "resenas", etiqueta: "Reseñas" },
  { clave: "preguntas", etiqueta: "Preguntas frecuentes" },
  { clave: "garantia", etiqueta: "Garantía" },
] as const;
export type ClaveSeccion = (typeof SECCIONES)[number]["clave"];
const CLAVES_SECCION = new Set<string>(SECCIONES.map((s) => s.clave));
export const etiquetaSeccion = (c: string) => SECCIONES.find((s) => s.clave === c)?.etiqueta ?? c;

/** El ángulo de venta: desde dónde se le habla al cliente. Guía los textos y las imágenes. */
export const ANGULOS = [
  { valor: "regalo", etiqueta: "Para regalar" },
  { valor: "problema", etiqueta: "Resuelve un problema" },
  { valor: "hogar", etiqueta: "Hogar y decoración" },
  { valor: "cuidado", etiqueta: "Cuidado personal" },
  { valor: "ahorro", etiqueta: "Ahorro de tiempo o dinero" },
] as const;
export const etiquetaAngulo = (v: string) => ANGULOS.find((a) => a.valor === v)?.etiqueta ?? v;

export const ESTADOS_LANDING = [
  { valor: "borrador", etiqueta: "Borrador" },
  { valor: "lista", etiqueta: "Lista" },
  { valor: "publicada", etiqueta: "Publicada" },
] as const;
export const etiquetaEstadoLanding = (v: string) => ESTADOS_LANDING.find((e) => e.valor === v)?.etiqueta ?? v;

export const numeroLanding = (n: number) => `LND-${String(n).padStart(4, "0")}`;

export interface Beneficio {
  titulo: string;
  detalle: string;
}
export interface Pregunta {
  pregunta: string;
  respuesta: string;
}
/** Una reseña de un cliente real (no se inventan: se copian de mensajes o reseñas que existan). */
export interface Resena {
  texto: string;
  nombre: string;
  ciudad: string;
}
export interface FilaComparativa {
  texto: string;
}
export interface Seccion {
  clave: ClaveSeccion;
  visible: boolean;
}

export interface ContenidoLanding {
  titular: string;
  subtitulo: string;
  boton: string;
  anuncio: string;
  beneficios: Beneficio[];
  comparativa: FilaComparativa[];
  preguntas: Pregunta[];
  resenas: Resena[];
  garantia: string;
  secciones: Seccion[];
}

export const MAX_BENEFICIOS = 4;
export const MAX_PREGUNTAS = 6;
export const MAX_RESENAS = 6;
export const MAX_COMPARATIVA = 6;
export const MAX_FOTOS_PROVEEDOR = 6;

export function contenidoInicial(): ContenidoLanding {
  return {
    titular: "",
    subtitulo: "",
    boton: "Comprar ahora · Pago contra entrega",
    anuncio: "Envío a todo el país · Pagas al recibir",
    beneficios: [
      { titulo: "", detalle: "" },
      { titulo: "", detalle: "" },
      { titulo: "", detalle: "" },
    ],
    comparativa: [{ texto: "" }, { texto: "" }, { texto: "" }],
    preguntas: [
      { pregunta: "¿Puedo pagar al recibir?", respuesta: "Sí. Pagas en efectivo cuando el pedido llega a tu casa." },
      { pregunta: "¿Cuánto tarda el envío?", respuesta: "De 2 a 5 días hábiles según tu ciudad." },
      { pregunta: "", respuesta: "" },
    ],
    resenas: [],
    garantia: "Si llega con algún defecto, te enviamos otro sin costo.",
    secciones: SECCIONES.map((s) => ({ clave: s.clave, visible: s.clave !== "resenas" })),
  };
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+$/u, "").slice(0, max) : "");
const lista = (v: unknown, max: number): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object").slice(0, max) : [];

/**
 * Deja el contenido en una forma conocida: lo que viene del navegador (o de una fila guardada antes de un cambio) se recorta
 * a los largos y cantidades permitidos, lo desconocido se ignora y las secciones quedan completas y sin repetir (una que
 * falte se agrega al final, oculta).
 */
export function normalizarContenido(v: unknown): ContenidoLanding {
  const base = contenidoInicial();
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  const vistas = new Set<string>();
  const secciones: Seccion[] = [];
  for (const s of lista(o.secciones, 30)) {
    const clave = String(s.clave);
    if (!CLAVES_SECCION.has(clave) || vistas.has(clave)) continue;
    vistas.add(clave);
    secciones.push({ clave: clave as ClaveSeccion, visible: s.visible !== false });
  }
  for (const s of SECCIONES) if (!vistas.has(s.clave)) secciones.push({ clave: s.clave, visible: !Array.isArray(o.secciones) && s.clave !== "resenas" });
  return {
    titular: "titular" in o ? texto(o.titular, 140) : base.titular,
    subtitulo: "subtitulo" in o ? texto(o.subtitulo, 400) : base.subtitulo,
    boton: "boton" in o ? texto(o.boton, 60) : base.boton,
    anuncio: "anuncio" in o ? texto(o.anuncio, 120) : base.anuncio,
    beneficios: "beneficios" in o ? lista(o.beneficios, MAX_BENEFICIOS).map((b) => ({ titulo: texto(b.titulo, 80), detalle: texto(b.detalle, 200) })) : base.beneficios,
    comparativa: "comparativa" in o ? lista(o.comparativa, MAX_COMPARATIVA).map((c) => ({ texto: texto(c.texto, 80) })) : base.comparativa,
    preguntas: "preguntas" in o ? lista(o.preguntas, MAX_PREGUNTAS).map((p) => ({ pregunta: texto(p.pregunta, 160), respuesta: texto(p.respuesta, 600) })) : base.preguntas,
    resenas: "resenas" in o ? lista(o.resenas, MAX_RESENAS).map((r) => ({ texto: texto(r.texto, 400), nombre: texto(r.nombre, 60), ciudad: texto(r.ciudad, 60) })) : base.resenas,
    garantia: "garantia" in o ? texto(o.garantia, 300) : base.garantia,
    secciones,
  };
}

export interface ImagenGuardada {
  /** Ruta en el bucket `landings` (`<id de la landing>/…`), o `null` si todavía no tiene imagen. */
  ruta: string | null;
  instruccion: string;
}

/** Las imágenes de cada espacio con su instrucción (la de partida si nunca se cambió). */
export function normalizarImagenes(v: unknown, id: string): Record<EspacioImagen, ImagenGuardada> {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const salida = {} as Record<EspacioImagen, ImagenGuardada>;
  for (const e of ESPACIOS_IMAGEN) {
    const x = o[e.clave] && typeof o[e.clave] === "object" ? (o[e.clave] as Record<string, unknown>) : {};
    const ruta = typeof x.ruta === "string" && rutaDeLanding(x.ruta, id) ? x.ruta : null;
    salida[e.clave] = { ruta, instruccion: typeof x.instruccion === "string" && x.instruccion.trim() ? x.instruccion.slice(0, 1000) : e.instruccion };
  }
  return salida;
}

/** Las fotos del proveedor guardadas (solo rutas de la carpeta de esa landing). */
export function normalizarFotosProveedor(v: unknown, id: string): string[] {
  return Array.isArray(v) ? v.filter((r): r is string => typeof r === "string" && rutaDeLanding(r, id)).slice(0, MAX_FOTOS_PROVEEDOR) : [];
}

/** Una ruta del bucket es de esta landing: `<id>/<archivo>`, sin subir de carpeta ni parámetros. */
export function rutaDeLanding(ruta: string, id: string): boolean {
  if (!ruta.startsWith(`${id}/`)) return false;
  const resto = ruta.slice(id.length + 1);
  return /^[a-zA-Z0-9._-]{1,160}$/.test(resto) && !resto.includes("..");
}

/** El nombre de un archivo para su ruta: solo letras, números, punto, guion y guion bajo. */
export function nombreArchivo(nombre: string): string {
  const limpio = String(nombre ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|-+$/g, "")
    .slice(-80);
  return limpio || "imagen";
}

/** Lo que falta para que la landing esté lista para publicar (vacío = lista). */
export function faltantesLanding(datos: { nombre: string; precio: number | null; contenido: ContenidoLanding; imagenes: Record<EspacioImagen, ImagenGuardada> }): string[] {
  const f: string[] = [];
  const c = datos.contenido;
  const visible = (s: ClaveSeccion) => c.secciones.some((x) => x.clave === s && x.visible);
  if (!c.titular.trim()) f.push("El titular");
  if (datos.precio === null) f.push("El precio");
  if (!datos.imagenes.portada.ruta) f.push("La imagen de portada");
  if (visible("beneficios") && !c.beneficios.some((b) => b.titulo.trim())) f.push("Al menos un beneficio");
  if (visible("en_uso") && !datos.imagenes.en_uso.ruta) f.push("La imagen en uso (o ocultar ese bloque)");
  if (visible("variantes") && !datos.imagenes.variantes.ruta) f.push("La imagen de variantes (o ocultar ese bloque)");
  if (visible("resenas") && !c.resenas.some((r) => r.texto.trim())) f.push("Al menos una reseña (o ocultar ese bloque)");
  return f;
}

// --- Landing de referencia (modo «clonar») -------------------------------------------------------------------------

export interface LecturaReferencia {
  titulo: string | null;
  /** Los encabezados (h1 a h3) en el orden en que salen: muestran cómo está armada la página. */
  encabezados: { nivel: number; texto: string }[];
  /** Las imágenes grandes de la página, en orden (sin íconos ni logos pequeños). */
  imagenes: string[];
  /** Cuántos botones o enlaces de compra tiene. */
  botonesCompra: number;
}

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", iexcl: "¡", iquest: "¿", aacute: "á", eacute: "é", iacute: "í", oacute: "ó",
  uacute: "ú", ntilde: "ñ", uuml: "ü", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", deg: "°",
};
function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n] ?? ENTIDADES[n.toLowerCase()] ?? m);
}
/** Títulos de la tienda que no son de la landing: el carrito, el menú y el pie de página. */
const TITULO_DE_TIENDA = /^(tu carrito|carrito|cart|your cart|subtotal|men[uú]|enlaces de inter[eé]s|atenci[oó]n al cliente|newsletter|suscr[ií]bete|s[ií]guenos|contacto|informaci[oó]n|pol[ií]ticas?|buscar|search|productos relacionados|tambi[eé]n te puede gustar|you may also like)\b/i;

/** La misma imagen en otro tamaño o desde otra dirección de la tienda (Shopify sirve la misma foto con `?width=` distintos). */
export const mismaImagen = (a: string, b: string) => {
  const archivo = (u: string) => u.split(/[?#]/)[0].split("/").pop()?.toLowerCase() ?? u;
  return archivo(a) === archivo(b);
};

const sinEtiquetas = (s: string) => decodificar(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * Lee el HTML de una landing y saca cómo está armada: título, encabezados en orden, imágenes y botones de compra. No ejecuta
 * nada ni sigue enlaces; las direcciones de imagen se resuelven contra la de la página y solo se aceptan http(s).
 */
export function leerReferencia(html: string, base: string): LecturaReferencia {
  // Fuera lo que no se ve ni es de la landing: código, estilos, cabecera, menú y pie de página de la tienda.
  const limpio = html.replace(/<(script|style|noscript|header|footer|nav)\b[\s\S]*?<\/\1>/gi, " ");
  const titulo = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(limpio);
  const encabezados: LecturaReferencia["encabezados"] = [];
  for (const m of limpio.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const t = sinEtiquetas(m[2]).slice(0, 160);
    if (t && !TITULO_DE_TIENDA.test(t) && !encabezados.some((e) => e.texto === t)) encabezados.push({ nivel: Number(m[1]), texto: t });
    if (encabezados.length >= 40) break;
  }
  const imagenes: string[] = [];
  for (const m of limpio.matchAll(/<img\b[^>]*>/gi)) {
    const etiqueta = m[0];
    const src = /\s(?:data-src|src)\s*=\s*["']([^"']+)["']/i.exec(etiqueta)?.[1];
    if (!src || src.startsWith("data:")) continue;
    const ancho = Number(/\swidth\s*=\s*["']?(\d+)/i.exec(etiqueta)?.[1] ?? 0);
    if (ancho && ancho < 200) continue;
    if (/logo|icon|sprite|badge|payment|flag/i.test(src)) continue;
    let url: URL;
    try {
      url = new URL(decodificar(src), base);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    const s = url.toString();
    if (!imagenes.some((x) => mismaImagen(x, s))) imagenes.push(s);
    if (imagenes.length >= 30) break;
  }
  const botonesCompra = [...limpio.matchAll(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi)].filter((m) =>
    /comprar|pedir|ordenar|lo quiero|add to cart|buy now|agregar al carrito|pagar/i.test(sinEtiquetas(m[1])),
  ).length;
  return { titulo: titulo ? sinEtiquetas(titulo[1]).slice(0, 200) || null : null, encabezados, imagenes, botonesCompra };
}

/**
 * Una tienda Shopify entrega su producto en `/products/<x>.js` (público): la descripción (donde suele estar el contenido de la
 * landing) y todas sus fotos. Se suman a lo leído de la página, sin repetir.
 */
export function sumarProductoShopify(lectura: LecturaReferencia, json: unknown, base: string): LecturaReferencia {
  if (!json || typeof json !== "object") return lectura;
  const p = json as { description?: unknown; images?: unknown; media?: unknown };
  const desc = typeof p.description === "string" ? leerReferencia(p.description, base) : null;
  const fotos = (Array.isArray(p.images) ? p.images : []).filter((x): x is string => typeof x === "string");
  const imagenes = [...lectura.imagenes];
  for (const f of [...fotos, ...(desc?.imagenes ?? [])]) {
    let url: string;
    try {
      url = new URL(f, base).toString();
    } catch {
      continue;
    }
    if (/^https?:/.test(url) && !imagenes.some((x) => mismaImagen(x, url)) && imagenes.length < 30) imagenes.push(url);
  }
  const encabezados = [...lectura.encabezados];
  for (const e of desc?.encabezados ?? []) if (!encabezados.some((x) => x.texto === e.texto) && encabezados.length < 40) encabezados.push(e);
  return { ...lectura, encabezados, imagenes, botonesCompra: lectura.botonesCompra + (desc?.botonesCompra ?? 0) };
}

/** La dirección del `.js` de un producto de Shopify (`/products/<x>.js`), o `null` si la página no es de un producto. */
export function urlProductoShopify(url: string): string | null {
  try {
    const u = new URL(url);
    const m = /^(.*\/products\/[^/]+?)\/?$/.exec(u.pathname);
    return m ? `${u.origin}${m[1]}.js` : null;
  } catch {
    return null;
  }
}
