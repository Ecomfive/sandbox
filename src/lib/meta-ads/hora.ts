// Anuncios Meta › las horas se muestran en la hora de Panamá (el módulo mide los días así), nunca en la del servidor, que corre en UTC. Con prueba.

import { formatearFechaHoraCompleta } from "@/lib/formato";

/** Un instante guardado con zona (timestamptz) en hora de Panamá: «23 nov 2026, 08:01 a. m.». Sin dato, «—». */
export function horaDeMeta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return formatearFechaHoraCompleta(iso, "PA");
}
