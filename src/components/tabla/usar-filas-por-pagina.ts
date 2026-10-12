"use client";

import { useCallback, useSyncExternalStore } from "react";
import { leerFilasPorPagina, type FilasPorPagina } from "@/lib/tabla/filas-por-pagina";

const CLAVE = "tabla-filas-por-pagina-v1";
const EVENTO = "tabla-filas-por-pagina-cambio";

function leer(): FilasPorPagina | null {
  try {
    return leerFilasPorPagina(window.localStorage.getItem(CLAVE));
  } catch {
    return null;
  }
}

function suscribir(avisar: () => void) {
  // «storage» avisa de lo que se cambió en otra pestaña; el evento propio, de lo que se cambió en esta.
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO, avisar);
  };
}

/**
 * Cuántas filas por página eligió la persona (`null` si no ha elegido: cada tabla usa la suya). Se guarda en su navegador y
 * vale para todas las tablas, así que al cambiarlo en una cambian todas las que estén a la vista.
 */
export function useFilasPorPagina(): [FilasPorPagina | null, (nuevo: FilasPorPagina) => void] {
  const elegido = useSyncExternalStore(suscribir, leer, () => null);
  const cambiar = useCallback((nuevo: FilasPorPagina) => {
    try {
      window.localStorage.setItem(CLAVE, String(nuevo));
    } catch {
      /* sin almacenamiento (ventana privada): no se puede recordar la elección */
    }
    window.dispatchEvent(new Event(EVENTO));
  }, []);
  return [elegido, cambiar];
}
