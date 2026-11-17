"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { pendientesPersonales } from "@/lib/pendientes-vivos-actions";
import { CADA_PENDIENTES_MS, type PendientesPersonales } from "@/lib/pendientes-vivos";

interface Vivos {
  vivos: PendientesPersonales | null;
  /** Vuelve a preguntar ya (por ejemplo, cuando acaba de salir una tarjeta de aviso). */
  refrescar: () => void;
}

const Contexto = createContext<Vivos>({ vivos: null, refrescar: () => {} });

/**
 * Mantiene al día los números personales del menú (17 nov 2026, pedido de Hernán): cada 30 segundos, con la pestaña a la vista y al volver a ella, pregunta cuántos avisos «Para ti» y tareas sin
 * cerrar tiene la persona. El primer número es el de la página (sin pregunta de más); lo que se lee después lo pone `conPendientesVivos` sobre él.
 */
export function ProveedorPendientesVivos({ children }: { children: ReactNode }) {
  const [vivos, setVivos] = useState<PendientesPersonales | null>(null);
  const refrescar = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    pendientesPersonales()
      .then((r) => r && setVivos(r))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const t = setInterval(refrescar, CADA_PENDIENTES_MS);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [refrescar]);
  const valor = useMemo(() => ({ vivos, refrescar }), [vivos, refrescar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Lo personal leído en vivo (null hasta la primera lectura) y cómo pedir otra lectura. */
export const usePendientesVivos = () => useContext(Contexto);
