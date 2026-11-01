// Actualizaciones del sistema (31 oct 2026, pedido de Alcides): lo que cambió cada día, para los administradores. Sale de las novedades del Centro
// de ayuda (`NOVEDADES`, una por cada cambio que se ve, escrita en palabras simples), **todas**, sin filtrar por los módulos de la persona. Sin
// base ni React, para probarlo.

import type { Novedad } from "./contenido";

/** Lo último que la persona vio (AAAA-MM-DD), guardado en su navegador: el botón «Cambios» del riel marca lo que vino después. */
export const CLAVE_VISTO = "actualizaciones-visto-v1";

export interface DiaDeCambios {
  /** AAAA-MM-DD. */
  fecha: string;
  cambios: Novedad[];
}

/** Las novedades por día, del más nuevo al más viejo; dentro de un día, en el orden en que están escritas (la más nueva arriba). */
export function agruparPorDia(novedades: readonly Novedad[]): DiaDeCambios[] {
  const dias = new Map<string, Novedad[]>();
  for (const n of novedades) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.fecha)) continue;
    dias.set(n.fecha, [...(dias.get(n.fecha) ?? []), n]);
  }
  return [...dias].sort((a, b) => b[0].localeCompare(a[0])).map(([fecha, cambios]) => ({ fecha, cambios }));
}

/** La fecha del cambio más nuevo, o null si no hay ninguno. */
export const ultimaFecha = (novedades: readonly Novedad[]): string | null =>
  novedades.reduce<string | null>((max, n) => (/^\d{4}-\d{2}-\d{2}$/.test(n.fecha) && (max === null || n.fecha > max) ? n.fecha : max), null);

/** Cuántos cambios hay después de la fecha que la persona vio por última vez (todos si nunca entró). */
export const cambiosNuevos = (novedades: readonly Novedad[], vista: string | null): number =>
  novedades.filter((n) => vista === null || vista === "" || n.fecha > vista).length;

/** Las que tienen la búsqueda (sin acentos ni mayúsculas, cada palabra) en el título o el texto, y del módulo elegido (vacío = todos). */
export function filtrarCambios(novedades: readonly Novedad[], busqueda: string, modulo: string): Novedad[] {
  const limpio = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const palabras = limpio(busqueda).split(/\s+/).filter(Boolean);
  return novedades.filter((n) => {
    if (modulo && (n.modulo ?? "") !== modulo) return false;
    const t = limpio(`${n.titulo} ${n.texto}`);
    return palabras.every((p) => t.includes(p));
  });
}
