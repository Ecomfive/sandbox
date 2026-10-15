"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatearFecha } from "@/lib/formato";
import { AdjuntoIcon } from "@/lib/nav-icons";
import { recomendacionesDeDropshipper, type RecomendacionCliente } from "../sugerencias-clientes/actions";
import { colorEstadoSugerencia, etiquetaEstadoSugerencia } from "../sugerencias-clientes/def-sugerencias";

/**
 * Los productos que este cliente nos recomendó, del más nuevo al más viejo, con su estado. Se pide al abrir la ficha y otra
 * vez cuando se registra una nueva (`version`). No muestra cantidades ni costos.
 */
export function RecomendacionesDropshipper({ dropshipperId, version }: { dropshipperId: string; version: number }) {
  const [lista, setLista] = useState<RecomendacionCliente[] | "error" | null>(null);

  useEffect(() => {
    let vigente = true;
    recomendacionesDeDropshipper(dropshipperId)
      .then((r) => vigente && setLista("recomendaciones" in r ? r.recomendaciones : "error"))
      .catch(() => vigente && setLista("error"));
    return () => {
      vigente = false;
    };
  }, [dropshipperId, version]);

  if (lista === null) return <p className="m-0 text-[13px] text-muted-foreground">Cargando…</p>;
  if (lista === "error") return <p role="alert" className="m-0 text-[13px] text-destructive">No se pudieron cargar las recomendaciones.</p>;
  if (lista.length === 0) return <p className="m-0 text-[13px] text-muted-foreground">Todavía no ha recomendado productos.</p>;

  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
      {lista.map((r) => (
        <li key={r.id} className="flex items-center gap-2.5">
          {r.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.fotoUrl} alt="" className="h-8 w-8 shrink-0 rounded-md border border-border object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
              <AdjuntoIcon className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{r.nombre}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {r.codigo} · {formatearFecha(r.creadoEn)}
            </span>
          </span>
          <Badge color={colorEstadoSugerencia(r.estado)}>{etiquetaEstadoSugerencia(r.estado)}</Badge>
        </li>
      ))}
    </ul>
  );
}
