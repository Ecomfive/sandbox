// Anuncios Meta › Videos: por qué se pueden ordenar los videos y cómo (18 nov 2026, pedido de Alcides: «que no esté solo de más a menos gasto»). Lógica pura, con prueba.

import { confiable, cpa, ctr, holdRate, hookRate, resultado } from "./metricas";
import type { VideoVista } from "./vistas";

export type CriterioVideo = "mejor" | "gasto" | "compras" | "cpa" | "hook" | "hold" | "ctr" | "resultado" | "campanas" | "anuncios" | "nombre";
export type Sentido = "asc" | "desc";

/** Cada criterio con su nombre y el sentido en que «lo mejor» va primero (el CPA, de menor a mayor; el resto, de mayor a menor). */
export const CRITERIOS_VIDEO: { valor: CriterioVideo; etiqueta: string; sentido: Sentido }[] = [
  { valor: "mejor", etiqueta: "Mejor resultado (CPA con data suficiente)", sentido: "asc" },
  { valor: "gasto", etiqueta: "Gasto", sentido: "desc" },
  { valor: "compras", etiqueta: "Compras", sentido: "desc" },
  { valor: "cpa", etiqueta: "CPA", sentido: "asc" },
  { valor: "hook", etiqueta: "Hook (3 s)", sentido: "desc" },
  { valor: "hold", etiqueta: "Pasan 15 s", sentido: "desc" },
  { valor: "ctr", etiqueta: "CTR del enlace", sentido: "desc" },
  { valor: "resultado", etiqueta: "Resultado estimado", sentido: "desc" },
  { valor: "campanas", etiqueta: "Campañas donde se usa", sentido: "desc" },
  { valor: "anuncios", etiqueta: "Anuncios donde se usa", sentido: "desc" },
  { valor: "nombre", etiqueta: "Nombre", sentido: "asc" },
];

export const sentidoNatural = (c: CriterioVideo): Sentido => CRITERIOS_VIDEO.find((x) => x.valor === c)?.sentido ?? "desc";

/** El valor por el que se ordena un video; null = no tiene ese dato (sin compras no hay CPA, sin impresiones no hay hook) y va siempre al final. */
export function claveDe(v: VideoVista, c: CriterioVideo): number | string | null {
  switch (c) {
    case "mejor": {
      const costo = cpa(v.r);
      // Los de poca data se comparan aparte (después de los que ya tienen gasto suficiente), como la lista de siempre.
      return costo === null ? null : (confiable(v.r) ? 0 : 1000) + costo;
    }
    case "gasto":
      return v.r.gasto;
    case "compras":
      return v.r.compras;
    case "cpa":
      return cpa(v.r);
    case "hook":
      return hookRate(v.r);
    case "hold":
      return holdRate(v.r);
    case "ctr":
      return ctr(v.r);
    case "resultado":
      return v.r.gasto > 0 ? resultado(v.r, v.tope) : null;
    case "campanas":
      return v.campanas;
    case "anuncios":
      return v.anuncios;
    case "nombre":
      return v.nombre.toLocaleLowerCase("es");
  }
}

/** Los videos ordenados. Los que no tienen el dato quedan al final, suba o baje el orden; a igual valor, el que más gastó va primero. */
export function ordenarVideos(videos: VideoVista[], criterio: CriterioVideo, sentido: Sentido): VideoVista[] {
  const factor = sentido === "asc" ? 1 : -1;
  return [...videos].sort((a, b) => {
    const x = claveDe(a, criterio);
    const y = claveDe(b, criterio);
    if (x === null && y === null) return b.r.gasto - a.r.gasto;
    if (x === null) return 1;
    if (y === null) return -1;
    const d = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "es", { numeric: true }) : x - y;
    return d !== 0 ? d * factor : b.r.gasto - a.r.gasto;
  });
}
