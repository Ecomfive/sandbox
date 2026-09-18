"use client";

import { useTransition } from "react";
import { alternarActivaCuenta } from "./actions";
import { Badge } from "@/components/ui/badge";

export function ActivaToggle({ id, activa }: { id: string; activa: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
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
      className="disabled:opacity-50"
      title={activa ? "Clic para desactivar" : "Clic para reactivar"}
    >
      <Badge tone={activa ? "success" : "neutral"}>{activa ? "Activa" : "Inactiva"}</Badge>
    </button>
  );
}
