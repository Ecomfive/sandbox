"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { useEstimacionEnvio } from "./estimacion-envio";

/**
 * Bajo el campo «Fecha límite»: cuándo llegaría la compra según su país, su vía (marítimo, aéreo…) y su fecha de envío, con lo
 * que tardaron los envíos anteriores de ese país por esa vía. Muestra la fecha más probable, el rango habitual y de dónde sale,
 * y un botón para ponerla como fecha límite (nunca la cambia sola). No dibuja nada hasta que hay país, vía y fecha de envío.
 */
export function PrediccionFechaLimite({ fechaLimite }: { fechaLimite: string | null }) {
  const { estimacion } = useEstimacionEnvio();
  const ref = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(fechaLimite ?? "");

  // El valor que tiene ahora el campo de fecha límite, para saber si ya es la predicción.
  useEffect(() => {
    const campo = ref.current?.closest("form")?.querySelector<HTMLInputElement>('input[name="fecha_limite"]');
    if (!campo) return;
    const leer = () => setActual(campo.value);
    leer();
    campo.addEventListener("input", leer);
    campo.addEventListener("change", leer);
    return () => {
      campo.removeEventListener("input", leer);
      campo.removeEventListener("change", leer);
    };
  }, []);

  function usar() {
    const campo = ref.current?.closest("form")?.querySelector<HTMLInputElement>('input[name="fecha_limite"]');
    if (!campo || !estimacion) return;
    // Con el setter nativo y un evento «input» el formulario se entera del cambio (enciende «Guardar cambios»).
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(campo, estimacion.llegadaEstimada);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return (
    <div ref={ref} role="status" aria-live="polite">
      {estimacion && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs">
          <span>
            Predicción: <b className="font-semibold tabular-nums">{formatearFecha(estimacion.llegadaEstimada)}</b>
          </span>
          {estimacion.rango && (
            <span className="text-muted-foreground tabular-nums">
              entre {formatearFecha(estimacion.rango.desde)} y {formatearFecha(estimacion.rango.hasta)}
            </span>
          )}
          {actual === estimacion.llegadaEstimada ? (
            <span className="font-medium text-success">Ya es la fecha límite</span>
          ) : (
            <button type="button" onClick={usar} className={`h-7 rounded-md border border-border-control bg-card px-2 font-medium hover:bg-accent ${anilloFoco}`}>
              Usar como fecha límite
            </button>
          )}
          <span className="basis-full text-muted-foreground">{estimacion.explicacion}</span>
        </div>
      )}
    </div>
  );
}
