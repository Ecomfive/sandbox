// Anuncios Meta › lo del análisis guardado que también necesitan las pantallas y `datos.ts` (que se importa desde el navegador): tipos y reglas puras, sin nada del servidor. Lo que lee y escribe la base está en `analisis-guardado.ts`.

import type { AnalisisHistorico } from "./historico";

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
