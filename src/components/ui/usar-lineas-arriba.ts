"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

/**
 * Para las pantallas donde se arma una lista de productos con su cantidad (Nueva remisión, Agregar productos a una remisión, Nuevo traslado): el producto que se elige entra **arriba de la lista, pegado al buscador**,
 * el cursor queda en su cantidad y, con Enter, vuelve al buscador para el siguiente (21 nov 2026, pedido de Jhokser: en una remisión larga el producto nuevo caía al final y había que bajar a ponerle la cantidad y
 * subir a buscar el siguiente). Uso: `buscador` va en el contenedor del campo de búsqueda, cada línea lleva `data-linea={id}`, el campo de unidades `onKeyDown={volverAlBuscador}` y, al agregar, `enfocarCantidadDe(id)`.
 */
export function useLineasArriba(lineas: unknown) {
  const buscador = useRef<HTMLDivElement>(null);
  const pendiente = useRef<string | null>(null);

  // Cuando la lista ya cambió, el cursor pasa al primer campo de la línea nueva (su cantidad).
  useEffect(() => {
    const id = pendiente.current;
    if (!id) return;
    pendiente.current = null;
    const campo = Array.from(document.querySelectorAll<HTMLElement>("[data-linea]"))
      .find((li) => li.dataset.linea === id)
      ?.querySelector<HTMLInputElement>("input");
    campo?.focus();
    campo?.select();
  }, [lineas]);

  return {
    buscador,
    enfocarCantidadDe: (id: string) => {
      pendiente.current = id;
    },
    /** Enter en la cantidad: no envía el formulario, vuelve al buscador. */
    volverAlBuscador: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      buscador.current?.querySelector<HTMLInputElement>("input")?.focus();
    },
  };
}
