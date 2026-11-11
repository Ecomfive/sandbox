"use client";

import { Seccion } from "@/components/ui/seccion-ficha";
import { EstadoIcon } from "@/lib/nav-icons";
import { BotonAsistenteIA } from "./asistente-ia";
import type { FilaPublicacion } from "./def-publicaciones";

/**
 * El bloque «Optimización» de la ficha: **solo las recomendaciones** (9 nov 2026, pedido de Hernán: «solo dame las recomendaciones, no la explicación de
 * todo esto»): los puntos que faltan o hay que revisar, con lo que se vio. Lo que cumple, no aplica o todavía no se leyó de Dropi no se lista, ni la nota
 * («3 de 4», sigue en la fila y en los filtros). Quien puede editar tiene además el «Asistente de IA» (títulos, descripción, fotos y análisis).
 */
export function OptimizacionFicha({ p, puedeEscribir }: { p: FilaPublicacion; puedeEscribir: boolean }) {
  const recomendaciones = p.revisiones.filter((r) => r.estado === "falta" || r.estado === "revisar");
  return (
    <div className="border-b border-border px-5 py-5">
      <Seccion icono={EstadoIcon} titulo="Optimización en Dropi">
        {recomendaciones.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {recomendaciones.map((r) => (
              <li key={r.clave} className="flex min-w-0 gap-2 text-sm">
                <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.estado === "falta" ? "bg-destructive" : "bg-warning"}`} />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-medium">{r.etiqueta}:</span> <span className="text-muted-foreground">{r.detalle}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">Sin recomendaciones.</p>
        )}
        {puedeEscribir && (
          <div className="flex flex-wrap items-center gap-2">
            <BotonAsistenteIA publicacionId={p.id} principal />
          </div>
        )}
      </Seccion>
    </div>
  );
}
