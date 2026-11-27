// Anuncios Meta › qué tienen en común los que funcionaron (24 nov 2026, pedido de Alcides: «cuando dices que las campañas con cierto CTR o cierta efectividad en la página funcionaron mejor, analiza cómo eran esos anuncios, videos y páginas, qué
// características compartían, para mejorar los que tenemos»). No basta con decir «el CTR sobre 3 % funciona»: se toman los anuncios (o las páginas) que están en la zona buena de una métrica y **funcionaron** (CPA dentro del tope), se describe cada uno
// con rasgos concretos —de su video (ángulo, gancho, formato, duración, llamado, recursos), de su texto (largo, pregunta, precio, pago contra entrega, urgencia…), de su campaña y de su página (tipo, video, reseñas, precio, imágenes, peso,
// velocidad)— y se compara con el resto: lo que aparece mucho más entre los que funcionaron es lo que hay que copiar, y lo que casi nunca aparece, lo que hay que evitar. Lógica pura, con prueba. Quien lee la base y las páginas está en `rasgos-datos.ts`.

import { nombreConTemas, nombreDeAngulo } from "./angulo-detalle";
import { cpa, cvr, ctr, efectividad, hookRate, type Resultados } from "./metricas";

// ───────────────────────── Rasgos de cada cosa ─────────────────────────

const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const rasgo = (dimension: string, valor: string) => `${dimension}: ${valor}`;

/** Los rasgos del texto de un anuncio y de su título. */
export function rasgosDeCopy(copy: string | null | undefined, titulo?: string | null): string[] {
  const t = (copy ?? "").trim();
  if (t.length < 8) return [];
  const n = sinTildes(t);
  const out: string[] = [];
  out.push(rasgo("Texto del anuncio", t.length < 150 ? "corto (menos de 150 letras)" : t.length <= 400 ? "medio (150 a 400 letras)" : "largo (más de 400 letras)"));
  const primera = t.split(/[\n.!]/)[0] ?? "";
  if (/\?\s*$/.test(primera.trim()) || /^[¿]/.test(t)) out.push(rasgo("Texto del anuncio", "empieza con una pregunta"));
  const emojis = (t.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emojis >= 5) out.push(rasgo("Texto del anuncio", "con muchos emojis"));
  else if (emojis === 0) out.push(rasgo("Texto del anuncio", "sin emojis"));
  if (/\$\s?\d|\d+([.,]\d+)?\s?(dolares|usd|balboas|colones|pesos)|₡\s?\d/.test(n)) out.push(rasgo("Texto del anuncio", "menciona el precio"));
  if (/contra entrega|pago al recibir|paga al recibir|pagas (cuando|al) (te )?(llega|recib)|paga cuando llega/.test(n)) out.push(rasgo("Texto del anuncio", "menciona el pago contra entrega"));
  if (/envio gratis|envio gratuito|sin costo de envio/.test(n)) out.push(rasgo("Texto del anuncio", "menciona el envío gratis"));
  if (/ultimas unidades|solo quedan|quedan pocas|por tiempo limitado|solo por hoy|solo hoy|oferta termina|hasta agotar/.test(n)) out.push(rasgo("Texto del anuncio", "crea urgencia"));
  if (/(✅|✔|•|👉|➡|(^|\n)\s*-\s)/u.test(t)) out.push(rasgo("Texto del anuncio", "con lista de beneficios"));
  if (/compra|pide|ordena|haz tu pedido|escribenos|ordenalo|aprovecha/.test(n)) out.push(rasgo("Texto del anuncio", "pide la acción de forma directa"));
  if (titulo && /\d/.test(titulo)) out.push(rasgo("Título", "lleva un número"));
  return out;
}

export interface VideoParaRasgos {
  angulo: string | null;
  detalle?: string | null;
  ganchoTipo: string | null;
  formato: string | null;
  ctaTipo: string | null;
  duracionS: number | null;
  ctaSegundo: number | null;
  oferta: string | null;
  recursos: string[];
}

/** Los rasgos de un video según lo que la IA vio en él. */
export function rasgosDeVideo(v: VideoParaRasgos | null | undefined): string[] {
  if (!v) return [];
  const out: string[] = [];
  if (v.angulo) out.push(rasgo("Ángulo", v.angulo));
  // De qué es la táctica general (qué «antes y después»), como rasgo aparte.
  const conDetalle = nombreDeAngulo(v.angulo, v.detalle);
  if (conDetalle && conDetalle !== v.angulo) out.push(rasgo("Detalle del ángulo", conDetalle));
  if (v.ganchoTipo) out.push(rasgo("Gancho", v.ganchoTipo));
  if (v.formato) out.push(rasgo("Formato", v.formato));
  if (v.ctaTipo) out.push(rasgo("Llamado a la acción", v.ctaTipo));
  if (v.duracionS && v.duracionS > 0) out.push(rasgo("Duración del video", v.duracionS <= 15 ? "hasta 15 segundos" : v.duracionS <= 30 ? "de 16 a 30 segundos" : v.duracionS <= 45 ? "de 31 a 45 segundos" : "más de 45 segundos"));
  if (v.ctaSegundo !== null && v.duracionS && v.duracionS > 0) {
    const p = v.ctaSegundo / v.duracionS;
    out.push(rasgo("Cuándo pide la compra", p <= 0.33 ? "en el primer tercio" : p <= 0.66 ? "en la mitad" : "al final"));
  }
  if (v.oferta && v.oferta.trim()) out.push(rasgo("Oferta en el video", "la muestra"));
  for (const r of v.recursos) if (r) out.push(rasgo("Recurso del video", r));
  return out;
}

/** Los rasgos de una campaña. */
export function rasgosDeCampana(c: { estructura: string | null; puja: string | null; familia: string }): string[] {
  const out: string[] = [];
  if (c.estructura) out.push(rasgo("Estructura de la campaña", c.estructura));
  if (c.puja) out.push(rasgo("Puja", c.puja));
  out.push(rasgo("Tipo de producto", c.familia));
  return out;
}

/** Lo que se midió de una página (la descarga la hace `rasgos-datos.ts`; aquí solo se interpreta). */
export interface PaginaMedida {
  bytes: number;
  ms: number;
  html: string;
}

/** Los rasgos de una página de destino: de qué tipo es, qué trae (video, reseñas, precio, imágenes, botones) y cómo carga. */
export function rasgosDePagina(url: string, p: PaginaMedida): string[] {
  const out: string[] = [];
  const h = p.html;
  const n = sinTildes(h);
  let ruta = "";
  try {
    ruta = new URL(url.startsWith("http") ? url : `https://${url}`).pathname;
  } catch {
    // Sin ruta: se trata como página general.
  }
  out.push(rasgo("Tipo de página", /\/products?\//.test(ruta) ? "página de producto de la tienda" : "página de venta propia (landing)"));
  const imagenes = (h.match(/<img\b/gi) ?? []).length;
  out.push(rasgo("Imágenes de la página", imagenes < 6 ? "pocas (menos de 6)" : imagenes <= 15 ? "algunas (6 a 15)" : "muchas (más de 15)"));
  if (/<video\b|youtube\.com\/embed|player\.vimeo\.com|\.mp4/.test(n)) out.push(rasgo("La página", "trae un video"));
  if (/resena|testimonio|opiniones|calificacion|estrellas|reviews?\b|rating/.test(n)) out.push(rasgo("La página", "muestra reseñas o testimonios"));
  if (/(\$|usd|balboas|₡)\s?\d+([.,]\d+)?/.test(n)) out.push(rasgo("La página", "muestra el precio"));
  if (/contra entrega|pago al recibir|paga al recibir|pagas (cuando|al) (te )?(llega|recib)/.test(n)) out.push(rasgo("La página", "dice que se paga contra entrega"));
  if (/garantia|devolucion/.test(n)) out.push(rasgo("La página", "habla de garantía o devolución"));
  const botones = (h.match(/<(button|a)\b[^>]*>[^<]*(comprar|pedir|ordenar|agregar al carrito|añadir al carrito|haz tu pedido|quiero)/gi) ?? []).length;
  out.push(rasgo("Botones de compra", botones === 0 ? "ninguno visible" : botones === 1 ? "uno" : "varios"));
  const palabras = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, " ").split(/\s+/).filter((x) => x.length > 2).length;
  out.push(rasgo("Texto de la página", palabras < 300 ? "corto (menos de 300 palabras)" : palabras <= 900 ? "medio (300 a 900 palabras)" : "largo (más de 900 palabras)"));
  out.push(rasgo("Velocidad de la página", p.ms < 1000 ? "rápida (menos de 1 segundo)" : p.ms <= 2500 ? "normal (1 a 2,5 segundos)" : "lenta (más de 2,5 segundos)"));
  out.push(rasgo("Peso de la página", p.bytes < 500_000 ? "liviana (menos de 0,5 MB)" : p.bytes <= 1_500_000 ? "media (0,5 a 1,5 MB)" : "pesada (más de 1,5 MB)"));
  return out;
}

// ───────────────────────── Ganadores contra el resto ─────────────────────────

export type MetricaGanadora = "ctr" | "hook" | "clic_a_visita" | "cvr";
export const CRITERIOS: Record<MetricaGanadora, { nombre: string; minimo: number; valor: (r: Resultados) => number | null; sobre: "anuncios" | "paginas"; unidad: string }> = {
  ctr: { nombre: "CTR", minimo: 3, valor: ctr, sobre: "anuncios", unidad: "%" },
  hook: { nombre: "Hook", minimo: 40, valor: hookRate, sobre: "anuncios", unidad: "%" },
  clic_a_visita: { nombre: "Clic a visita (efectividad de la página)", minimo: 80, valor: efectividad, sobre: "paginas", unidad: "%" },
  cvr: { nombre: "CVR (conversión de la página)", minimo: 4, valor: cvr, sobre: "paginas", unidad: "%" },
};

export interface Entidad {
  id: string;
  nombre: string;
  rasgos: string[];
  r: Resultados;
  tope: number;
}

export const UMBRALES_RASGOS = {
  /** Gasto mínimo para que un anuncio o una página cuente (con menos no hay datos). */
  gastoMinimo: 50,
  minGanadores: 4,
  minResto: 6,
  /** Parte de los ganadores que tiene que tener el rasgo para llamarlo «común». */
  parteComun: 0.4,
  /** Cuántos puntos más (de 0 a 1) tiene que haber entre los ganadores que entre el resto. */
  ventaja: 0.2,
} as const;

export interface RasgoComun {
  rasgo: string;
  dimension: string;
  valor: string;
  enGanadores: number;
  enResto: number;
  /** De 0 a 1. */
  parteGanadores: number;
  parteResto: number;
}

export interface RasgosDeGanadores {
  metrica: MetricaGanadora;
  nombre: string;
  /** «CTR de 3 % o más y dentro del CPA tope». */
  criterio: string;
  sobre: "anuncios" | "paginas";
  ganadores: number;
  resto: number;
  comunes: RasgoComun[];
  evitar: RasgoComun[];
  /** Hasta tres ejemplos de los que funcionaron, con su valor de la métrica. */
  ejemplos: { nombre: string; valor: number }[];
  /** Lo que hay que hacer para parecerse a ellos, en frases. */
  recomendaciones: string[];
}

const partir = (rasgo: string) => {
  const i = rasgo.indexOf(": ");
  return { dimension: rasgo.slice(0, i), valor: rasgo.slice(i + 2) };
};

/** «Antes y después» solo no dice nada: se le ponen los temas que tiene en el grupo del que se habla (los que funcionaron o los demás), del más repetido al menos. */
function conSusTemas(x: RasgoComun, grupo: readonly Entidad[]): RasgoComun {
  if (x.dimension !== "Ángulo") return x;
  const inicio = rasgo("Detalle del ángulo", `${x.valor} · `);
  const temas = new Map<string, number>();
  for (const e of grupo) {
    if (!e.rasgos.includes(x.rasgo)) continue;
    for (const r of new Set(e.rasgos)) if (r.startsWith(inicio)) temas.set(r.slice(inicio.length), (temas.get(r.slice(inicio.length)) ?? 0) + 1);
  }
  const orden = [...temas].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([t]) => t);
  return { ...x, valor: nombreConTemas(x.valor, orden, 3) };
}

/** Un anuncio o página «funcionó»: gastó lo suficiente y su CPA quedó dentro del tope. */
export const funciono = (e: Entidad): boolean => e.r.gasto >= UMBRALES_RASGOS.gastoMinimo && e.r.compras > 0 && (cpa(e.r) ?? Infinity) <= e.tope;

/**
 * Compara los que están en la zona buena de una métrica y funcionaron con todos los demás con gasto suficiente. Devuelve null si hay pocos de cualquiera de los dos grupos (no se puede concluir). Un rasgo es «común» si lo tiene al menos
 * el 40 % de los ganadores y 20 puntos más que el resto; hay que «evitar» lo que tiene claramente más el resto. Solo cuenta lo que aparece en al menos 2 ganadores.
 */
export function compararGanadores(entidades: readonly Entidad[], metrica: MetricaGanadora): RasgosDeGanadores | null {
  const U = UMBRALES_RASGOS;
  const c = CRITERIOS[metrica];
  const validas = entidades.filter((e) => e.r.gasto >= U.gastoMinimo);
  const ganan = validas.filter((e) => funciono(e) && (c.valor(e.r) ?? -1) >= c.minimo);
  const resto = validas.filter((e) => !ganan.includes(e));
  if (ganan.length < U.minGanadores || resto.length < U.minResto) return null;
  const cuenta = (l: readonly Entidad[]) => {
    const m = new Map<string, number>();
    for (const e of l) for (const r of new Set(e.rasgos)) m.set(r, (m.get(r) ?? 0) + 1);
    return m;
  };
  const g = cuenta(ganan);
  const o = cuenta(resto);
  const todos = new Set([...g.keys(), ...o.keys()]);
  const comunes: RasgoComun[] = [];
  const evitar: RasgoComun[] = [];
  for (const r of todos) {
    const a = g.get(r) ?? 0;
    const b = o.get(r) ?? 0;
    const pg = a / ganan.length;
    const pr = b / resto.length;
    const base: RasgoComun = { rasgo: r, ...partir(r), enGanadores: a, enResto: b, parteGanadores: pg, parteResto: pr };
    if (a >= 2 && pg >= U.parteComun && pg - pr >= U.ventaja) comunes.push(base);
    else if (b >= 3 && pr >= U.parteComun && pr - pg >= U.ventaja + 0.05) evitar.push(base);
  }
  comunes.sort((x, y) => y.parteGanadores - y.parteResto - (x.parteGanadores - x.parteResto));
  evitar.sort((x, y) => y.parteResto - y.parteGanadores - (x.parteResto - x.parteGanadores));
  if (!comunes.length && !evitar.length) return null;
  const top = comunes.slice(0, 6).map((x) => conSusTemas(x, ganan));
  const malos = evitar.slice(0, 4).map((x) => conSusTemas(x, resto));
  const ejemplos = [...ganan].sort((x, y) => (c.valor(y.r) ?? 0) - (c.valor(x.r) ?? 0)).slice(0, 3).map((e) => ({ nombre: e.nombre, valor: Math.round((c.valor(e.r) ?? 0) * 10) / 10 }));
  const de = c.sobre === "anuncios" ? "anuncios" : "páginas";
  const recomendaciones = [
    ...top.slice(0, 3).map((x) => `Probar ${x.dimension.toLowerCase()}: ${x.valor} (lo tienen ${x.enGanadores} de ${ganan.length} ${de} que funcionaron y ${x.enResto} de ${resto.length} de los demás).`),
    ...malos.slice(0, 2).map((x) => `Evitar ${x.dimension.toLowerCase()}: ${x.valor} (está en ${x.enResto} de ${resto.length} de los que no funcionaron y solo en ${x.enGanadores} de ${ganan.length} de los que sí).`),
  ];
  return {
    metrica,
    nombre: c.nombre,
    criterio: `${c.nombre.split(" (")[0]} de ${c.minimo} ${c.unidad} o más y con CPA dentro del tope`,
    sobre: c.sobre,
    ganadores: ganan.length,
    resto: resto.length,
    comunes: top,
    evitar: malos,
    ejemplos,
    recomendaciones,
  };
}

/** Lo que se le da a la IA. */
export function rasgosParaIA(r: RasgosDeGanadores): unknown {
  const f = (x: RasgoComun) => ({ rasgo: `${x.dimension}: ${x.valor}`, en_ganadores: `${x.enGanadores} de ${r.ganadores}`, en_el_resto: `${x.enResto} de ${r.resto}` });
  return { metrica: r.nombre, criterio_de_ganador: r.criterio, sobre: r.sobre, ganadores: r.ganadores, resto: r.resto, lo_que_comparten_los_ganadores: r.comunes.map(f), lo_que_casi_nunca_tienen: r.evitar.map(f), ejemplos_de_ganadores: r.ejemplos };
}

export const claveDeRasgos = (paisId: string) => `rasgos_ganadores:${paisId}`;
export interface RasgosGuardados {
  generadoEn: string;
  items: RasgosDeGanadores[];
}
export function leerValorRasgos(valor: unknown): RasgosGuardados | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Partial<RasgosGuardados>;
  return typeof v.generadoEn === "string" && Array.isArray(v.items) ? { generadoEn: v.generadoEn, items: v.items.filter((i) => i && typeof i.metrica === "string" && Array.isArray(i.comunes)) } : null;
}
