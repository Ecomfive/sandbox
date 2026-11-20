"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { usarComprasComoCosto } from "./actions";

/** «Usar como costo oficial»: pasa el costo puesto de las compras que llegaron a Costos de mercancía (mejoras 31 y 37). */
export function UsarComoCosto() {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        empezar(async () => {
          const r = await usarComprasComoCosto().catch(() => ({ error: "Se cortó la conexión." }));
          if ("error" in r) mostrarToast(r.error, "destructive");
          else {
            mostrarToast(`${r.lotes} lotes en Costos de mercancía${r.quitados ? ` · ${r.quitados} quitados` : ""}`);
            router.refresh();
          }
        })
      }
      className={`inline-flex h-8 items-center rounded-md bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
    >
      {pendiente ? "Llevando…" : "Usar como costo oficial"}
    </button>
  );
}
