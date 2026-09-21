import { forwardRef, type ButtonHTMLAttributes, type ComponentType } from "react";
import { anilloFoco } from "@/components/ui/field";

type Tono = "neutro" | "oscuro" | "peligro";

const TONOS: Record<Tono, string> = {
  neutro: "border-border bg-card text-foreground hover:bg-muted",
  // Los tokens cambian con el tema: negro con texto blanco en claro, y a la inversa en oscuro (un #202020 fijo se
  // confundía con la tarjeta oscura).
  oscuro: "border-foreground bg-foreground text-background hover:bg-foreground/85",
  peligro: "border-destructive/30 bg-card text-destructive hover:bg-destructive-soft",
};

/**
 * Acción de una ficha: ícono arriba y texto debajo, en una fila de botones iguales (como la fila de acciones de la
 * ficha de un pedido en otros sistemas). Se reparten el ancho de la fila; con `disabled` se apaga y no responde.
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
      className={`flex min-h-14 flex-col items-center justify-center gap-1 border px-3 py-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${TONOS[tono]} ${anilloFoco} !rounded-lg ${className}`}
      {...props}
    >
      <Icono className="h-4 w-4" />
      {children}
    </button>
  );
});
