import { Tooltip } from "@/components/ui/tooltip";
import { ConectadoIcon, DesconectadoIcon } from "@/lib/nav-icons";

/**
 * Si la publicación está en Drop, como el de Gestión de IDs Dropi (3 nov 2026, pedido de Hernán): el cable conectado en verde si la última lectura de
 * «Mis productos» de Drop la encontró, o el enchufe desconectado en rojo si ya no aparece (se eliminó en Drop). El estado sale al pasar el cursor y lo leen
 * los lectores de pantalla (no depende solo del color: el ícono cambia). En la fila y en la ficha.
 */
export function InsigniaConectadoDrop({ conectado }: { conectado: boolean }) {
  const texto = conectado ? "Conectado con Drop" : "No aparece en Drop: se eliminó allá o cambió de cuenta";
  const Icono = conectado ? ConectadoIcon : DesconectadoIcon;
  return (
    <Tooltip texto={texto}>
      <span role="img" aria-label={texto} className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${conectado ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"}`}>
        <Icono className="h-3.5 w-3.5" />
      </span>
    </Tooltip>
  );
}
