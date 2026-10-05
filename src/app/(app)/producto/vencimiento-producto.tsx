"use client";

import { useState, useTransition } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { configurarVencimiento } from "./actions";

const claseBoton = `rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`;

/**
 * El control de vencimiento de un producto: si caduca se lleva por lote y fecha de vencimiento (cada entrada pide su lote y las
 * salidas sacan primero lo que vence antes, FEFO), y se elige con cuántos días de anticipación se avisa de un lote por vencer
 * (60 si no se dice). Activarlo exige que el producto no tenga stock sin lote; desactivarlo, que ningún lote tenga unidades.
 */
export function VencimientoProducto({
  id,
  maneja,
  diasAviso,
  puedeEscribir,
}: {
  id: string;
  maneja: boolean;
  diasAviso: number | null;
  puedeEscribir: boolean;
}) {
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dias, setDias] = useState<string | null>(null); // null = mostrar el guardado
  const valorDias = dias ?? (diasAviso !== null ? String(diasAviso) : "");
  const cambioDias = maneja && valorDias !== (diasAviso !== null ? String(diasAviso) : "");

  function aplicar(nuevoManeja: boolean, nuevosDias: string) {
    setError(null);
    start(async () => {
      const n = nuevosDias.trim() === "" ? null : Number(nuevosDias);
      const r = await configurarVencimiento(id, nuevoManeja, n);
      if (r.error) setError(r.error);
      else {
        setDias(null);
        mostrarToast(nuevoManeja ? "Vencimiento guardado" : "Vencimiento desactivado");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="m-0">{maneja ? `Se controla por lote. Avisa ${diasAviso ?? 60} días antes de que venza un lote.` : "No se controla el vencimiento."}</p>
      {puedeEscribir && (
        <div className="flex flex-col gap-2">
          {maneja && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Avisar con cuántos días de anticipación</span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  inputMode="numeric"
                  value={valorDias}
                  disabled={pendiente}
                  placeholder="60"
                  onChange={(e) => setDias(e.target.value)}
                  className={`${fieldClassSm} w-28`}
                />
                {cambioDias && (
                  <button type="button" disabled={pendiente} onClick={() => aplicar(true, valorDias)} className={claseBoton}>
                    {pendiente ? "Guardando…" : "Guardar"}
                  </button>
                )}
              </div>
            </label>
          )}
          <button type="button" disabled={pendiente} onClick={() => aplicar(!maneja, valorDias)} className={`${claseBoton} w-fit`}>
            {pendiente ? "Guardando…" : maneja ? "Desactivar el vencimiento" : "Activar el vencimiento"}
          </button>
          {error && (
            <p role="alert" className="m-0 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
