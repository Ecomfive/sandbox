// Pipeline › Control con tiendas limitadas (auditoría de seguridad, 18 nov 2026): qué remesas y aprobaciones son de las tiendas
// de la persona. Una remesa junta órdenes de un mensajero, que pueden ser de varias tiendas: solo se ve si todas sus órdenes son
// de sus tiendas (la misma regla que «Anular remesa»). Lógica pura; la prueba está en `operacion-tiendas.test.ts`.

import { puedeVerUnidad } from "../finanzas/tiendas-permitidas";

/** Las remesas (por id) cuyas órdenes son todas de las tiendas permitidas. Sin límite, todas las que tengan órdenes. */
export function remesasDeSusTiendas(permitidas: string[] | null, ordenes: { remesaId: string; unidadId: string | null }[]): Set<string> {
  const fuera = new Set<string>();
  const todas = new Set<string>();
  for (const o of ordenes) {
    todas.add(o.remesaId);
    if (!puedeVerUnidad(permitidas, o.unidadId)) fuera.add(o.remesaId);
  }
  return new Set([...todas].filter((id) => !fuera.has(id)));
}

/** Si una aprobación pendiente es de sus tiendas: cancelar una orden suya o anular una remesa suya. */
export function aprobacionDeSusTiendas(
  permitidas: string[] | null,
  a: { accion: string; referencia: string },
  unidadDeOrden: Map<string, string | null>,
  remesasSuyas: Set<string>,
): boolean {
  if (permitidas === null) return true;
  if (a.accion === "cancelar_orden") return unidadDeOrden.has(a.referencia) && puedeVerUnidad(permitidas, unidadDeOrden.get(a.referencia));
  if (a.accion === "anular_remesa") return remesasSuyas.has(a.referencia);
  return false;
}
