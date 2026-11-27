// Anuncios Meta › el video de ejemplo de una recomendación (27 nov 2026, pedido de Hernán): cuando el sistema dice «sube videos con el ángulo X», que muestre el video de ese producto con ese ángulo que mejor
// funcionó, para abrirlo ahí mismo y verlo. Lógica pura, con prueba.

import { cpa, type Resultados } from "./metricas";

/** El video que se muestra como ejemplo. */
export interface VideoEjemplo {
  id: string;
  nombre: string;
  angulo: string | null;
  /** Su CPA y sus compras en el periodo con que se eligió. */
  cpa: number | null;
  compras: number;
  /** De cuántos días son ese CPA y esas compras. */
  dias: number;
  miniatura: string | null;
  /** De qué producto es (cuando se buscó por el texto y puede no ser el de la recomendación). */
  producto?: string | null;
}

/** Con menos compras que estas, un video no sirve de ejemplo (su CPA es casualidad). */
export const COMPRAS_PARA_EJEMPLO = 2;
/** Con al menos estas compras un ejemplo es más confiable: se prefieren, y los de 2 a 4 compras quedan solo si no hay otro. */
export const COMPRAS_CONFIABLES = 5;

/** Los que tienen compras suficientes para confiar en su CPA; si no hay ninguno, todos. */
const confiables = <T extends { compras: number }>(l: T[]): T[] => {
  const firmes = l.filter((v) => v.compras >= COMPRAS_CONFIABLES);
  return firmes.length ? firmes : l;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Un anuncio con video, como ejemplo (con lo que hizo en 30 días); null si no tiene video. */
export function ejemploDeAnuncio(a: { videoId?: string | null; nombre: string; numero?: string | null; angulo: string | null; miniatura?: string | null; r: Resultados } | null | undefined): VideoEjemplo | null {
  if (!a?.videoId) return null;
  const c = cpa(a.r);
  return { id: a.videoId, nombre: a.numero && !a.nombre.startsWith(a.numero) ? `${a.numero} · ${a.nombre}` : a.nombre, angulo: a.angulo, cpa: c === null ? null : redondear(c), compras: a.r.compras, dias: 30, miniatura: a.miniatura ?? null };
}

/**
 * De los videos de un producto, el que mejor funcionó con ese ángulo: el de CPA más bajo entre los que tienen al menos 2 compras (con el mismo CPA, el de más compras). Null si ninguno alcanza.
 * `angulo` se compara tal cual lo guarda el análisis del video.
 */
export function mejorVideoDeAngulo(videos: readonly { id: string; nombre: string; angulo: string | null; r: Resultados; miniatura?: string | null }[], angulo: string, dias = 60): VideoEjemplo | null {
  const candidatos = videos.filter((v) => v.angulo === angulo && v.r.compras >= COMPRAS_PARA_EJEMPLO && cpa(v.r) !== null);
  const mejor = [...confiables(candidatos.map((v) => ({ ...v, compras: v.r.compras })))].sort((a, b) => cpa(a.r)! - cpa(b.r)! || b.r.compras - a.r.compras)[0];
  if (!mejor) return null;
  return { id: mejor.id, nombre: mejor.nombre, angulo: mejor.angulo, cpa: redondear(cpa(mejor.r)!), compras: mejor.r.compras, dias, miniatura: mejor.miniatura ?? null };
}

/** Un video que puede servir de ejemplo (de los últimos 30 días), para buscarlo por lo que dice una recomendación. */
export interface VideoCandidato {
  id: string;
  nombre: string;
  /** El ángulo como lo guarda el análisis y como se muestra (con su detalle). */
  angulo: string | null;
  anguloNombre: string | null;
  /** Lo demás que tiene y que una recomendación puede nombrar como «lo que funcionó»: el tipo de gancho, el formato, el tipo de llamado a la acción. */
  rasgos: string[];
  /** La llave del producto y su nombre. */
  productoClave: string;
  producto: string | null;
  cpa: number | null;
  compras: number;
  miniatura: string | null;
}

const normal = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * El video de ejemplo de una recomendación por lo que dice (27 nov 2026, pedido de Hernán: en el «Qué hacer» de todas las pestañas, siempre que se mencione algo que funcionó). Busca lo que nombra entre comillas: un ángulo
 * («Salud prostática», «Salud prostática (sobre todo …)»), un tipo de gancho, un formato, un tipo de llamado a la acción o el nombre de un video. Devuelve el video que lo tiene con el CPA más bajo y al menos 2 compras: primero
 * del mismo producto; si no hay, de cualquiera. Null si no nombra nada con videos que sirvan.
 */
export function videoDelTexto(texto: string | null | undefined, candidatos: readonly VideoCandidato[], productoClave?: string | null): VideoEjemplo | null {
  if (!texto || !candidatos.length) return null;
  const citas = [...texto.matchAll(/«([^»]{2,120})»/g)].map((m) => normal(m[1].replace(/\s*\(sobre todo.*$/i, "")));
  if (!citas.length) return null;
  const sirven = candidatos.filter((v) => v.compras >= COMPRAS_PARA_EJEMPLO && v.cpa !== null);
  for (const cita of citas) {
    const delAngulo = sirven.filter(
      (v) =>
        normal(v.nombre) === cita ||
        (v.angulo && normal(v.angulo) === cita) ||
        (v.anguloNombre && (normal(v.anguloNombre) === cita || normal(v.anguloNombre).startsWith(`${cita} (`))) ||
        v.rasgos.some((r) => normal(r) === cita),
    );
    if (!delAngulo.length) continue;
    const mismos = productoClave ? delAngulo.filter((v) => v.productoClave === productoClave) : [];
    const lista = confiables(mismos.length ? mismos : delAngulo);
    const v = [...lista].sort((a, b) => a.cpa! - b.cpa! || b.compras - a.compras)[0];
    return { id: v.id, nombre: v.nombre, angulo: v.anguloNombre ?? v.angulo, cpa: redondear(v.cpa!), compras: v.compras, dias: 30, miniatura: v.miniatura, producto: mismos.length ? null : v.producto };
  }
  return null;
}
