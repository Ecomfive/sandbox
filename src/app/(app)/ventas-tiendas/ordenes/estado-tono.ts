import type { Tone } from "@/components/ui/badge";
import type { EstadoEntrega } from "@/lib/ventas/matriz";

/** El color de la insignia de cada estado de entrega. */
export const TONO_ESTADO: Record<EstadoEntrega, Tone> = {
  entregada: "success",
  en_transito: "info",
  pendiente: "neutral",
  devuelta: "warning",
  cancelada: "destructive",
  no_gestionada: "neutral",
};
