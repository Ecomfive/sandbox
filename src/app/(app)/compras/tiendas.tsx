"use client";

import { createContext, useContext } from "react";
import { textoLegibleSobre } from "@/components/ui/badge";
import { COLORES_ETIQUETA } from "./selector-etiquetas";

/**
 * Las tiendas de Compras, como las etiquetas: cada una con su color (elegido a mano o, si no, uno automático por su nombre) y
 * su nombre, que se puede cambiar en todas las compras a la vez. La lista (`TablaCompras`) lo pone a disposición de la
 * columna, la ficha, la compra nueva y la barra de varias compras, sin pasarlo campo por campo.
 */
export interface GestionTiendas {
  colorDe: (nombre: string) => string;
  cambiarColor: (nombre: string, color: string) => void;
  /** Cambia el nombre en todas las compras; devuelve si se pudo. */
  renombrar: (antes: string, despues: string) => Promise<boolean>;
}

const Contexto = createContext<GestionTiendas | null>(null);
export const ProveedorTiendas = Contexto.Provider;
export const useTiendas = () => useContext(Contexto);

/** El color automático de una tienda sin color elegido: siempre el mismo para el mismo nombre. */
export function colorTiendaAutomatico(nombre: string) {
  let h = 0;
  for (const ch of nombre.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORES_ETIQUETA[h % (COLORES_ETIQUETA.length - 1)];
}

/** Una tienda como pastilla de su color (sin mayúsculas: es un nombre propio). */
export function PastillaTienda({ nombre }: { nombre: string }) {
  const color = useTiendas()?.colorDe(nombre) ?? colorTiendaAutomatico(nombre);
  return (
    <span style={{ backgroundColor: color, color: textoLegibleSobre(color) }} className="inline-flex max-w-full shrink-0 items-center truncate rounded-full px-2 py-px text-xs font-medium whitespace-nowrap">
      {nombre}
    </span>
  );
}
