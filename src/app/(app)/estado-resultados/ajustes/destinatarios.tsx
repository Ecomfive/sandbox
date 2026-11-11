"use client";

import { useState, useTransition } from "react";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { guardarDestinatarios } from "./actions";

/** Los correos del informe mensual y los números del resumen semanal de WhatsApp (uno por línea). */
export function FormularioDestinatarios({ correos, telefonos, puedeEscribir }: { correos: string[]; telefonos: string[]; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [c, setC] = useState(correos.join("\n"));
  const [t, setT] = useState(telefonos.join("\n"));
  const [base, setBase] = useState({ c: correos.join("\n"), t: telefonos.join("\n") });
  const [pendiente, startTransition] = useTransition();
  const cambiado = c !== base.c || t !== base.t;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await guardarDestinatarios(c, t);
          if (r.error) return mostrarToast(r.error, "destructive");
          setBase({ c, t });
          mostrarToast(`Guardado: ${r.correos} correos y ${r.telefonos} números`);
        });
      }}
    >
      <fieldset disabled={!puedeEscribir || pendiente} className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Correos del informe mensual</span>
          <textarea name="correos" rows={4} value={c} onChange={(e) => setC(e.target.value)} className={fieldClass} placeholder="Ej: finanzas@ejemplo.com" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>WhatsApp del resumen semanal</span>
          <textarea name="telefonos" rows={4} value={t} onChange={(e) => setT(e.target.value)} className={fieldClass} placeholder="Ej: 50760000000" />
        </label>
      </fieldset>
      {puedeEscribir && (
        <div className="flex justify-end">
          <button type="submit" disabled={pendiente || !cambiado} className={`${claseAccionAF4} !border-foreground !bg-foreground !text-background disabled:opacity-50 ${anilloFoco}`}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
    </form>
  );
}
