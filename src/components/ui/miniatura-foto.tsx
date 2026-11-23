"use client";

import { FotoAmpliable } from "@/components/ui/foto-ampliable";
import { AdjuntoIcon } from "@/lib/nav-icons";

/**
 * La foto de un producto en una tabla: una miniatura de 40 × 40 que, al pasar el cursor, se ve grande (y en el celular, con un toque: `FotoAmpliable`).
 * Sin foto, un cuadro punteado del mismo tamaño (así las filas no cambian de alto).
 */
export function MiniaturaFoto({ url, nombre }: { url: string | null; nombre: string }) {
  if (!url)
    return (
      <span role="img" aria-label={`${nombre}: sin foto`} className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
        <AdjuntoIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  return <FotoAmpliable src={url} alt={nombre} className="h-10 w-10 rounded-md border border-border object-cover" />;
}
