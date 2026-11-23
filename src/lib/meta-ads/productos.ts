// Anuncios Meta › vista por producto (23 nov 2026, pedido de Alcides): todo lo que se gastó y vendió de cada producto, sumando sus campañas, con sus ángulos y sus videos. Lógica pura, con prueba.

import { claveDeProducto } from "./nombre";
import { sinResultados, sumar, type Resultados } from "./metricas";
import type { CampanaVista, ProductoVista, VideoVista } from "./vistas";

/** Los productos de las campañas (sumadas las del periodo), de más a menos gasto. Una campaña sin producto cuenta como «Sin producto». */
export function agruparProductos(campanas: CampanaVista[], videos: VideoVista[]): ProductoVista[] {
  const mapa = new Map<string, ProductoVista>();
  for (const c of campanas) {
    const clave = claveDeProducto(c.producto);
    const p = mapa.get(clave) ?? { clave, nombre: c.producto?.trim() || "Sin producto", tope: c.tope, topeDefinido: c.topeDefinido, r: sinResultados(), campanas: 0, activas: 0, videos: 0, anuncios: 0 };
    p.r = sumar(p.r, c.r);
    p.campanas++;
    if (c.activa) p.activas++;
    mapa.set(clave, p);
  }
  const videosDe = new Map<string, number>();
  for (const v of videos) videosDe.set(claveDeProducto(v.producto), (videosDe.get(claveDeProducto(v.producto)) ?? 0) + 1);
  for (const p of mapa.values()) p.videos = videosDe.get(p.clave) ?? 0;
  return [...mapa.values()].sort((a, b) => b.r.gasto - a.r.gasto);
}

export interface AnguloDeProducto {
  angulo: string;
  videos: number;
  r: Resultados;
}

/** Los ángulos que usa un producto en sus videos (los de los últimos 30 días), cada uno con lo que sumaron sus videos, de más a menos gasto. Un video sin ángulo va a «Sin ángulo». */
export function angulosDeProducto(videos: VideoVista[], clave: string): AnguloDeProducto[] {
  const mapa = new Map<string, AnguloDeProducto>();
  for (const v of videos) {
    if (claveDeProducto(v.producto) !== clave) continue;
    const angulo = v.analisis?.angulo ?? v.angulo ?? "Sin ángulo";
    const a = mapa.get(angulo) ?? { angulo, videos: 0, r: sinResultados() };
    a.videos++;
    a.r = sumar(a.r, v.r);
    mapa.set(angulo, a);
  }
  return [...mapa.values()].sort((a, b) => b.r.gasto - a.r.gasto);
}
