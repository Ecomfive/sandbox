// Anuncios Meta › Qué funciona: juntar campañas, anuncios o videos por una dimensión (ángulo, estructura, puja, copy, landing…) y ordenarlos de mejor a peor CPA. Lógica pura, con prueba.

import { confiable, cpa, resultado, sinResultados, sumar, type Resultados } from "./metricas";
import type { Grupo } from "./vistas";

export interface Elemento {
  /** La dimensión por la que se junta; null = no cuenta (por ejemplo, una campaña sin ángulo). */
  clave: string | null;
  r: Resultados;
  /** El CPA tope del producto del elemento (el resultado de un grupo es la suma de los de sus elementos). */
  tope: number;
  /** Para contar campañas distintas. */
  campana?: string;
}

/** Los grupos ordenados: primero los que ya tienen suficiente gasto para compararse (menor CPA primero; sin compras al final) y después los de poca data. */
export function agrupar(elementos: Elemento[]): Grupo[] {
  const mapa = new Map<string, { r: Resultados; resultado: number; campanas: Set<string> }>();
  elementos.forEach((e, i) => {
    if (!e.clave) return;
    const g = mapa.get(e.clave) ?? { r: sinResultados(), resultado: 0, campanas: new Set<string>() };
    g.r = sumar(g.r, e.r);
    g.resultado += resultado(e.r, e.tope);
    g.campanas.add(e.campana ?? `#${i}`);
    mapa.set(e.clave, g);
  });
  const grupos: Grupo[] = [...mapa].map(([nombre, g]) => ({ nombre, campanas: g.campanas.size, r: g.r, resultado: g.resultado, confiable: confiable(g.r) }));
  const peso = (g: Grupo) => (g.confiable ? 0 : 1000) + (cpa(g.r) ?? 99);
  return grupos.sort((a, b) => peso(a) - peso(b) || b.r.gasto - a.r.gasto);
}

/** El enlace de una landing sin parámetros ni rastreo (utm, fbclid): «https://tienda.com/corrector?utm_source=fb» → «tienda.com/corrector». */
export function landingLimpia(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const ruta = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${ruta}`;
  } catch {
    return null;
  }
}

/** El texto de un anuncio como llave para juntar los que dicen lo mismo (sin espacios de más): se recorta para que un cambio al final no los separe. */
export function copyLimpio(copy: string | null | undefined): string | null {
  const t = (copy ?? "").replace(/\s+/g, " ").trim();
  return t.length >= 8 ? t.slice(0, 140) : null;
}
