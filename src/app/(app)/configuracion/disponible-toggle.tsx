"use client";

import { useTransition } from "react";
import { alternarDisponiblePlataforma } from "./actions";
import { Badge } from "@/components/ui/badge";

export function DisponibleToggle({ id, disponible }: { id: string; disponible: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
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
      className="disabled:opacity-50"
      title={disponible ? "Clic para quitarla de \"+ Crear\"" : "Clic para agregarla a \"+ Crear\""}
    >
      <Badge tone={disponible ? "success" : "neutral"}>{disponible ? "Disponible" : "Oculta"}</Badge>
    </button>
  );
}
