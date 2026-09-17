"use client";

import { useTransition } from "react";
import { cambiarActivoUsuario } from "./actions";
import { Badge } from "@/components/ui/badge";

export function ActivoToggle({ perfilId, activo }: { perfilId: string; activo: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
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
      className="disabled:opacity-50"
      title={activo ? "Clic para desactivar" : "Clic para reactivar"}
    >
      <Badge tone={activo ? "success" : "neutral"}>{activo ? "Activo" : "Inactivo"}</Badge>
    </button>
  );
}
