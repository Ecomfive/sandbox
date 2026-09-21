import { CerrarIcon, CheckIcon } from "@/lib/nav-icons";
import { formatearFechaYHora } from "@/lib/formato";

type EstadoPaso = "listo" | "eliminada" | "pendiente";

function claseNodo(estado: EstadoPaso): string {
  switch (estado) {
    case "listo":
      return "border-success bg-success text-background";
    case "eliminada":
      return "border-destructive bg-destructive text-background";
    default:
      return "border-border bg-card text-muted-foreground";
  }
}

/**
 * La línea de tiempo de una cuenta destino, como la de un pedido: un nodo por paso unidos por una línea, con su fecha
 * y hora debajo. Dos pasos: **Creada** (siempre, con su fecha) y **Eliminada** (gris y sin fecha mientras la cuenta
 * está activa; con la fecha y en rojo cuando ya se eliminó). Las horas son las del país de la página.
 */
export function LineaDeTiempoCuenta({
  creadaEn,
  eliminadaEn,
  eliminada,
  codigoPais,
}: {
  creadaEn?: string | null;
  eliminadaEn?: string | null;
  eliminada: boolean;
  codigoPais: string;
}) {
  const pasos: { etiqueta: string; estado: EstadoPaso; momento: string | null | undefined }[] = [
    { etiqueta: "Creada", estado: "listo", momento: creadaEn },
    { etiqueta: "Eliminada", estado: eliminada ? "eliminada" : "pendiente", momento: eliminada ? eliminadaEn : null },
  ];

  return (
    <ol aria-label="Línea de tiempo" className="relative flex justify-between">
      {/* La línea que une los nodos, de centro a centro (los nodos miden 28 px). */}
      <span aria-hidden="true" className={`absolute top-3.5 right-3.5 left-3.5 h-0.5 -translate-y-1/2 ${eliminada ? "bg-destructive" : "bg-border"}`} />
      {pasos.map((paso, i) => {
        const cuando = paso.momento ? formatearFechaYHora(paso.momento, codigoPais) : null;
        return (
          <li key={paso.etiqueta} className={`relative flex w-32 flex-col gap-0.5 ${i === 0 ? "items-start text-left" : "items-end text-right"}`}>
            <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${claseNodo(paso.estado)}`}>
              {paso.estado === "listo" && <CheckIcon className="h-3.5 w-3.5" />}
              {paso.estado === "eliminada" && <CerrarIcon className="h-3.5 w-3.5" />}
            </span>
            <span className="mt-1 text-xs font-medium">{paso.etiqueta}</span>
            {cuando ? (
              <>
                <span className="text-xs text-muted-foreground">{cuando.fecha}</span>
                <span className="text-xs text-muted-foreground">{cuando.hora}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
