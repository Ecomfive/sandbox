import { Badge } from "@/components/ui/badge";
import { CheckIcon } from "@/lib/nav-icons";

/** La insignia verde de una publicación que ya tiene su ID de Dropi: en su ficha, sobre el campo del ID, y en su fila de la lista. */
export function InsigniaConectado() {
  return (
    <Badge tone="success">
      <CheckIcon aria-hidden="true" className="mr-1 h-3 w-3" />
      Conectado
    </Badge>
  );
}
