"use client";

import { useEffect, useState } from "react";
import { formatearTiempoRelativo } from "@/lib/formato";

/** Si el último latido fue hace menos de esto, se considera "Activo ahora" — dos latidos de
 * `LatidoPresencia` (cada 20s) sin respuesta antes de pasar a "Última conexión". */
const UMBRAL_ACTIVO_MS = 45_000;

/**
 * "Activo" en verde si la persona tiene un latido reciente (`ultimaActividadEn`, ver `LatidoPresencia`), o
 * "Última conexión hace X" con el tiempo corriendo si no. Se calcula en el cliente, no al momento en que se
 * cargó la página: por eso el estado inicial es "no activo" (lo mismo que vería el servidor) y se corrige
 * apenas monta, para no romper la hidratación con la hora exacta del navegador.
 */
export function EstadoPresencia({
  ultimaActividadEn,
  ultimoIngresoEn,
}: {
  ultimaActividadEn: string | null;
  ultimoIngresoEn: string | null;
}) {
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    function calcular() {
      setActivo(!!ultimaActividadEn && Date.now() - new Date(ultimaActividadEn).getTime() < UMBRAL_ACTIVO_MS);
    }
    calcular();
    const id = setInterval(calcular, 5_000);
    return () => clearInterval(id);
  }, [ultimaActividadEn]);

  if (activo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
        Activo
      </span>
    );
  }

  const ultimaConexion = ultimaActividadEn ?? ultimoIngresoEn;
  if (!ultimaConexion) return <span className="text-xs text-warning">Nunca entró</span>;
  return <span className="text-xs text-muted-foreground">Última conexión {formatearTiempoRelativo(ultimaConexion)}</span>;
}
