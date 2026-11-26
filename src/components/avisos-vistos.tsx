"use client";

import { useEffect } from "react";
import { usePendientesVivos } from "@/components/pendientes-vivos";
import type { SeccionUrgente } from "@/lib/avisos-urgentes";
import { marcarAvisosVistos } from "@/lib/menciones-actions";

/** No dibuja nada: al abrir la pantalla marca como vistos sus avisos y actualiza el menú, que deja de estar en rojo. */
export function AvisosVistos({ seccion }: { seccion: SeccionUrgente }) {
  const { refrescar } = usePendientesVivos();
  useEffect(() => {
    marcarAvisosVistos(seccion)
      .then((n) => n > 0 && refrescar())
      .catch(() => {});
  }, [seccion, refrescar]);
  return null;
}
