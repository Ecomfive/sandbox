"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { BarraAvance } from "@/components/ui/barra-avance";
import { useToast } from "@/components/ui/toast";
import { clasificarGanchosMeta } from "./actions";

/**
 * «Clasificar los ganchos»: pone tipo (pregunta, problema o dolor, resultado…) al gancho de los videos que ya estaban analizados, de a 30 por llamada, con el texto del gancho (no vuelve a ver el video). Muestra el avance
 * real y se puede detener; lo ya clasificado queda guardado.
 */
export function ClasificarGanchos({ pendientes, iaConectada }: { pendientes: number; iaConectada: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [avance, setAvance] = useState<{ hecho: number; total: number; terminado: boolean } | null>(null);
  const parar = useRef(false);
  const [deteniendo, setDeteniendo] = useState(false);
  const corriendo = !!avance && !avance.terminado;
  const empezar = async () => {
    parar.current = false;
    setDeteniendo(false);
    let hechos = 0;
    let faltan = pendientes;
    setAvance({ hecho: 0, total: pendientes, terminado: false });
    while (faltan > 0 && !parar.current) {
      const r = await clasificarGanchosMeta();
      hechos += r.clasificados ?? 0;
      faltan = r.faltan ?? 0;
      setAvance({ hecho: hechos, total: Math.max(pendientes, hechos + faltan), terminado: false });
      if (r.error) {
        mostrarToast(r.error, "destructive");
        setAvance(null);
        router.refresh();
        return;
      }
      if (!r.clasificados) break;
    }
    setAvance({ hecho: hechos, total: Math.max(pendientes, hechos), terminado: true });
    mostrarToast(parar.current ? `Detenido: se clasificaron ${hechos} ganchos. Lo hecho queda guardado.` : `Listo: ${hechos} ganchos clasificados.`, "success");
    router.refresh();
  };
  if (pendientes <= 0 && !avance) return null;
  return (
    <div className="flex flex-col gap-2">
      {!avance && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          <span className="min-w-0 flex-1">
            {pendientes} {pendientes === 1 ? "video analizado todavía no tiene" : "videos analizados todavía no tienen"} tipo de gancho, así que no cuentan aquí.
          </span>
          <button type="button" onClick={empezar} disabled={!iaConectada} className="min-h-9 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50">
            Clasificar los ganchos
          </button>
          {!iaConectada && <span className="w-full text-xs text-muted-foreground">Falta conectar la IA (Gemini) para clasificarlos.</span>}
        </div>
      )}
      {avance && (
        <BarraAvance
          hecho={avance.hecho}
          total={avance.total}
          texto="Clasificando los ganchos con la IA…"
          unidad="ganchos"
          etiqueta="Avance de la clasificación de ganchos"
          terminado={avance.terminado}
          deteniendo={deteniendo}
          alDetener={
            corriendo
              ? () => {
                  parar.current = true;
                  setDeteniendo(true);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
