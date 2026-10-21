"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Estimacion } from "@/lib/compras/planificacion";
import { estimarPlanificacionCompra } from "./actions";

interface Valor {
  estimacion: Estimacion | null;
  /** El formulario no tiene fecha de envío (ni pone país). */
  sinFecha: boolean;
  calculando: boolean;
}

const Contexto = createContext<Valor>({ estimacion: null, sinFecha: true, calculando: false });

/** Lo que tardaría esta compra, calculado con lo que ya hay en el formulario (para la planificación y la predicción de la fecha límite). */
export const useEstimacionEnvio = () => useContext(Contexto);

/**
 * Calcula UNA vez, con la fecha de envío, la vía y el país del formulario que lo contiene, cuánto tardaría la compra (lo que
 * tardaron los envíos anteriores de ese país por esa vía) y se lo da a quien lo pida: la planificación y la predicción de la
 * fecha límite. Se vuelve a calcular al cambiar cualquiera de esos datos; lo que se guarda lo calcula otra vez el servidor.
 */
export function EstimacionEnvio({ fechaEnvio, children }: { fechaEnvio: string | null; children: ReactNode }) {
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

  return (
    <Contexto.Provider value={{ estimacion, sinFecha, calculando }}>
      <div ref={ref} className="contents">
        {children}
      </div>
    </Contexto.Provider>
  );
}
