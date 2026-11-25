// Anuncios Meta › Qué funciona, en dos mitades que se alimentan de los videos (20 nov 2026, pedido de Alcides):
//  1. el ángulo de una campaña es la mezcla de los ángulos de sus videos («5 de 10 antes y después, 5 de 10 testimonio» = 50 % y 50 %), y
//  2. todo lo que la IA saca de cada video (ángulo, gancho, formato, llamado a la acción, recursos, estructura, duración, momento del llamado y oferta) se mide con lo que costó y lo que vendió el video.
// Lógica pura, con prueba. Los videos que cuentan son los de gasto en el periodo elegido; cada dimensión dice cuántos no tenían el dato.

import { agrupar, type Elemento } from "./agrupar";
import { detallesPorAngulo, nombreConTemas, temasDe } from "./angulo-detalle";
import { sinResultados, sumar, type Resultados } from "./metricas";
import { VERSION_ANALISIS } from "./video-angulo";
import type { ComposicionAngulo, Grupo, VideoVista } from "./vistas";

/** Con este porcentaje o más de un solo ángulo, la campaña se clasifica con él; con menos es una «mezcla». */
export const UMBRAL_DOMINANTE = 60;
export const MEZCLA_DE_ANGULOS = "Mezcla de ángulos";

/**
 * De qué ángulos está hecha una campaña: cada video distinto cuenta una vez (aunque esté en varios anuncios de la campaña) con el ángulo que tiene. Los porcentajes suman exactamente 100
 * (el resto del redondeo va a los ángulos con más decimales). Los videos sin ángulo no entran: se cuentan aparte en `sinAngulo`.
 */
export function composicionDeAngulos(videos: { videoId: string; angulo: string | null; detalle?: string | null; gasto: number }[]): { angulos: ComposicionAngulo[]; videosTotal: number; videosConAngulo: number } {
  const porVideo = new Map<string, { angulo: string | null; detalle?: string | null; gasto: number }>();
  for (const v of videos) {
    const x = porVideo.get(v.videoId) ?? { angulo: v.angulo, gasto: 0 };
    x.gasto += v.gasto;
    x.angulo ??= v.angulo;
    x.detalle ??= v.detalle;
    porVideo.set(v.videoId, x);
  }
  const cuenta = new Map<string, { videos: number; gasto: number }>();
  for (const x of porVideo.values()) {
    if (!x.angulo) continue;
    const c = cuenta.get(x.angulo) ?? { videos: 0, gasto: 0 };
    c.videos++;
    c.gasto += x.gasto;
    cuenta.set(x.angulo, c);
  }
  const conAngulo = [...cuenta.values()].reduce((s, c) => s + c.videos, 0);
  const crudo = [...cuenta].map(([angulo, c]) => ({ angulo, ...c, exacto: conAngulo ? (c.videos / conAngulo) * 100 : 0 }));
  const piso = crudo.map((c) => Math.floor(c.exacto));
  let faltan = (conAngulo ? 100 : 0) - piso.reduce((s, n) => s + n, 0);
  const porResto = crudo.map((c, i) => ({ i, resto: c.exacto - piso[i] })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of porResto) {
    if (faltan <= 0) break;
    piso[i]++;
    faltan--;
  }
  const temas = detallesPorAngulo([...porVideo.values()].map((x) => ({ angulo: x.angulo, detalle: x.detalle, gasto: x.gasto, compras: 0 })));
  const detalles = (angulo: string) => {
    const l = [...(temas.get(angulo) ?? [])].filter((d) => d.detalle).sort((a, b) => b.videos - a.videos || b.gasto - a.gasto).map((d) => d.detalle);
    return l.length ? { detalles: l } : {};
  };
  const angulos = crudo.map((c, i) => ({ angulo: c.angulo, videos: c.videos, pct: piso[i], gasto: c.gasto, ...detalles(c.angulo) })).sort((a, b) => b.videos - a.videos || b.gasto - a.gasto || a.angulo.localeCompare(b.angulo, "es"));
  return { angulos, videosTotal: porVideo.size, videosConAngulo: conAngulo };
}

/** El ángulo con que se clasifica una campaña, y si es una táctica general, con los temas de sus videos. */
export const anguloDeLaCampana = (c: { angulo: string | null; angulos: ComposicionAngulo[] }): string | null => (c.angulo ? nombreConTemas(c.angulo, c.angulos.find((a) => a.angulo === c.angulo)?.detalles, 3) : null);

/** El ángulo con que se clasifica una campaña a partir de su mezcla: el que domina (60 % o más), «Mezcla de ángulos» si hay varios y ninguno domina, null si no hay ninguno. */
export function anguloDominante(angulos: ComposicionAngulo[]): string | null {
  if (!angulos.length) return null;
  const [primero] = angulos;
  return primero.pct >= UMBRAL_DOMINANTE || angulos.length === 1 ? primero.angulo : MEZCLA_DE_ANGULOS;
}

/** «Antes y después (manchas) 50 % · Testimonio de cliente (próstata) 50 %». */
export const textoDeMezcla = (angulos: ComposicionAngulo[]): string => angulos.map((a) => `${nombreConTemas(a.angulo, a.detalles)} ${a.pct} %`).join(" · ");

export const DIMENSIONES_VIDEO = ["Ángulo", "Detalle del ángulo", "Gancho", "Formato", "Llamado a la acción", "Recursos", "Estructura", "Duración", "Momento del llamado", "Oferta"] as const;
export type DimensionVideo = (typeof DIMENSIONES_VIDEO)[number];

/** Qué mide cada dimensión de video, en una frase, para quien nunca lo vio. */
export const EXPLICACION_DIMENSION_VIDEO: Record<DimensionVideo, string> = {
  Ángulo: "El motivo de compra que usa el video para convencer.",
  "Detalle del ángulo": "De qué es la táctica general: de qué es el antes y después, de qué habla el testimonio, quién es el experto y de qué.",
  Gancho: "Cómo arranca el video, en sus primeros 3 segundos.",
  Formato: "El estilo del video: testimonio, demostración, UGC, animación…",
  "Llamado a la acción": "Qué le pide el video al espectador al final: comprar, aprovechar una oferta, escribir…",
  Recursos: "Lo que usa el video para convencer. Un video con varios recursos cuenta en cada uno.",
  Estructura: "El orden de las partes del video (gancho, problema, solución…).",
  Duración: "Cuánto dura el video.",
  "Momento del llamado": "En qué segundo aparece por primera vez el llamado a la acción.",
  Oferta: "Si el video dice una oferta concreta (descuento, 2x1, envío gratis, garantía).",
};

/** El orden de las partes de un video como texto («Gancho → Problema → Solución → Oferta»): sin repetir una parte seguida, sin «otro» y con un máximo de 6 partes. */
export function patronDeEstructura(partes: { parte: string }[]): string | null {
  const orden: string[] = [];
  for (const p of partes) {
    if (p.parte === "otro") continue;
    if (orden[orden.length - 1] !== p.parte) orden.push(p.parte);
  }
  if (!orden.length) return null;
  const nombres = orden.slice(0, 6).map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p));
  return `${nombres.join(" → ")}${orden.length > 6 ? " …" : ""}`;
}

export const RANGOS_DURACION = ["Hasta 15 s", "16 a 30 s", "31 a 45 s", "46 a 60 s", "Más de 60 s"] as const;
export function rangoDeDuracion(segundos: number | null | undefined): string | null {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos) || segundos <= 0) return null;
  return segundos <= 15 ? RANGOS_DURACION[0] : segundos <= 30 ? RANGOS_DURACION[1] : segundos <= 45 ? RANGOS_DURACION[2] : segundos <= 60 ? RANGOS_DURACION[3] : RANGOS_DURACION[4];
}

export const RANGOS_LLAMADO = ["En los primeros 10 s", "Entre 10 y 20 s", "Entre 20 y 30 s", "Después de 30 s"] as const;
export function rangoDelLlamado(segundo: number | null | undefined): string | null {
  if (segundo === null || segundo === undefined || !Number.isFinite(segundo) || segundo < 0) return null;
  return segundo < 10 ? RANGOS_LLAMADO[0] : segundo < 20 ? RANGOS_LLAMADO[1] : segundo < 30 ? RANGOS_LLAMADO[2] : RANGOS_LLAMADO[3];
}

const mayuscula = (t: string): string => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** El análisis completo con el video (con estructura y llamado a la acción): lo que hace falta para medir estructura, recursos, llamado y oferta. */
const completo = (v: VideoVista): boolean => v.analisis?.estado === "analizado" && v.analisis.version >= VERSION_ANALISIS;

/** Los valores que toma un video en una dimensión: vacío si no se le conoce (no cuenta en esa dimensión). Un video puede tener varios valores (los recursos). */
export function valoresDeVideo(v: VideoVista, dim: DimensionVideo): string[] {
  const a = v.analisis;
  switch (dim) {
    case "Ángulo": {
      const x = a?.angulo ?? v.angulo;
      return x ? [x] : [];
    }
    case "Detalle del ángulo": {
      // Solo las tácticas generales llevan detalle; se muestra con su ángulo para que se entienda sola («Antes y después · manchas en la cara»).
      const d = a?.anguloDetalle?.trim();
      const x = a?.angulo ?? v.angulo;
      return d && x ? [`${x} · ${d.charAt(0).toLowerCase()}${d.slice(1)}`] : [];
    }
    case "Gancho":
      return a?.ganchoTipo ? [mayuscula(a.ganchoTipo)] : [];
    case "Formato":
      return a && a.estado !== "error" && a.formato ? [mayuscula(a.formato)] : [];
    case "Llamado a la acción":
      return completo(v) && a?.ctaTipo ? [mayuscula(a.ctaTipo)] : [];
    case "Recursos":
      return completo(v) && a ? a.recursos.map(mayuscula) : [];
    case "Estructura": {
      const p = completo(v) && a ? patronDeEstructura(a.estructura) : null;
      return p ? [p] : [];
    }
    case "Duración": {
      const r = rangoDeDuracion(a?.duracionS);
      return r ? [r] : [];
    }
    case "Momento del llamado": {
      const r = completo(v) && a && a.ctaTipo && a.ctaTipo !== "ninguno" ? rangoDelLlamado(a.ctaSegundo) : null;
      return r ? [r] : [];
    }
    case "Oferta":
      return completo(v) && a ? [a.oferta ? "Con oferta concreta" : "Sin oferta concreta"] : [];
  }
}

export interface GruposDeVideo {
  grupos: Record<DimensionVideo, Grupo[]>;
  /** Videos del periodo a los que todavía no se les conoce esa dimensión. */
  sinDato: Record<DimensionVideo, number>;
  /** Videos del periodo (con gasto). */
  videos: number;
}

/** Mide cada dimensión de video con lo que costó y vendió cada video. El orden de los grupos es el de `agrupar` (los que ya se pueden comparar primero, de menor a mayor CPA). */
export function gruposDeVideos(videos: VideoVista[]): GruposDeVideo {
  const grupos = {} as Record<DimensionVideo, Grupo[]>;
  const sinDato = {} as Record<DimensionVideo, number>;
  const conGasto = videos.filter((v) => v.r.gasto > 0);
  for (const dim of DIMENSIONES_VIDEO) {
    const elementos: Elemento[] = [];
    let sin = 0;
    for (const v of conGasto) {
      const valores = valoresDeVideo(v, dim);
      if (!valores.length) sin++;
      for (const clave of valores) elementos.push({ clave, r: v.r, tope: v.tope, campana: v.id, video: v.id });
    }
    grupos[dim] = ordenNatural(dim, agrupar(elementos));
    // Una táctica general sola no dice nada: cada grupo lleva de qué son sus videos.
    if (dim === "Ángulo") {
      const conAngulo = conGasto.map((v) => ({ angulo: v.analisis?.angulo ?? v.angulo, detalle: v.analisis?.anguloDetalle, gasto: v.r.gasto, compras: v.r.compras }));
      grupos[dim] = grupos[dim].map((g) => {
        const deQue = temasDe(g.nombre, conAngulo);
        return deQue ? { ...g, deQue } : g;
      });
    }
    sinDato[dim] = sin;
  }
  return { grupos, sinDato, videos: conGasto.length };
}

/** Las dimensiones que son una escala (la duración, el momento del llamado) se leen mejor en su orden natural que por CPA; las demás quedan de mejor a peor. */
function ordenNatural(dim: DimensionVideo, grupos: Grupo[]): Grupo[] {
  const lista: readonly string[] | null = dim === "Duración" ? RANGOS_DURACION : dim === "Momento del llamado" ? RANGOS_LLAMADO : null;
  if (!lista) return grupos;
  return [...grupos].sort((a, b) => lista.indexOf(a.nombre) - lista.indexOf(b.nombre));
}

/** El mejor grupo de una lista (el de menor CPA entre los que ya se pueden comparar y tienen compras); null si todavía no hay ninguno. */
export function mejorGrupo(grupos: Grupo[]): Grupo | null {
  const ok = grupos.filter((g) => g.confiable && g.r.compras > 0);
  if (!ok.length) return null;
  return [...ok].sort((a, b) => a.r.gasto / a.r.compras - b.r.gasto / b.r.compras)[0];
}

/**
 * Cuánto mejor o peor es el CPA de un grupo frente al de todos juntos: −30 % = cuesta 30 % menos por compra que el promedio. Null si alguno de los dos no tiene compras.
 * `total` es la suma de todos los grupos de la dimensión (cuando un video tiene varios valores, cuenta una vez por valor: es una referencia, no un total contable).
 */
export function ventajaDeCpa(g: { r: Resultados }, total: Resultados): number | null {
  if (g.r.compras <= 0 || total.compras <= 0) return null;
  const propio = g.r.gasto / g.r.compras;
  const promedio = total.gasto / total.compras;
  return promedio > 0 ? ((propio - promedio) / promedio) * 100 : null;
}

/** El resultado de todos los grupos de una dimensión sumado (para compararlos con el promedio). */
export function sumaDeGrupos(grupos: Grupo[]): { r: Resultados; resultado: number } {
  return { r: grupos.reduce((acc, g) => sumar(acc, g.r), sinResultados()), resultado: grupos.reduce((acc, g) => acc + g.resultado, 0) };
}

/** Si un grupo es de verdad un buen camino: ya se puede comparar y deja ganancia. */
export const esGanador = (g: Grupo): boolean => g.confiable && g.resultado > 0;
/** Si un grupo es de verdad un mal camino: ya se puede comparar y pierde. */
export const esPerdedor = (g: Grupo): boolean => g.confiable && g.resultado < 0;
