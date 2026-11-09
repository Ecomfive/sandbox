// Portal AF4 360° › país de las pantallas que leen la operación (Inventario, Compras, Plan de compras, Reorden).
// Antes eran solo de Panamá; ahora siguen el país de la barra de arriba si es uno de los que tienen Dropi y WMS.
// Lógica pura: sirve en el servidor y en el cliente. Prueba en `pais-finanzas.test.ts`.

import { puedeVerPais } from "@/lib/paises-permitidos";

/** El país de siempre de Finanzas: el que se usa si el de la barra no tiene operación cargada. */
export const PAIS_FINANZAS_BASE = "PA";
/** Países con operación (compras, inventario y ventas de Dropi) para estas pantallas. */
export const PAISES_OPERACION = ["PA", "CR", "MX"] as const;

/**
 * El país que se ve: el de la barra si tiene operación y la persona lo puede ver; si no, Panamá si lo puede ver; si no,
 * el primero de la lista que pueda ver; null si no puede ver ninguno.
 */
export function paisDeOperacion(barra: string | null | undefined, permitidos: string[] | null): string | null {
  const b = (barra ?? "").toUpperCase();
  const orden = [b, PAIS_FINANZAS_BASE, ...PAISES_OPERACION];
  for (const c of orden) {
    if ((PAISES_OPERACION as readonly string[]).includes(c) && puedeVerPais(permitidos, c)) return c;
  }
  return null;
}

/** El nombre de un país de operación para los avisos («No tienes acceso a las compras de Panamá»). */
export function nombreDePais(codigo: string): string {
  return ({ PA: "Panamá", CR: "Costa Rica", MX: "México" } as Record<string, string>)[codigo] ?? codigo;
}
