// Los países que puede ver cada persona (`perfiles.paises_permitidos`, migración 0087). `null` = todos. Las compras de
// Compras Importadora no tienen país: se ven con «importacion» en la lista. Lógica pura: sirve en el servidor y en el cliente.

/** La clave con la que una compra de Importadora (sin país) aparece en la lista de países permitidos. */
export const CLAVE_IMPORTADORA = "importacion";

/** Si la persona puede ver ese país (código «PA»…; `null` = una compra de Importadora). */
export function puedeVerPais(permitidos: string[] | null, codigo: string | null): boolean {
  if (permitidos === null) return true;
  return permitidos.includes(codigo ?? CLAVE_IMPORTADORA);
}

/** Deja solo los países que la persona puede ver. */
export function filtrarPaises<T extends { codigo: string }>(permitidos: string[] | null, paises: T[]): T[] {
  return permitidos === null ? paises : paises.filter((p) => permitidos.includes(p.codigo));
}

/** Cómo se lee la lista: «Todos los países», «Panamá, Costa Rica», «Ninguno». */
export function textoPaisesPermitidos(permitidos: string[] | null, nombres: Record<string, string>): string {
  if (permitidos === null) return "Todos los países";
  if (permitidos.length === 0) return "Ninguno";
  return permitidos.map((c) => (c === CLAVE_IMPORTADORA ? "Importadora" : (nombres[c] ?? c))).join(", ");
}
