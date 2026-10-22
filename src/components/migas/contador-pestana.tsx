"use client";

import { useEffect, useSyncExternalStore } from "react";

// El globo con lo pendiente de una pestaña del módulo («Recomendaciones 3»), como el de la campana de notificaciones. Vive fuera de
// React, como la etiqueta de las migas, para que la página lo ponga sin re-renderizar el layout, y se queda mientras se navega entre
// las pestañas del módulo: así no parpadea al pasar de una a otra.
const oyentes = new Set<() => void>();
let contadores: Record<string, number> = {};

function fijar(href: string, cantidad: number) {
  if (contadores[href] === cantidad) return;
  contadores = { ...contadores, [href]: cantidad };
  oyentes.forEach((avisar) => avisar());
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

/** En el servidor no hay contadores. Tiene que ser siempre el mismo objeto: si cada lectura devolviera uno nuevo (`() => ({})`), React
 * lo toma como un cambio sin fin al hidratar y la página se queda cargando. */
const SIN_CONTADORES: Record<string, number> = {};

/** Lo pendiente de cada pestaña (por su `href`) que alguna página ya dijo; la franja de pestañas lo dibuja. */
export function useContadoresPestanas(): Record<string, number> {
  return useSyncExternalStore(suscribir, () => contadores, () => SIN_CONTADORES);
}

/**
 * Una página la renderiza para que la pestaña `href` de su módulo lleve el globo con `cantidad` (sin globo si es 0). Si la página no
 * tiene el número a mano (la pestaña «Reglas» no carga las publicaciones), pasa `cargar`, una acción del servidor que lo trae, y solo
 * se llama si todavía no hay un número de otra página.
 */
export function ContadorPestana({ href, cantidad, cargar }: { href: string; cantidad?: number; cargar?: () => Promise<number | null> }) {
  useEffect(() => {
    if (cantidad !== undefined) fijar(href, cantidad);
    else if (cargar && contadores[href] === undefined) {
      let vigente = true;
      cargar()
        .then((n) => vigente && n !== null && fijar(href, n))
        .catch(() => {});
      return () => {
        vigente = false;
      };
    }
  }, [href, cantidad, cargar]);
  return null;
}
