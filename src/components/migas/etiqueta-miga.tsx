"use client";

import { useEffect, useSyncExternalStore } from "react";

// Nombre del registro que muestra la página de detalle ("Retiro #0009"). Vive fuera de React para
// que la página lo ponga sin re-renderizar el layout entero, y se borra al salir de la página.
const oyentes = new Set<() => void>();
let etiquetaActual: string | null = null;

function fijar(etiqueta: string | null) {
  etiquetaActual = etiqueta;
  oyentes.forEach((avisar) => avisar());
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

export function useEtiquetaMiga(): string | null {
  return useSyncExternalStore(suscribir, () => etiquetaActual, () => null);
}

/** Las páginas de detalle la renderizan para que la última miga diga su nombre en vez de "Detalle". */
export function EtiquetaMiga({ texto }: { texto: string }) {
  useEffect(() => {
    fijar(texto);
    return () => fijar(null);
  }, [texto]);
  return null;
}
