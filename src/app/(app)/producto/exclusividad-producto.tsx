"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatearFecha } from "@/lib/formato";
import { textoExclusividad } from "@/lib/sugerencias/seguimiento";
import { exclusividadDeProducto } from "../sugerencias-clientes/actions";

type Dato = Awaited<ReturnType<typeof exclusividadDeProducto>>;

/**
 * Si el producto salió de la recomendación de un cliente, de quién es la exclusividad y hasta cuándo (corre desde que quedó
 * disponible para vender). No muestra nada si no viene de una recomendación.
 */
export function ExclusividadProducto({ skuId }: { skuId: string }) {
  const [dato, setDato] = useState<Dato>(null);
  useEffect(() => {
    let vigente = true;
    exclusividadDeProducto(skuId)
      .then((r) => vigente && setDato(r))
      .catch(() => vigente && setDato(null));
    return () => {
      vigente = false;
    };
  }, [skuId]);
  if (!dato) return null;
  const e = dato.exclusividad;
  return (
    <div className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px]">
      <Badge tone={e.estado === "vigente" ? "success" : "neutral"}>{e.estado === "vigente" ? "Exclusivo" : "Recomendado"}</Badge>
      <span>
        Lo recomendó <span className="font-medium">{dato.cliente}</span> ({dato.codigo}).
      </span>
      <span className="text-muted-foreground">{textoExclusividad(e, formatearFecha)}</span>
    </div>
  );
}
