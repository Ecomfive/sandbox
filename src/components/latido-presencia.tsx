"use client";

import { useEffect } from "react";
import { registrarActividad } from "@/lib/presencia-actions";

// Cada 60 s (rendimiento, 27 oct 2026: antes 20 s, una escritura en la base cada 20 s por persona con la app abierta).
const INTERVALO_MS = 60_000;

/**
 * Manda un "estoy aquí" cada 60s mientras la pestaña está visible y usable (montado una sola vez, en el
 * layout de toda la app con sesión). No manda nada con la pestaña en segundo plano ni minimizada: así, si
 * alguien la deja abierta sin usarla, `EstadoPresencia` la deja de ver "Activo" a los pocos segundos.
 * Sin interfaz: es puro efecto secundario.
 */
export function LatidoPresencia() {
  useEffect(() => {
    function latir() {
      if (document.visibilityState === "visible") void registrarActividad();
    }
    latir();
    const id = setInterval(latir, INTERVALO_MS);
    document.addEventListener("visibilitychange", latir);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", latir);
    };
  }, []);

  return null;
}
