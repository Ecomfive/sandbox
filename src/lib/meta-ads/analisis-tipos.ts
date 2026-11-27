// Anuncios Meta › lo del análisis guardado que también necesitan las pantallas y `datos.ts` (que se importa desde el navegador): tipos y reglas puras, sin nada del servidor. Lo que lee y escribe la base está en `analisis-guardado.ts`.

import { seccionDeHallazgo, type AnalisisHistorico, type FilaEntrega, type FilaVentas, type Hallazgo, type SeccionHallazgo } from "./historico";

export interface AnalisisGuardado {
  generadoEn: string;
  analisis: AnalisisHistorico;
  tiendas: string[];
  pedidos: number;
}

export const claveDeAnalisis = (paisId: string): string => `analisis_historico:${paisId}`;

/** Un análisis con más de esto se considera viejo: se prepara de nuevo al abrir la pantalla. */
export const HORAS_ANALISIS_VIGENTE = 26;

/** ¿Hace falta preparar el análisis? Sí si no hay ninguno o es de hace más de `HORAS_ANALISIS_VIGENTE`. */
export const analisisViejo = (g: { generadoEn: string } | null, ahora = Date.now()): boolean => !g || (ahora - Date.parse(g.generadoEn)) / 3_600_000 > HORAS_ANALISIS_VIGENTE;

/** Lo del análisis guardado que se muestra en las pestañas Productos, Campañas y Videos (no todo el análisis: pesa mucho para mandarlo al navegador). */
export interface HistorialSecciones {
  generadoEn: string;
  /** Hallazgos del historial por pantalla, los que piden atención primero y, dentro, los de más gasto. */
  hallazgos: Record<SeccionHallazgo, Hallazgo[]>;
  /** Entrega por producto (Productos). */
  entrega: FilaEntrega[];
  tasaEntrega: number | null;
  tiendas: string[];
  pedidos: number;
  /** Qué genera más ventas, lo mejor de cada lista (todo el historial). */
  rankings: { productos: FilaVentas[]; campanas: FilaVentas[]; videos: FilaVentas[]; angulos: FilaVentas[]; ganchos: FilaVentas[]; formatos: FilaVentas[] };
}

const MAX_POR_SECCION = 40;
const MAX_RANKING = 10;
const MAX_ENTREGA = 40;

/** Reparte los hallazgos del análisis por sección (atención primero, luego por gasto) y recorta lo que viaja al navegador. */
export function seccionesDeAnalisis(g: AnalisisGuardado): HistorialSecciones {
  const hallazgos: Record<SeccionHallazgo, Hallazgo[]> = { productos: [], campanas: [], videos: [], general: [] };
  const orden = (h: Hallazgo) => (h.tono === "alerta" ? 0 : h.tono === "bueno" ? 1 : 2);
  for (const h of [...g.analisis.hallazgos].sort((a, b) => orden(a) - orden(b) || b.gasto - a.gasto)) {
    const lista = hallazgos[seccionDeHallazgo(h)];
    if (lista.length < MAX_POR_SECCION) lista.push(h);
  }
  const r = g.analisis.rankings;
  const top = (f: FilaVentas[]) => f.slice(0, MAX_RANKING);
  return {
    generadoEn: g.generadoEn,
    hallazgos,
    entrega: g.analisis.entrega.slice(0, MAX_ENTREGA),
    tasaEntrega: g.analisis.resumen.tasaEntrega,
    tiendas: g.tiendas,
    pedidos: g.pedidos,
    rankings: { productos: top(r.productos), campanas: top(r.campanas), videos: top(r.videos), angulos: top(r.angulos), ganchos: top(r.ganchos), formatos: top(r.formatos) },
  };
}
