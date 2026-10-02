"use client";

import Link from "next/link";
import { Suspense, use } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { NotificacionesIcon } from "@/lib/nav-icons";
import { textoContador, textoPendientes, type PendientesMenu } from "@/lib/contadores-menu";

function Campana({ cantidad }: { cantidad: number }) {
  return (
    <Tooltip texto="Centro de notificaciones">
      <Link
        href="/notificaciones"
        aria-label={cantidad > 0 ? `Centro de notificaciones, ${textoPendientes(cantidad)}` : "Centro de notificaciones"}
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
  return <Campana cantidad={use(pendientes).total} />;
}

/**
 * Campana del Centro de notificaciones, con lo que hay por atender. Lleva la misma promesa que el menú lateral: la
 * barra sale al instante y el número llega por streaming; si la consulta falla, la campana sale sin número.
 */
export function CampanaPendientes({ pendientes }: { pendientes: Promise<PendientesMenu> }) {
  return (
    <Suspense fallback={<Campana cantidad={0} />}>
      <ConConteo pendientes={pendientes} />
    </Suspense>
  );
}
