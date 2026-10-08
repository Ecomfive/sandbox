"use client";

import { useEffect, useRef, useState } from "react";
import { labelClassSm } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import type { Estimacion } from "@/lib/compras/planificacion";
import { estimarPlanificacionCompra } from "./actions";
import { conEmoji } from "./def-compras";

/**
 * La planificación en la ficha de una compra: no se escribe, se calcula sola con la fecha de envío, la vía y el país del mismo
 * formulario (lo que tardaron los envíos anteriores de ese país por esa vía). Se vuelve a calcular al cambiar cualquiera de
 * ellos; lo que se guarda lo calcula otra vez el servidor. Sin fecha de envío se ve la que tenía (las de ClickUp).
 */
export function PlanificacionAutomatica({ planificacion, fechaEnvio }: { planificacion: string | null; fechaEnvio: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [estimacion, setEstimacion] = useState<Estimacion | null>(null);
  const [sinFecha, setSinFecha] = useState(!fechaEnvio);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    let vuelta = 0;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const calcular = () => {
      const datos = new FormData(form);
      const fecha = String(datos.get("fecha_envio") ?? "");
      const tipo = String(datos.get("tipo") ?? "pais");
      const pais = String(datos.get("pais") ?? "");
      const vias = datos.getAll("via_envio").map(String);
      const esta = ++vuelta;
      setSinFecha(!fecha);
      if (!fecha || (tipo !== "importacion" && !pais)) {
        setEstimacion(null);
        return;
      }
      setCalculando(true);
      estimarPlanificacionCompra(tipo, pais, vias, fecha)
        .then((e) => esta === vuelta && setEstimacion(e))
        .catch(() => esta === vuelta && setEstimacion(null))
        .finally(() => esta === vuelta && setCalculando(false));
    };
    const alCambiar = (e: Event) => {
      const nombre = (e.target as HTMLInputElement | null)?.name;
      if (nombre !== "fecha_envio" && nombre !== "via_envio" && nombre !== "pais" && nombre !== "tipo") return;
      clearTimeout(espera);
      espera = setTimeout(calcular, 250);
    };
    calcular();
    form.addEventListener("change", alCambiar);
    return () => {
      clearTimeout(espera);
      form.removeEventListener("change", alCambiar);
    };
  }, []);

  // Una compra que nunca tuvo fecha de envío conserva la planificación que traía; si se le quita la fecha, queda sin ella.
  const valor = estimacion?.planificacion ?? (sinFecha && !fechaEnvio ? planificacion : null);

  return (
    <div ref={ref} className="flex min-w-0 flex-col gap-1">
      <span className={labelClassSm}>{conEmoji("planificacion", "Planificación")}</span>
      <output aria-live="polite" className="flex min-h-9 flex-col justify-center rounded-md border border-dashed border-border-control px-3 py-1.5 text-sm">
        <span className={valor ? "font-medium" : "text-muted-foreground"}>{calculando && !valor ? "Calculando…" : (valor ?? "Con la fecha de envío")}</span>
        {estimacion && (
          <span className="text-xs text-muted-foreground">
            Llega ~{formatearFecha(estimacion.llegadaEstimada)} · {estimacion.explicacion}
          </span>
        )}
      </output>
    </div>
  );
}
