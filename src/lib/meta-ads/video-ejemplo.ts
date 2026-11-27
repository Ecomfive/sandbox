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
}

/** Con menos compras que estas, un video no sirve de ejemplo (su CPA es casualidad). */
export const COMPRAS_PARA_EJEMPLO = 2;

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Un anuncio con video, como ejemplo (con lo que hizo en 30 días); null si no tiene video. */
export function ejemploDeAnuncio(a: { videoId?: string | null; nombre: string; numero?: string | null; angulo: string | null; miniatura?: string | null; r: Resultados } | null | undefined): VideoEjemplo | null {
  if (!a?.videoId) return null;
  const c = cpa(a.r);
  return { id: a.videoId, nombre: a.numero ? `${a.numero} · ${a.nombre}` : a.nombre, angulo: a.angulo, cpa: c === null ? null : redondear(c), compras: a.r.compras, dias: 30, miniatura: a.miniatura ?? null };
}

/**
 * De los videos de un producto, el que mejor funcionó con ese ángulo: el de CPA más bajo entre los que tienen al menos 2 compras (con el mismo CPA, el de más compras). Null si ninguno alcanza.
 * `angulo` se compara tal cual lo guarda el análisis del video.
 */
export function mejorVideoDeAngulo(videos: readonly { id: string; nombre: string; angulo: string | null; r: Resultados; miniatura?: string | null }[], angulo: string, dias = 60): VideoEjemplo | null {
  const candidatos = videos.filter((v) => v.angulo === angulo && v.r.compras >= COMPRAS_PARA_EJEMPLO && cpa(v.r) !== null);
  const mejor = [...candidatos].sort((a, b) => cpa(a.r)! - cpa(b.r)! || b.r.compras - a.r.compras)[0];
  if (!mejor) return null;
  return { id: mejor.id, nombre: mejor.nombre, angulo: mejor.angulo, cpa: redondear(cpa(mejor.r)!), compras: mejor.r.compras, dias, miniatura: mejor.miniatura ?? null };
}
