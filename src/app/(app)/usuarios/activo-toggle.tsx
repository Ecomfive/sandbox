"use client";

import { useTransition } from "react";
import { cambiarActivoUsuario } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";

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
        className="disabled:opacity-50"
      >
        <Badge tone={activo ? "success" : "neutral"}>{estado}</Badge>
      </button>
    </Tooltip>
  );
}
