// Actualizaciones del sistema (31 oct 2026, pedido de Alcides): lo que cambió cada día, para los administradores. Sale de las novedades del Centro
// de ayuda (`NOVEDADES`, una por cada cambio que se ve, escrita en palabras simples), **todas**, sin filtrar por los módulos de la persona. Sin
// base ni React, para probarlo.

import type { Novedad } from "./contenido";

/** Las actualizaciones de los últimos días que el Centro de notificaciones muestra para marcar como vistas (las anteriores, en el Centro de ayuda). */
export const DIAS_AVISO = 30;

/**
 * La clave con que se guarda que alguien vio una actualización (`novedades_vistas`, migración 0218): su fecha y una huella corta del título
 * (FNV-1a), así no depende del orden de la lista. «2026-10-31-1a2b3c4d».
 */
export function claveNovedad(n: Pick<Novedad, "fecha" | "titulo">): string {
  let h = 0x811c9dc5;
  for (const c of n.titulo) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${n.fecha}-${h.toString(16).padStart(8, "0")}`;
}

/** Las de los últimos `dias` días hasta `hoy` (AAAA-MM-DD), de la más nueva a la más vieja. */
export function recientes(novedades: readonly Novedad[], hoy: string, dias = DIAS_AVISO): Novedad[] {
  const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - (dias - 1) * 86_400_000).toISOString().slice(0, 10);
  return novedades.filter((n) => n.fecha >= desde && n.fecha <= hoy).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

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

/** Cuántas de estas no ha visto la persona (`vistas`: las claves que ya vio). */
export const sinVer = (novedades: readonly Novedad[], vistas: ReadonlySet<string>): number => novedades.filter((n) => !vistas.has(claveNovedad(n))).length;

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
