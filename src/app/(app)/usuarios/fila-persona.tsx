"use client";

import { useState, useTransition } from "react";
import { eliminarUsuario } from "./actions";
import { AvatarPersona } from "./avatar-persona";
import type { FilaUsuario, Rol } from "./def-usuarios";
import { EstadoPresencia } from "./estado-presencia";
import { EstadoDeAlta, FichaPersona } from "./ficha-persona";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { LapizIcon, PapeleraIcon } from "@/lib/nav-icons";
import { mensajeErrorAlEliminar } from "@/lib/retiros/errores";

/** Una fila de la lista de Personas: clic en cualquier parte abre su ficha. Al frente, por fuera de esa área,
 * un lápiz (abre la misma ficha) y una papelera (elimina de una vez, con confirmación) — mismo patrón que el
 * ícono suelto de Retiros/Cuentas destino: la fila entera es un botón estirado (`inset-0`) y los íconos van
 * encima (`relative z-10`) para no activarlo. */
export function FilaPersona({ persona, roles, miId }: { persona: FilaUsuario; roles: Rol[]; miId: string }) {
  const [abierta, setAbierta] = useState(false);
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();
  const esMiCuenta = persona.id === miId;
  const nombreMostrado = persona.nombre ?? persona.email;

  function alEliminar(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`¿Está seguro de que desea eliminar a "${nombreMostrado}"? Esto borra su cuenta por completo.`)) return;
    const formData = new FormData();
    formData.set("id", persona.id);
    startTransition(async () => {
      const resultado = await eliminarUsuario(formData).catch(() => ({ error: "Inténtalo de nuevo." }));
      if (resultado?.error) mostrarToast(mensajeErrorAlEliminar(`a "${nombreMostrado}"`, resultado.error), "destructive");
    });
  }

  return (
    <>
      <div className="relative flex w-full items-center gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/50">
        <button
          type="button"
          onClick={() => setAbierta(true)}
          aria-label={`Ver ficha de ${nombreMostrado}`}
          className={`absolute inset-0 ${anilloFoco}`}
        />
        <AvatarPersona nombre={persona.nombre} email={persona.email} avatarUrl={persona.avatarUrl} />
        <div className="pointer-events-none min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{nombreMostrado}</p>
          <p className="truncate text-xs text-muted-foreground">{persona.rolNombre ?? "Sin rol"}</p>
          {!persona.activo ? <Badge tone="neutral">Suspendida</Badge> : <EstadoDeAlta persona={persona} />}
        </div>
        <span className="pointer-events-none shrink-0">
          <EstadoPresencia ultimaActividadEn={persona.ultimaActividadEn} ultimoIngresoEn={persona.ultimoIngresoEn} />
        </span>
        <span className="relative z-10 flex shrink-0 items-center gap-1">
          <Tooltip texto={`Editar a ${nombreMostrado}`}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAbierta(true);
              }}
              aria-label={`Editar a ${nombreMostrado}`}
              className={`rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
            >
              <LapizIcon className="h-4 w-4" />
            </button>
          </Tooltip>
          {!esMiCuenta && (
            <Tooltip texto={`Eliminar a ${nombreMostrado}`}>
              <button
                type="button"
                onClick={alEliminar}
                disabled={pending}
                aria-label={`Eliminar a ${nombreMostrado}`}
                className={`rounded p-1.5 text-muted-foreground hover:bg-destructive-soft hover:text-destructive disabled:opacity-50 ${anilloFoco}`}
              >
                <PapeleraIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
        </span>
      </div>

      <FichaPersona persona={abierta ? persona : undefined} roles={roles} puedeEditarse={!esMiCuenta} alCerrar={() => setAbierta(false)} />
    </>
  );
}
