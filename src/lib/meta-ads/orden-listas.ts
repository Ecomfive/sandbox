// Anuncios Meta › por qué se puede ordenar cada lista (25 nov 2026, pedido de Alcides). Las métricas salen solas del catálogo de columnas; aquí solo va lo propio de cada lista. **Para agregar un orden nuevo se suma una línea aquí** (nombre, grupo, sentido y de dónde
// sale el valor); para una métrica nueva, en `columnas.ts`, que la ofrece en todas. Lógica pura, con prueba.

import { criterioMejor, criteriosDeMetricas, type CriterioOrden, type Orden, type ResultadosDeFila } from "./orden";
import type { CampanaVista, Grupo, ProductoVista, VideoVista } from "./vistas";

const nombre = <F>(de: (f: F) => string): CriterioOrden<F> => ({ valor: "nombre", etiqueta: "Nombre", grupo: "Otros", sentido: "asc", de: (f) => de(f).toLocaleLowerCase("es") });
const cuenta = <F>(valor: string, etiqueta: string, de: (f: F) => number | null): CriterioOrden<F> => ({ valor, etiqueta, grupo: "Otros", sentido: "desc", de });
const todos = <F>(de: ResultadosDeFila<F>, propios: CriterioOrden<F>[], sinFrecuencia: boolean): CriterioOrden<F>[] => [criterioMejor(de), ...criteriosDeMetricas(de, sinFrecuencia), ...propios];

export const CRITERIOS_CAMPANAS: CriterioOrden<CampanaVista>[] = todos<CampanaVista>(
  (c) => ({ r: c.r, ctx: { tope: c.tope, etapa: c.etapa, frecuencia: c.frecuencia } }),
  [{ valor: "creada", etiqueta: "Fecha en que se montó", grupo: "Otros", sentido: "desc", de: (c) => c.creadaEn }, cuenta("videos", "Videos distintos que usa", (c) => c.videosTotal), nombre((c) => c.nombre)],
  false,
);

export const CRITERIOS_PRODUCTOS: CriterioOrden<ProductoVista>[] = todos<ProductoVista>(
  (p) => ({ r: p.r, ctx: { tope: p.tope, etapa: "venta" } }),
  [cuenta("campanas", "Campañas", (p) => p.campanas), cuenta("activas", "Campañas activas", (p) => p.activas), cuenta("videos", "Videos", (p) => p.videos), cuenta("anuncios", "Anuncios", (p) => p.anuncios), nombre((p) => p.nombre)],
  true,
);

export const CRITERIOS_VIDEOS: CriterioOrden<VideoVista>[] = todos<VideoVista>(
  (v) => ({ r: v.r, ctx: { tope: v.tope, etapa: "venta" } }),
  [cuenta("campanas", "Campañas donde se usa", (v) => v.campanas), cuenta("anuncios", "Anuncios donde se usa", (v) => v.anuncios), cuenta("duracion", "Duración del video", (v) => v.analisis?.duracionS ?? null), nombre((v) => v.nombre)],
  true,
);

/** Las tablas de «Qué funciona»: el tope de un grupo no es uno solo, así que «resultado» usa el que ya viene sumado. */
export const CRITERIOS_GRUPOS: CriterioOrden<Grupo>[] = [
  ...criteriosDeMetricas<Grupo>((g) => ({ r: g.r, ctx: { tope: 0, etapa: "venta" } }), true).filter((c) => c.valor !== "resultado"),
  { valor: "resultado", etiqueta: "Resultado estimado", grupo: "Resultados", sentido: "desc", de: (g) => (g.r.gasto > 0 ? g.resultado : null) },
  cuenta<Grupo>("campanas", "Campañas", (g) => g.campanas),
  cuenta<Grupo>("videos", "Videos", (g) => g.videos),
  nombre<Grupo>((g) => g.nombre),
];

export const ORDEN_CAMPANAS: Orden[] = [{ criterio: "gasto", sentido: "desc" }];
export const ORDEN_PRODUCTOS: Orden[] = [{ criterio: "gasto", sentido: "desc" }];
export const ORDEN_VIDEOS: Orden[] = [{ criterio: "mejor", sentido: "asc" }];
