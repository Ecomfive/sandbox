"use client";

import { useTransition } from "react";
import { alternarActivaCuenta } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";

export function ActivaToggle({ id, activa }: { id: string; activa: boolean }) {
  const [pending, startTransition] = useTransition();

  const estado = activa ? "Activa" : "Inactiva";
  const accion = activa ? "Desactivar cuenta" : "Reactivar cuenta";

  return (
    <Tooltip texto={accion}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set("id", id);
          formData.set("activa", String(!activa));
          startTransition(() => {
            alternarActivaCuenta(formData);
          });
        }}
        aria-label={`${estado}. ${accion}`}
        className="disabled:opacity-50"
      >
        <Badge tone={activa ? "success" : "neutral"}>{estado}</Badge>
      </button>
    </Tooltip>
  );
}
