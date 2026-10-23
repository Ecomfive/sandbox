import { Badge } from "@/components/ui/badge";
import { CheckIcon } from "@/lib/nav-icons";
import type { ConexionDropi } from "./def-publicaciones";

/**
 * Si el ID de Dropi de una publicación es un producto nuestro en Dropi: «Conectado» (verde) solo si la lectura de «Mis productos»
 * lo encontró; si tiene ID pero Dropi no lo lista, «No aparece en Dropi» (ámbar: el ID está mal o el producto se eliminó). En su
 * ficha, sobre el campo del ID, y en su fila de la lista.
 */
export function InsigniaConectado({ estado = "conectado" }: { estado?: ConexionDropi }) {
  if (estado === "no_aparece") return <Badge tone="warning">No aparece en Dropi</Badge>;
  return (
    <Badge tone="success">
      <CheckIcon aria-hidden="true" className="mr-1 h-3 w-3" />
      Conectado
    </Badge>
  );
}
