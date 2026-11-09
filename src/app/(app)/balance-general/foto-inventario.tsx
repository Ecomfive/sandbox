"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import { guardarFotoInventario } from "./actions";

/** Guarda el inventario valorizado de hoy como el del mes en curso. */
export function FotoInventario({ mes }: { mes: string }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          const r = await guardarFotoInventario().catch(() => ({ error: "No se pudo guardar la foto." }) as { error?: string; valor?: number });
          if (r.error) mostrarToast(r.error, "destructive");
          else {
            mostrarToast(`Inventario de ${mesCorto(mes)}: ${dinero(r.valor ?? 0)}`);
            router.refresh();
          }
        })
      }
      className={`${claseAccionAF4} ${anilloFoco} disabled:opacity-50`}
    >
      {pendiente ? "Guardando…" : "Guardar foto del inventario"}
    </button>
  );
}
