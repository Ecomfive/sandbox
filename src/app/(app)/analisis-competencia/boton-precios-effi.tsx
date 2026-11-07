"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { textoLecturaEffi } from "@/lib/effi/resumen";
import { actualizarPreciosEffi } from "./actions";

/** Pone al día nuestros precios de Effi en el análisis por la API, al momento. Los de la competencia llegan con la lectura del catálogo. */
export function BotonPreciosEffi({ hayLlave }: { hayLlave: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        disabled={pendiente || !hayLlave}
        title={hayLlave ? undefined : "Falta la llave de Effi (EFFI_API_KEY en Vercel)"}
        onClick={() =>
          empezar(async () => {
            const r = await actualizarPreciosEffi();
            if (r.error) return mostrarToast(r.error, "destructive");
            if (r.resumen) {
              const { texto, error } = textoLecturaEffi(r.resumen);
              mostrarToast(texto, error ? "destructive" : "success");
              router.refresh();
            }
          })
        }
      >
        {pendiente ? "Leyendo Effi…" : "Actualizar nuestros precios desde Effi"}
      </Button>
      <p className="m-0 text-xs text-muted-foreground">Nuestros precios salen directo de la API de Effi. Los de la competencia llegan con la lectura del catálogo.</p>
    </div>
  );
}
