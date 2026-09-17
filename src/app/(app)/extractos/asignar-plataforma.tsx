"use client";

import { useTransition } from "react";
import { asignarPlataforma } from "./actions";
import { fieldClassSm } from "@/components/ui/field";

interface Plataforma {
  id: string;
  nombre: string;
}

export function AsignarPlataformaSelect({
  movimientoId,
  plataformaIdActual,
  plataformas,
}: {
  movimientoId: string;
  plataformaIdActual: string | null;
  plataformas: Plataforma[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      className={`${fieldClassSm} disabled:opacity-50`}
      defaultValue={plataformaIdActual ?? ""}
      disabled={pending}
      onChange={(e) => {
        const valor = e.target.value;
        startTransition(async () => {
          await asignarPlataforma(movimientoId, valor);
        });
      }}
    >
      <option value="">Sin asignar</option>
      {plataformas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nombre}
        </option>
      ))}
    </select>
  );
}
