"use client";

import Link from "next/link";
import { Suspense, use } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { NotificacionesIcon } from "@/lib/nav-icons";
import { textoContador, textoPendientes, type PendientesMenu } from "@/lib/contadores-menu";

function Campana({ cantidad }: { cantidad: number }) {
  return (
    <Tooltip texto={cantidad > 0 ? `Tus tareas: ${textoPendientes(cantidad)}` : "Tus tareas: nada pendiente"}>
      <Link
        href="/tareas?mias=1"
        aria-label={cantidad > 0 ? `Tus tareas, ${textoPendientes(cantidad)}` : "Tus tareas, nada pendiente"}
        className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-control bg-card text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
      >
        <NotificacionesIcon className="h-4 w-4" />
        {cantidad > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] leading-none font-semibold text-background tabular-nums"
          >
            {textoContador(cantidad)}
          </span>
        )}
      </Link>
    </Tooltip>
  );
}

function ConConteo({ pendientes }: { pendientes: Promise<PendientesMenu> }) {
  return <Campana cantidad={use(pendientes).tareasMias} />;
}

/**
 * La campana junto a la foto es personal (11 nov 2026, pedido de Hernán): cuenta solo las tareas del equipo asignadas a la persona y sin
 * cerrar, y lleva a ellas. Lo general (pendientes del día, actividad, actualizaciones) está en «Avisos», debajo de Ayuda. Lleva la misma
 * promesa que el menú lateral: la barra sale al instante y el número llega por streaming; si la consulta falla, sale sin número.
 */
export function CampanaPendientes({ pendientes }: { pendientes: Promise<PendientesMenu> }) {
  return (
    <Suspense fallback={<Campana cantidad={0} />}>
      <ConConteo pendientes={pendientes} />
    </Suspense>
  );
}
