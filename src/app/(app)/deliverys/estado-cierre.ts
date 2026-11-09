import type { Tone } from "@/components/ui/badge";
import type { EstadoCierre } from "@/lib/deliverys/cargar";

/** El color de la insignia de cada estado de un cierre semanal. */
export const TONO_ESTADO_CIERRE: Record<EstadoCierre, Tone> = { abierto: "neutral", cerrado: "warning", pagado: "success" };
