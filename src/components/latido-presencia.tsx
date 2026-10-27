"use client";

import { useEffect } from "react";
import { registrarActividad } from "@/lib/presencia-actions";

// Cada 60 s (rendimiento, 27 oct 2026: antes 20 s, una escritura en la base cada 20 s por persona con la app abierta).
const INTERVALO_MS = 60_000;
/** Sin tocar el mouse ni el teclado más de esto, el minuto no cuenta como trabajado (Equipo › Rendimiento). */
const SIN_USO_MS = 5 * 60_000;
const EVENTOS_USO = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;

/**
 * Manda un "estoy aquí" cada 60s mientras la pestaña está visible y usable (montado una sola vez, en el
 * layout de toda la app con sesión). No manda nada con la pestaña en segundo plano ni minimizada: así, si
 * alguien la deja abierta sin usarla, `EstadoPresencia` la deja de ver "Activo" a los pocos segundos.
 * Con el aviso va la página en que está y si se está usando (mouse o teclado en los últimos 5 minutos): con eso
 * Equipo › Rendimiento arma la jornada de cada persona. Sin interfaz: es puro efecto secundario.
 */
export function LatidoPresencia() {
  useEffect(() => {
    let ultimoUso = Date.now();
    const usar = () => {
      ultimoUso = Date.now();
    };
    function latir() {
      if (document.visibilityState !== "visible") return;
      void registrarActividad(window.location.pathname, Date.now() - ultimoUso < SIN_USO_MS);
    }
    latir();
    const id = setInterval(latir, INTERVALO_MS);
    document.addEventListener("visibilitychange", latir);
    for (const e of EVENTOS_USO) window.addEventListener(e, usar, { passive: true, capture: true });
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", latir);
      for (const e of EVENTOS_USO) window.removeEventListener(e, usar, { capture: true });
    };
  }, []);

  return null;
}
