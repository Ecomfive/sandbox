// Las páginas (pestañas) de un módulo que una persona no debe ver: salen de lo afinado. Las usan la franja de pestañas y la paleta de
// búsqueda; cada página además se protege sola con `requirePestana`.

import type { Afinado } from "./afinado";
import { catalogoDe } from "./catalogo";

/** Pestañas que por ahora solo ve un administrador (no se afinan por rol): Compras › Reponer. */
export const PESTANAS_SOLO_ADMIN = ["/compras/reponer"];

export function pestanasOcultasDe(afinado: Record<string, Afinado>): string[] {
  const ocultas: string[] = [];
  for (const [modulo, a] of Object.entries(afinado)) {
    const catalogo = catalogoDe(modulo);
    if (!catalogo) continue;
    for (const p of catalogo.pestanas) if (a.pestanasOcultas.includes(p.clave)) ocultas.push(p.href);
  }
  return ocultas;
}
