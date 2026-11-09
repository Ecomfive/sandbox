import { Badge, type Tone } from "@/components/ui/badge";
import { ETIQUETA_ESTADO_CIERRE, type ColorTarea, type EstadoCierre } from "@/lib/finanzas/cierre";

export const TONO_ESTADO_CIERRE: Record<EstadoCierre, Tone> = { abierto: "neutral", en_revision: "warning", cerrado: "success" };

export function InsigniaCierre({ estado }: { estado: EstadoCierre }) {
  return <Badge tone={TONO_ESTADO_CIERRE[estado]}>{ETIQUETA_ESTADO_CIERRE[estado]}</Badge>;
}

const CLASE_PUNTO: Record<ColorTarea, string> = { verde: "bg-success", ambar: "bg-warning", rojo: "bg-destructive" };
export const TEXTO_COLOR: Record<ColorTarea, string> = { verde: "Lista", ambar: "Por revisar", rojo: "Falta" };

/** El punto de color de una tarea; el texto va al lado o, si no se ve, para lectores de pantalla. */
export function PuntoTarea({ color, conTexto = false }: { color: ColorTarea; conTexto?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${CLASE_PUNTO[color]}`} />
      <span className={conTexto ? "text-xs text-muted-foreground" : "sr-only"}>{TEXTO_COLOR[color]}</span>
    </span>
  );
}
