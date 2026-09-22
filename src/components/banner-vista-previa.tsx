"use client";

import { useTransition } from "react";
import { salirVistaPrevia } from "@/lib/vista-previa-actions";

/** Franja fija arriba de toda la app mientras alguien está probando "Ver así": qué rol está viendo y un
 * botón para volver a lo suyo. Vive en el layout (no en la página de Usuarios) porque "Ver así" cambia
 * los módulos de TODA la sesión, no solo esa pantalla. */
export function BannerVistaPrevia({ rolNombre }: { rolNombre: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-center gap-3 bg-foreground px-4 py-2 text-sm text-background">
      <span>
        Estás viendo la app como: <strong>{rolNombre}</strong>
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => salirVistaPrevia())}
        className="rounded-md border border-background/40 px-2.5 py-1 text-xs font-medium hover:bg-background/10 disabled:opacity-50"
      >
        {pending ? "Saliendo..." : "Salir de la vista previa"}
      </button>
    </div>
  );
}
