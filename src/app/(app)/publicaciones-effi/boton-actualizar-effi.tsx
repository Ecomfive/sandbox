"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { actualizarDesdeEffi } from "./actions";

/** Lee Effi en el momento, sin esperar la lectura diaria. Solo consulta Effi y guarda aquí. */
export function BotonActualizarEffi({ hayLlave }: { hayLlave: boolean }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pendiente || !hayLlave}
      title={hayLlave ? undefined : "Falta la llave de Effi (EFFI_API_KEY en Vercel)"}
      onClick={() =>
        empezar(async () => {
          const r = await actualizarDesdeEffi();
          if (r.error) return mostrarToast(r.error, "destructive");
          if (r.resumen) mostrarToast(`Effi leído: ${r.resumen.articulos} artículos, ${r.resumen.nuevos} nuevos, ${r.resumen.yaNoEstan} ya no aparecen.`, "success");
        })
      }
    >
      {pendiente ? "Leyendo Effi…" : "Actualizar desde Effi"}
    </Button>
  );
}
