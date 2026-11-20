"use client";

import { useEffect } from "react";

/**
 * Evita que la rueda del mouse cambie el valor de un campo numérico (20 nov 2026: en «Nueva remisión» un 40 quedó en 38 porque la persona bajaba la lista con la rueda con el cursor sobre la cantidad). El navegador
 * sube o baja el número de un campo enfocado al girar la rueda encima; aquí, si la rueda gira sobre el campo numérico enfocado, se le quita el foco antes de que cambie y la página sigue desplazándose normal.
 * Una sola vez para todo el sistema (va en el layout raíz).
 */
export function SinRuedaEnNumeros() {
  useEffect(() => {
    const alGirar = (e: WheelEvent) => {
      const activo = document.activeElement;
      if (activo instanceof HTMLInputElement && activo.type === "number" && e.target === activo) activo.blur();
    };
    document.addEventListener("wheel", alGirar, { capture: true, passive: true });
    return () => document.removeEventListener("wheel", alGirar, { capture: true });
  }, []);
  return null;
}
