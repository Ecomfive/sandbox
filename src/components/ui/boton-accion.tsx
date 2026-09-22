import { forwardRef, type ButtonHTMLAttributes, type ComponentType } from "react";
import { anilloFoco } from "@/components/ui/field";

type Tono = "neutro" | "oscuro" | "peligro" | "exito" | "alerta";

// Los colores salen de los tokens, que cambian con el tema: en oscuro el «oscuro» pasa a claro y el texto se invierte
// (un #202020 fijo se confundía con la tarjeta oscura). El texto de los rellenos es `text-background`, que en los dos
// temas contrasta con `foreground`, `destructive`, `success` y `warning`.
const TONOS: Record<Tono, string> = {
  neutro: "border-border bg-card text-foreground hover:bg-muted",
  oscuro: "border-foreground bg-foreground text-background hover:bg-foreground/85",
  peligro: "border-destructive bg-destructive text-background hover:bg-destructive/85",
  exito: "border-success bg-success text-background hover:bg-success/85",
  alerta: "border-warning bg-warning text-background hover:bg-warning/85",
};

/**
 * Acción de una ficha: ícono arriba y texto debajo, en una fila de botones del mismo tamaño y rellenos de color (como
 * la fila de acciones de la ficha de un pedido en otros sistemas). Apagado (`disabled`) se ve gris y no responde.
 */
export const BotonAccion = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icono: ComponentType<{ className?: string }>;
    tono?: Tono;
  }
>(function BotonAccion({ icono: Icono, tono = "neutro", className = "", children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`flex h-16 w-24 shrink-0 flex-col items-center justify-center gap-1 border px-2 py-1.5 text-center text-xs leading-tight font-medium transition-colors disabled:pointer-events-none disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground ${TONOS[tono]} ${anilloFoco} !rounded-lg ${className}`}
      {...props}
    >
      <Icono className="h-4 w-4" />
      {children}
    </button>
  );
});
