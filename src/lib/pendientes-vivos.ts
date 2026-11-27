// Contadores del menú en vivo (17 nov 2026, pedido de Hernán): el número de «Avisos» y el de la campana de tareas los calcula el servidor al cargar o cambiar de página; para que se actualicen
// solos, el navegador vuelve a preguntar cada 30 segundos solo por lo personal (avisos «Para ti» sin leer y tareas) y esta función lo pone sobre lo que ya trajo la página. Lógica pura, con prueba.

import type { Urgentes } from "./avisos-urgentes";
import type { PendientesMenu } from "./contadores-menu";

/** Lo personal que se vuelve a preguntar: los avisos «Para ti» sin leer y las tareas asignadas sin cerrar. */
export interface PendientesPersonales {
  paraTi: number;
  tareasMias: number;
  urgentes: Urgentes;
}

/**
 * Los pendientes de la página con lo personal actualizado: el total de «Avisos» cambia por la diferencia de avisos «Para ti» (lo demás del total —pendientes del día y actualizaciones—
 * no se toca) y la campana toma las tareas nuevas. Sin lectura todavía (`null`), queda lo que trajo la página.
 */
export function conPendientesVivos(p: PendientesMenu, vivos: PendientesPersonales | null): PendientesMenu {
  if (!vivos) return p;
  return { ...p, total: Math.max(0, p.total - p.paraTi + vivos.paraTi), paraTi: vivos.paraTi, tareasMias: vivos.tareasMias, urgentes: vivos.urgentes };
}

/** Cada cuánto se vuelve a preguntar (solo con la pestaña a la vista). */
export const CADA_PENDIENTES_MS = 30_000;
