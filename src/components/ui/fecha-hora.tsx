"use client";

import { useCodigoPais } from "@/components/pais-contexto";
import { formatearFechaHoraCompleta } from "@/lib/formato";

/**
 * La fecha y la hora de un registro («20 nov 2026, 01:50 p. m.»), en la hora del país de la barra de arriba (20 nov 2026, pedido de Jhokser: en los movimientos
 * del producto y en los demás historiales, la fecha y no «hace 2 d»). Lo que dice qué tan fresco es un dato (la última lectura, la última conexión) sigue con
 * `formatearTiempoRelativo`.
 */
export function FechaHora({ iso }: { iso: string }) {
  const codigoPais = useCodigoPais();
  return <>{formatearFechaHoraCompleta(iso, codigoPais)}</>;
}
