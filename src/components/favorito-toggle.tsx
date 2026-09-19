"use client";

import { useTransition } from "react";
import { alternarFavorito } from "@/lib/favoritos-actions";
import { EstrellaIcon } from "@/lib/nav-icons";

/** Estrella para marcar/desmarcar una página del menú como acceso rápido. Vive al lado del
 * link, no adentro: por eso preventDefault/stopPropagation, para no disparar la navegación. */
export function FavoritoToggle({ href, activo }: { href: string; activo: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
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
      className={`shrink-0 rounded p-1 transition-colors disabled:opacity-50 ${
        activo ? "text-warning hover:text-warning" : "text-muted-foreground/50 hover:text-muted-foreground"
      }`}
    >
      <EstrellaIcon filled={activo} className="h-3.5 w-3.5" />
    </button>
  );
}
