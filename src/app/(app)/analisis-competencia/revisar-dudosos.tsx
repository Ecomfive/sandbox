"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BotonBarra } from "@/components/panel/piezas-panel";
import { useToast } from "@/components/ui/toast";
import { revisarDudososConIA } from "./actions";

/** Los pares dudosos que la IA aún no revisó y el botón para revisarlos (de a tandas: cada pulsación revisa unos cuantos productos nuestros). */
export function RevisarDudosos({ pendientes }: { pendientes: number }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  if (!pendientes) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm">
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{pendientes}</span> {pendientes === 1 ? "producto dudoso" : "productos dudosos"} sin revisar: se parecen a uno nuestro,
        pero no es seguro que sean el mismo, así que no se comparan.
      </span>
      <BotonBarra
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await revisarDudososConIA();
            if ("error" in r) return mostrarToast(r.error, "destructive");
            mostrarToast(`La IA revisó ${r.revisados}: ${r.mismos} el mismo, ${r.parecidos} parecidos y ${r.distintos} distintos.${r.quedan ? ` Quedan ${r.quedan}.` : ""}`);
            router.refresh();
          })
        }
        className="!h-8 !text-xs"
      >
        {pendiente ? "Revisando con IA…" : "Revisar con IA"}
      </BotonBarra>
    </div>
  );
}
