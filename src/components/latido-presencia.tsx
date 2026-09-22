"use client";

import { useEffect } from "react";
import { registrarActividad } from "@/lib/presencia-actions";

const INTERVALO_MS = 20_000;

/**
 * Manda un "estoy aquí" cada 20s mientras la pestaña está visible y usable (montado una sola vez, en el
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
