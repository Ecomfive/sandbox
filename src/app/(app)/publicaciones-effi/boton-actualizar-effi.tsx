"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { textoLecturaEffi } from "@/lib/effi/resumen";
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
          if (r.resumen) {
            // Las ventas (migración 0244) y los precios del análisis van en la misma pasada: si fallan, los artículos igual quedaron y aquí se dice por qué.
            const { texto, error } = textoLecturaEffi(r.resumen);
            mostrarToast(texto, error ? "destructive" : "success");
          }
        })
      }
    >
      {pendiente ? "Leyendo Effi…" : "Actualizar desde Effi"}
    </Button>
  );
}
