"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { SeccionTarjeta } from "@/components/permisos/seccion-tarjeta";
import { CerrarIcon, PuestosIcon } from "@/lib/nav-icons";
import { asignarPersona, marcarPrincipal, quitarPersona } from "../puestos/actions";

export interface PuestosDeUsuarios {
  /** Los puestos activos que se pueden asignar. */
  puestos: { id: string; nombre: string }[];
  /** Los puestos de cada persona (por su id). */
  porPersona: Record<string, { id: string; nombre: string; principal: boolean }[]>;
  /** Puede modificar Puestos: asigna y quita desde aquí. */
  puedeAsignar: boolean;
}

const Contexto = createContext<PuestosDeUsuarios | null>(null);

/** Lo pone la página de Usuarios y roles; sin el módulo Puestos o sin la migración 0112 no se pone y el bloque no sale. */
export function ProveedorPuestosPersona({ valor, children }: { valor: PuestosDeUsuarios | null; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Bloque «Puesto» de la ficha de una persona: su puesto principal y los demás; con permiso, se asigna y quita aquí. */
export function PuestosPersona({ personaId, nombre }: { personaId: string; nombre: string }) {
  const datos = useContext(Contexto);
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [elegido, setElegido] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!datos) return null;
  const suyos = [...(datos.porPersona[personaId] ?? [])].sort((a, b) => Number(b.principal) - Number(a.principal) || a.nombre.localeCompare(b.nombre, "es"));
  const disponibles = datos.puestos.filter((p) => !suyos.some((s) => s.id === p.id));

  function correr(accion: () => Promise<{ error?: string }>, exito: string) {
    setError(null);
    empezar(async () => {
      const r = await accion().catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else mostrarToast(exito);
    });
  }

  return (
    <SeccionTarjeta id={`puestos-${personaId}`} icono={PuestosIcon} titulo="Puestos">
      {suyos.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">Sin puesto asignado.</p>
      ) : (
        <ul className="m-0 mb-3 flex list-none flex-col gap-1.5 p-0">
          {suyos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
              <a href="/puestos" className="font-medium underline-offset-2 hover:underline">
                {p.nombre}
              </a>
              {p.principal ? (
                <Badge tone="info">Principal</Badge>
              ) : (
                datos.puedeAsignar && (
                  <button type="button" disabled={pendiente} onClick={() => correr(() => marcarPrincipal(p.id, personaId), "Puesto principal cambiado")} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50">
                    Hacer principal
                  </button>
                )
              )}
              {datos.puedeAsignar && (
                <Tooltip texto="Quitar del puesto">
                  <button
                    type="button"
                    aria-label={`Quitar a ${nombre} de ${p.nombre}`}
                    disabled={pendiente}
                    onClick={() => confirm(`¿Quitar a ${nombre} de ${p.nombre}?`) && correr(() => quitarPersona(p.id, personaId), "Persona quitada del puesto")}
                    className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <CerrarIcon className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      )}
      {datos.puedeAsignar && disponibles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select aria-label={`Puesto para ${nombre}`} value={elegido} onChange={(e) => setElegido(e.target.value)} className={`${fieldClassSm} min-w-48 flex-1`}>
            <option value="">Elige un puesto</option>
            {disponibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pendiente || !elegido}
            onClick={() => {
              const id = elegido;
              setElegido("");
              correr(() => asignarPersona(id, personaId), "Puesto asignado");
            }}
            className="inline-flex min-h-9 items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Asignar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </SeccionTarjeta>
  );
}
