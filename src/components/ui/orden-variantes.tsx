"use client";

import { useSyncExternalStore } from "react";
import { FlechaAbajoIcon, FlechaArribaIcon } from "@/lib/nav-icons";
import { anilloFoco } from "./field";
import { Tooltip } from "./tooltip";

const CLAVE = "orden-variantes-v1";
const oyentes = new Set<() => void>();

const leer = () => {
  try {
    return localStorage.getItem(CLAVE) === "desc";
  } catch {
    return false;
  }
};

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  window.addEventListener("storage", avisar);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

/**
 * Si las variantes se ven en orden descendente (13 nov 2026, pedido de Jhokser): lo elige cada persona, vale para Stock, Levantamiento y Producto y se recuerda en su navegador
 * (`orden-variantes-v1`). Sin lo guardado, ascendente.
 */
export function useOrdenVariantes(): { descendente: boolean; invertir: () => void } {
  const descendente = useSyncExternalStore(suscribir, leer, () => false);
  const invertir = () => {
    try {
      localStorage.setItem(CLAVE, descendente ? "asc" : "desc");
    } catch {
      // Sin almacenamiento el orden no se recuerda, pero la lista se vuelve a dibujar igual.
    }
    oyentes.forEach((avisar) => avisar());
  };
  return { descendente, invertir };
}

/** Un botón pequeño, solo ícono, que invierte el orden de las variantes (la flecha dice cuál es el orden de ahora). */
export function BotonOrdenVariantes({ className = "" }: { className?: string }) {
  const { descendente, invertir } = useOrdenVariantes();
  const Icono = descendente ? FlechaAbajoIcon : FlechaArribaIcon;
  return (
    <Tooltip texto={descendente ? "Orden ascendente" : "Orden descendente"}>
      <button
        type="button"
        onClick={invertir}
        aria-label={`Variantes en orden ${descendente ? "descendente" : "ascendente"}: pulsar para ${descendente ? "ordenarlas ascendente" : "ordenarlas descendente"}`}
        className={`inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco} ${className}`}
      >
        <Icono aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}
