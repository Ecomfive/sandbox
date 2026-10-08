"use client";

import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { AdjuntoIcon } from "@/lib/nav-icons";

/**
 * La foto de un producto en una tabla: una miniatura de 40 × 40 que, al pasar el cursor, se ve grande. Sin foto, un cuadro
 * punteado del mismo tamaño (así las filas no cambian de alto).
 */
export function MiniaturaFoto({ url, nombre }: { url: string | null; nombre: string }) {
  if (!url)
    return (
      <span role="img" aria-label={`${nombre}: sin foto`} className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
        <AdjuntoIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  return (
    <TarjetaEmergente
      clase="rounded-lg border border-border bg-card p-1.5 shadow-lg"
      contenido={
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="max-h-72 max-w-72 rounded-md object-contain" />
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={nombre} loading="lazy" className="h-10 w-10 rounded-md border border-border object-cover" />
    </TarjetaEmergente>
  );
}
