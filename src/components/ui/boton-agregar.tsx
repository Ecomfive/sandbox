import { forwardRef, type ButtonHTMLAttributes } from "react";
import { anilloFoco } from "@/components/ui/field";
import { MasIcon } from "@/lib/nav-icons";

/**
 * El botón «Agregar» de una tabla: relleno oscuro, con el «+», al final de la fila de botones de su barra de
 * herramientas (`accionPrincipal`). Es el único botón relleno de esa fila, así que es lo primero que se ve. Sus colores
 * salen de los tokens (`foreground` / `background`), que se invierten en el tema oscuro: un `#202020` fijo se
 * confundía con la tarjeta oscura.
 */
export const BotonAgregar = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { etiqueta?: string }>(
  function BotonAgregar({ etiqueta = "Agregar", className = "", ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        className={`inline-flex items-center justify-center gap-1 border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/85 disabled:pointer-events-none disabled:opacity-40 ${anilloFoco} !rounded-md ${className}`}
        {...props}
      >
        <MasIcon className="h-4 w-4" />
        {etiqueta}
      </button>
    );
  }
);
