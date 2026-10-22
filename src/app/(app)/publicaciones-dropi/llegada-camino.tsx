import { Badge } from "@/components/ui/badge";
import { llegadaCorta } from "@/lib/compras/en-camino";

/**
 * Cuándo llega lo que viene en camino, para la fila y la ficha de una publicación: la fecha aproximada («12 nov») o, si todavía no se
 * puede saber, una insignia ámbar para que se complete en Compras: «Sin fecha de envío» si la compra aún no se envía (está en producción), o «Sin fecha» si ya se envió y falta la vía o la fecha límite. Si solo
 * una parte de las órdenes la tiene, se ve la fecha más próxima y un punto ámbar.
 */
export function LlegadaCamino({ llegada, sinFecha, sinEnvio = 0 }: { llegada: string | null; sinFecha: number; /** De las unidades sin fecha, las de órdenes que aún no tienen fecha de envío. */ sinEnvio?: number }) {
  const hoy = new Date().toISOString();
  if (llegada === null)
    return sinFecha > 0 ? (
      <Badge tone="warning">{sinEnvio >= sinFecha ? "Sin fecha de envío" : "Sin fecha"}</Badge>
    ) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{llegadaCorta(llegada, hoy)}</span>
      {sinFecha > 0 && <span role="img" aria-label="Parte de lo que viene en camino todavía no tiene fecha de llegada" className="h-2 w-2 shrink-0 rounded-full bg-warning" />}
    </span>
  );
}
