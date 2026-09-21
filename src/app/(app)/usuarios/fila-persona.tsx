"use client";

import { useState } from "react";
import { AvatarPersona } from "./avatar-persona";
import type { FilaUsuario, Rol } from "./def-usuarios";
import { EstadoDeAlta, FichaPersona } from "./ficha-persona";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { formatearTiempoRelativo } from "@/lib/formato";

/** Una fila de la lista de Personas: clic en cualquier parte abre su ficha. */
export function FilaPersona({ persona, roles, miId }: { persona: FilaUsuario; roles: Rol[]; miId: string }) {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted/50 ${anilloFoco}`}
      >
        <AvatarPersona nombre={persona.nombre} email={persona.email} avatarUrl={persona.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{persona.nombre ?? persona.email}</p>
          <p className="truncate text-xs text-muted-foreground">{persona.rolNombre ?? "Sin rol"}</p>
          {!persona.activo ? <Badge tone="neutral">Suspendida</Badge> : <EstadoDeAlta persona={persona} />}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {persona.ultimoIngresoEn ? formatearTiempoRelativo(persona.ultimoIngresoEn) : (
            <span className="text-warning">Nunca entró</span>
          )}
        </span>
      </button>

      <FichaPersona persona={abierta ? persona : undefined} roles={roles} puedeEditarse={persona.id !== miId} alCerrar={() => setAbierta(false)} />
    </>
  );
}
