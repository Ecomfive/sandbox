"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { BOTONES_FICHA, leerUsos, ordenDeBotones, type UsosBotones } from "@/lib/crm/botones-ficha";

// Cuántas veces usó esta persona cada botón de la ficha, guardado en su navegador (30 oct 2026, pedido de Jhokser): los más usados quedan a la derecha.
// No viaja a otro equipo ni se pierde nada si el navegador no deja guardar: el orden vuelve al de siempre.
const CLAVE = "crm-botones-ficha-v1";
const oyentes = new Set<() => void>();
const SIN_USOS: UsosBotones = {};
let crudo: string | null | undefined;
let usos: UsosBotones = SIN_USOS;

function leer(): UsosBotones {
  let texto: string | null = null;
  try {
    texto = window.localStorage.getItem(CLAVE);
  } catch {
    // Sin almacenamiento: sin usos.
  }
  // Mismo objeto mientras lo guardado no cambie (si no, React lo toma como un cambio sin fin).
  if (texto !== crudo) {
    crudo = texto;
    usos = leerUsos(texto);
  }
  return usos;
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  const alOtraPestana = (e: StorageEvent) => e.key === CLAVE && avisar();
  window.addEventListener("storage", alOtraPestana);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", alOtraPestana);
  };
}

function usar(id: string) {
  const nuevos = { ...leer(), [id]: Math.min((leer()[id] ?? 0) + 1, 100_000) };
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(nuevos));
  } catch {
    return;
  }
  oyentes.forEach((avisar) => avisar());
}

interface Fila {
  orden: Map<string, number>;
}
const Contexto = createContext<Fila | null>(null);

/**
 * La fila de botones de una ficha, **de derecha a izquierda**: el botón más usado en el extremo derecho y los demás hacia la izquierda según su uso. Cada
 * botón va dentro de un `ItemFila` con su id. El orden visual no cambia el del teclado (sigue el de la página).
 */
export function FilaBotones({ children, className }: { children: ReactNode; className: string }) {
  const guardados = useSyncExternalStore(suscribir, leer, () => SIN_USOS);
  const valor = useMemo<Fila>(() => ({ orden: ordenDeBotones(guardados, BOTONES_FICHA) }), [guardados]);
  return (
    <Contexto.Provider value={valor}>
      <div dir="rtl" className={className}>
        {children}
      </div>
    </Contexto.Provider>
  );
}

/** Cuántos de los más usados llevan su nombre en la barra del chat; los demás van solo con su ícono (30 oct 2026, pedido de Alcides). */
export const CON_NOMBRE = 4;

/** La posición del botón en su fila (0 = el de más a la derecha, el más usado), o `null` fuera de una `FilaBotones`. */
export function usePosicionBoton(id: string): number | null {
  const fila = useContext(Contexto);
  return fila ? (fila.orden.get(id) ?? BOTONES_FICHA.length) : null;
}

/** Un botón de la fila, con su sitio según el uso. Cada pulsación (que no esté apagada) suma uno a su cuenta. Fuera de una `FilaBotones` no hace nada. */
export function ItemFila({ id, children }: { id: string; children: ReactNode }) {
  const fila = useContext(Contexto);
  if (!fila) return <>{children}</>;
  const estilo: CSSProperties = { order: fila.orden.get(id) ?? BOTONES_FICHA.length, direction: "ltr" };
  return (
    <div style={estilo} className="flex min-w-0 [&>*]:w-full [&>*]:min-w-0" onClickCapture={() => usar(id)}>
      {children}
    </div>
  );
}
