"use client";

import { useTransition } from "react";
import { cambiarActivoUsuario } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { anilloFoco } from "@/components/ui/field";

export function ActivoToggle({ perfilId, activo }: { perfilId: string; activo: boolean }) {
  const [pending, startTransition] = useTransition();

  const estado = activo ? "Activo" : "Inactivo";
  const accion = activo ? "Desactivar usuario" : "Reactivar usuario";

  return (
    <Tooltip texto={accion}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set("id", perfilId);
          formData.set("activo", String(!activo));
          startTransition(() => {
            cambiarActivoUsuario(formData);
          });
        }}
        aria-label={`${estado}. ${accion}`}
        // El botón mide 24 px de alto (la insignia sola, 20): objetivo mínimo de WCAG 2.5.8.
        className={`inline-flex min-h-6 items-center rounded-full disabled:opacity-50 ${anilloFoco}`}
      >
        <Badge tone={activo ? "success" : "neutral"}>{estado}</Badge>
      </button>
    </Tooltip>
  );
}
