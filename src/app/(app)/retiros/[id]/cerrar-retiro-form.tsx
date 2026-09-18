"use client";

import { cerrarRetiro } from "../actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { formatearMoneda } from "@/lib/formato";
import { FormularioConToast } from "@/components/ui/toast";

export function CerrarRetiroForm({
  retiroId,
  paisId,
  codigoPais,
  soporteActual,
  montoRecibidoActual,
}: {
  retiroId: string;
  paisId: string;
  codigoPais: string;
  soporteActual: string | null;
  montoRecibidoActual: number | null;
}) {
  return (
    <FormularioConToast
      action={cerrarRetiro}
      mensajeExito={(resultado) =>
        resultado.conDiscrepancia
          ? {
              mensaje: `Novedad: diferencia de ${formatearMoneda(resultado.diferencia, codigoPais)}`,
              tono: "destructive" as const,
            }
          : { mensaje: "Retiro cerrado" }
      }
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="id" value={retiroId} />
      <input type="hidden" name="pais_id" value={paisId} />
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>ID de soporte bancario</label>
          <input
            type="text"
            name="soporte_numero"
            defaultValue={soporteActual ?? ""}
            className={`${fieldClass} w-48`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Monto recibido</label>
          <input
            type="number"
            step="0.01"
            min="0"
            name="monto_recibido"
            required
            defaultValue={montoRecibidoActual ?? ""}
            className={`${fieldClass} w-40 tabular-nums`}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Comprobante (foto o archivo)</label>
        <input type="file" name="comprobante" accept="image/*,application/pdf" className="text-sm" />
      </div>
      <div>
        <Button type="submit">Cerrar retiro</Button>
      </div>
    </FormularioConToast>
  );
}
