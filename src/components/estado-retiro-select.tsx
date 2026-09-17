"use client";

import { useTransition } from "react";
import { actualizarEstadoRetiro } from "@/app/retiros/actions";
import { fieldClassSm } from "@/components/ui/field";

const ESTADOS = ["solicitado", "procesado", "rechazado"] as const;

export function EstadoRetiroSelect({ id, estadoActual }: { id: string; estadoActual: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      className={`${fieldClassSm} disabled:opacity-50`}
      defaultValue={estadoActual}
      disabled={pending}
      onChange={(e) => {
        const formData = new FormData();
        formData.set("id", id);
        formData.set("estado", e.target.value);
        startTransition(() => {
          actualizarEstadoRetiro(formData);
        });
      }}
    >
      {ESTADOS.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  );
}
