import { Badge } from "@/components/ui/badge";
import { llegadaCorta } from "@/lib/compras/en-camino";

/**
 * Cuándo llega lo que viene en camino, para la fila y la ficha de una publicación: la fecha aproximada («12 nov») o, si todavía no se
 * puede saber, una insignia ámbar «Sin fecha» para que se complete en Compras (la fecha límite, o la fecha y la vía de envío). Si solo
 * una parte de las órdenes la tiene, se ve la fecha más próxima y un punto ámbar.
 */
export function LlegadaCamino({ llegada, sinFecha }: { llegada: string | null; sinFecha: number }) {
  const hoy = new Date().toISOString();
  if (llegada === null)
    return sinFecha > 0 ? (
      <Badge tone="warning">Sin fecha</Badge>
    ) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{llegadaCorta(llegada, hoy)}</span>
      {sinFecha > 0 && <span role="img" aria-label="Parte de lo que viene en camino todavía no tiene fecha de llegada" className="h-2 w-2 shrink-0 rounded-full bg-warning" />}
    </span>
  );
}
