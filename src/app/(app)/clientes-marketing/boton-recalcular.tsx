"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { useToast } from "@/components/ui/toast";
import { entero } from "@/lib/af4/formato";
import { recalcularClientesAccion } from "./actions";

const PASOS = ["Leyendo las órdenes", "Normalizando teléfonos", "Agrupando clientes", "Guardando", "Calculando totales"];

/** «Recalcular clientes»: rearma la identidad de cliente desde las órdenes. Se puede repetir: deja lo mismo. */
export function BotonRecalcular({ pendientes }: { pendientes: number }) {
  const [pendiente, iniciar] = useTransition();
  const [terminado, setTerminado] = useState(false);
  const { mostrarToast } = useToast();
  const router = useRouter();

  function recalcular() {
    setTerminado(false);
    iniciar(async () => {
      const r = await recalcularClientesAccion();
      if ("error" in r) {
        mostrarToast(r.error, "destructive");
        return;
      }
      setTerminado(true);
      setTimeout(() => setTerminado(false), 2500);
      mostrarToast(`${entero(r.clientes)} clientes de ${entero(r.ordenes)} órdenes.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" variant={pendientes > 0 ? "primary" : "secondary"} onClick={recalcular} disabled={pendiente}>
        {pendiente ? "Recalculando…" : pendientes > 0 ? `Recalcular clientes (${entero(pendientes)} órdenes nuevas)` : "Recalcular clientes"}
      </Button>
      {(pendiente || terminado) && (
        <div className="w-72 max-w-full">
          <ProgresoEstimado pasos={PASOS} estimadoMs={25000} terminado={terminado && !pendiente} compacta etiqueta="Avance del recálculo" />
        </div>
      )}
    </div>
  );
}
