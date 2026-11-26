"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { EVENTO_ALTERNAR, leerOculto, suscribirOculto } from "@/lib/meta-ads/notas-eventos";

/** El ícono de notas (una hoja con líneas y una esquina doblada). */
export function NotasIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10.5" />
      <path d="M20 15.5 14.5 21v-4a1.5 1.5 0 0 1 1.5-1.5h4" />
      <path d="M8 8h8M8 12h8M8 16h3.5" />
    </svg>
  );
}

/**
 * En la barra de arriba, solo en las pestañas de Anuncios Meta (26 nov 2026, pedido de Hernán): muestra u oculta el botón flotante de notas. Si el botón está oculto, lo vuelve a sacar y abre las notas.
 */
export function BotonNotasMeta() {
  const ruta = usePathname();
  const oculto = useSyncExternalStore(suscribirOculto, leerOculto, () => false);
  if (!ruta?.startsWith("/anuncios-meta")) return null;
  const texto = oculto ? "Mostrar las notas" : "Notas para futuras campañas";
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EVENTO_ALTERNAR))}
        aria-label={texto}
        aria-pressed={!oculto}
        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-control ${oculto ? "bg-card text-muted-foreground" : "bg-primario-suave text-primario"} hover:bg-muted hover:text-foreground ${anilloFoco}`}
      >
        <NotasIcon />
      </button>
    </Tooltip>
  );
}
