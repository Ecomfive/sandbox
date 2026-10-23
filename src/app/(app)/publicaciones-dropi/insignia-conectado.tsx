import { Tooltip } from "@/components/ui/tooltip";
import { ConectadoIcon, DesconectadoIcon } from "@/lib/nav-icons";
import type { ConexionDropi } from "./def-publicaciones";

const ESTADO: Record<ConexionDropi, { texto: string; clase: string; Icono: typeof ConectadoIcon }> = {
  conectado: { texto: "Conectado con Dropi", clase: "bg-success-soft text-success", Icono: ConectadoIcon },
  no_aparece: { texto: "No aparece en Dropi: el ID está mal o el producto se eliminó", clase: "bg-destructive-soft text-destructive", Icono: DesconectadoIcon },
};

/**
 * Si el ID de Dropi de una publicación es un producto nuestro en Dropi, como un ícono: el cable conectado en verde si la lectura de
 * «Mis productos» lo encontró, o el enchufe desconectado en rojo si tiene ID pero Dropi no lo lista. El estado sale al pasar el
 * cursor y lo leen los lectores de pantalla (no depende solo del color: el ícono cambia). En la ficha y en la fila de la lista.
 */
export function InsigniaConectado({ estado = "conectado" }: { estado?: ConexionDropi }) {
  const e = ESTADO[estado];
  return (
    <Tooltip texto={e.texto}>
      <span role="img" aria-label={e.texto} className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${e.clase}`}>
        <e.Icono className="h-3.5 w-3.5" />
      </span>
    </Tooltip>
  );
}
