"use client";

import { useEffect } from "react";
import { setTiendaActual } from "@/lib/finanzas/tienda-actions";
import { TODAS_TIENDAS } from "@/lib/finanzas/tienda-elegida";

/**
 * Cuando la página se abre con una tienda en la dirección (se eligió en el selector de la página), la guarda como la
 * tienda global para que las demás páginas de Finanzas arranquen con ella. No dibuja nada. Una unidad que no es tienda
 * (CORPORATIVO en el Estado de resultados) el servidor no la guarda.
 */
export function RecordarTienda({ explicito, global }: { explicito: string | null; global: string | null }) {
  useEffect(() => {
    if (explicito !== null && explicito !== (global ?? TODAS_TIENDAS)) void setTiendaActual(explicito);
  }, [explicito, global]);
  return null;
}
