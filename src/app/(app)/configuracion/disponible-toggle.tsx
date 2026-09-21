"use client";

import { useTransition } from "react";
import { alternarDisponiblePlataforma } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { anilloFoco } from "@/components/ui/field";

export function DisponibleToggle({ id, disponible }: { id: string; disponible: boolean }) {
  const [pending, startTransition] = useTransition();

  const estado = disponible ? "Disponible" : "Oculta";
  const accion = disponible ? "Quitar de «+ Crear»" : "Agregar a «+ Crear»";

  return (
    <Tooltip texto={accion}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set("id", id);
          formData.set("disponible", String(!disponible));
          startTransition(() => {
            alternarDisponiblePlataforma(formData);
          });
        }}
        aria-label={`${estado}. ${accion}`}
        // El botón mide 24 px de alto (la insignia sola, 20): objetivo mínimo de WCAG 2.5.8.
        className={`inline-flex min-h-6 items-center rounded-full disabled:opacity-50 ${anilloFoco}`}
      >
        <Badge tone={disponible ? "success" : "neutral"}>{estado}</Badge>
      </button>
    </Tooltip>
  );
}
