"use client";

import { useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { alternarFavorito } from "@/lib/favoritos-actions";
import { EstrellaIcon } from "@/lib/nav-icons";

/** Estrella para marcar/desmarcar una página del menú como acceso rápido. En el menú vive al lado
 * del link, no adentro: por eso preventDefault/stopPropagation, para no disparar la navegación.
 * En las migas de pan (`variante="miga"`) es más grande y explica lo que hace con un tooltip. */
export function FavoritoToggle({
  href,
  activo,
  variante = "menu",
}: {
  href: string;
  activo: boolean;
  variante?: "menu" | "miga";
}) {
  const [pending, startTransition] = useTransition();
  const enMiga = variante === "miga";

  const boton = (
    <button
      type="button"
      aria-label={activo ? "Quitar de accesos rápidos" : "Agregar a accesos rápidos"}
      aria-pressed={activo}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(() => {
          alternarFavorito(href, !activo);
        });
      }}
      className={`shrink-0 rounded transition-colors disabled:opacity-50 ${anilloFoco} ${enMiga ? "p-1.5" : "p-1"} ${
        activo
          ? "text-warning hover:text-warning"
          : enMiga
            ? "text-muted-foreground hover:text-foreground"
            : "text-muted-foreground/50 hover:text-muted-foreground"
      }`}
    >
      <EstrellaIcon filled={activo} className={enMiga ? "h-4 w-4" : "h-3.5 w-3.5"} />
    </button>
  );

  if (!enMiga) return boton;
  return (
    <Tooltip texto={activo ? "Quita esta página de tus accesos rápidos." : "Marca esta página como favorita: la tendrás en Accesos rápidos del menú."}>
      {boton}
    </Tooltip>
  );
}
