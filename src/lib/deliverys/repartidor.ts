// Repartidores: identidad, datos sensibles y a quién pertenece cada nombre de la hoja. Lógica pura; prueba en
// `repartidor.test.ts`.

import { enmascararDocumento } from "../nomina/documento";
import { claveEtiqueta } from "./excel";

export { enmascararDocumento };

/** Nombre normalizado: mayúsculas, sin acentos, un espacio. Es la `clave` única del repartidor y la forma de un alias. */
export const claveRepartidor = (nombre: string) => claveEtiqueta(nombre);

/** Teléfono para listas: solo los cuatro últimos dígitos. «6123-4567» → «•••• 4567». */
export function enmascararTelefono(telefono: string | null | undefined): string {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 4) return "••••";
  return `•••• ${d.slice(-4)}`;
}

export interface RepartidorAlias {
  id: string;
  clave: string;
  alias: string[];
}

/**
 * De quién es un nombre de la hoja: el repartidor con esa clave (sin zona) o el que lo tiene como alias (y el nombre es
 * la zona). null si no es de nadie todavía.
 */
export function resolverEtiqueta(etiqueta: string, repartidores: RepartidorAlias[]): { repartidorId: string; zona: string | null } | null {
  const e = claveEtiqueta(etiqueta);
  if (!e) return null;
  const propio = repartidores.find((r) => r.clave === e);
  if (propio) return { repartidorId: propio.id, zona: null };
  const de = repartidores.find((r) => r.alias.some((a) => claveEtiqueta(a) === e));
  return de ? { repartidorId: de.id, zona: e } : null;
}

/**
 * Sugerencia para un nombre que no es de nadie: «ZONA 5 PEDRO» → el repartidor cuyo nombre empieza por PEDRO, si hay uno
 * solo. Los nombres que son un lugar («CHORRERA») no tienen sugerencia: se eligen en la importación.
 */
export function sugerirDueno(etiqueta: string, repartidores: RepartidorAlias[]): string | null {
  const e = claveEtiqueta(etiqueta);
  const m = e.match(/^ZONA\b.*\s([A-Z]+)$/);
  if (!m) return null;
  const candidatos = repartidores.filter((r) => r.clave.split(" ")[0] === m[1]);
  return candidatos.length === 1 ? candidatos[0].id : null;
}

/** Alias limpios y sin repetir (nunca la propia clave del repartidor). */
export function limpiarAlias(alias: unknown, clave: string): string[] {
  if (!Array.isArray(alias)) return [];
  return [...new Set(alias.filter((a): a is string => typeof a === "string").map(claveEtiqueta).filter((a) => a && a !== clave && a.length <= 80))].slice(0, 30);
}
