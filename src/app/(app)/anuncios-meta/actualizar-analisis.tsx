"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { actualizarAnalisisMeta } from "./actions";

const fecha = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

/**
 * «Actualizar el análisis ahora» (24 nov 2026, pedido de Alcides: poder ver cómo quedan los datos sin esperar al análisis diario): hace lo mismo que el sistema cada día, ya. Dice cuándo se hizo el último y, al terminar, qué se renovó.
 * Solo para quien puede modificar el módulo (gasta crédito de IA y tarda uno o dos minutos).
 */
export function ActualizarAnalisis({ generadoEn, escribe }: { generadoEn: string | null; escribe: boolean }) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const [resultado, setResultado] = useState<{ error?: string; mensaje?: string } | null>(null);

  const actualizar = async () => {
    setResultado(null);
    setTerminado(false);
    setTrabajando(true);
    const r = await actualizarAnalisisMeta().catch(() => ({ error: "No se pudo actualizar el análisis (¿tardó demasiado?). Inténtalo de nuevo en unos minutos." }));
    setTerminado(true);
    setResultado(r);
    setTimeout(() => {
      setTrabajando(false);
      if (!r.error) router.refresh();
    }, 900);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5">
      <p className="m-0 text-xs text-muted-foreground">
        {generadoEn ? <>Análisis del historial hecho el <span className="font-medium text-foreground">{fecha(generadoEn)}</span> (se renueva solo cada día).</> : "El análisis del historial todavía no se ha hecho: se prepara solo, o puedes hacerlo ahora."}
      </p>
      {escribe && !trabajando && (
        <button type="button" onClick={actualizar} className="min-h-9 rounded-md bg-foreground px-3.5 text-xs font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2">
          Actualizar el análisis ahora
        </button>
      )}
      {trabajando && (
        <div className="w-full">
          <ProgresoEstimado
            etiqueta="Actualizando el análisis"
            terminado={terminado}
            estimadoMs={110_000}
            pasos={["Calculando todo el historial", "Evaluando lo que vigilas", "Investigando por qué no se entregan los productos", "Mirando creativos, inventario, precios y competencia", "Interpretando con la IA"]}
          />
        </div>
      )}
      {resultado && !trabajando && (
        <p className={`m-0 w-full text-xs ${resultado.error ? "text-destructive" : "text-muted-foreground"}`} role={resultado.error ? "alert" : "status"}>
          {resultado.error ?? resultado.mensaje}
        </p>
      )}
    </div>
  );
}
