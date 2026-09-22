"use client";

import { useState, useTransition } from "react";
import { FichaRol } from "./ficha-rol";
import type { FilaUsuario, Rol } from "./def-usuarios";
import { AvatarPersona } from "./avatar-persona";
import { anilloFoco } from "@/components/ui/field";
import { iniciarVistaPrevia } from "@/lib/vista-previa-actions";
import { EstadoIcon } from "@/lib/nav-icons";

/** Una fila de la lista de Roles: nombre y descripción, cuántos módulos ve, quién lo tiene y el
 * botón "Ver así". Clic en el resto de la fila abre la ficha para editarlo. */
export function FilaRol({
  rol,
  totalModulos,
  modulosActivos,
  modulosSoloLectura,
  personas,
}: {
  rol: Rol;
  totalModulos: number;
  modulosActivos: Set<string>;
  modulosSoloLectura: Set<string>;
  personas: FilaUsuario[];
}) {
  const [abierta, setAbierta] = useState(false);
  const [pending, startTransition] = useTransition();
  const soloLecturaEnTodos = modulosActivos.size > 0 && [...modulosActivos].every((m) => modulosSoloLectura.has(m));

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
        <button type="button" onClick={() => setAbierta(true)} className={`min-w-0 flex-1 text-left ${anilloFoco}`}>
          <p className="text-sm font-semibold">{rol.nombre}</p>
          <p className="truncate text-xs text-muted-foreground">{rol.descripcion ?? "Sin descripción."}</p>
          <p className="text-xs text-muted-foreground">
            {modulosActivos.size} de {totalModulos} página{totalModulos === 1 ? "" : "s"}
            {soloLecturaEnTodos ? " · solo lectura" : ""}
          </p>
        </button>
        <div className="flex shrink-0 -space-x-2">
          {personas.slice(0, 3).map((p) => (
            <span key={p.id} className="ring-2 ring-card rounded-full">
              <AvatarPersona nombre={p.nombre} email={p.email} avatarUrl={p.avatarUrl} tamano="sm" />
            </span>
          ))}
        </div>
        <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{personas.length || ""}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await iniciarVistaPrevia(rol.id);
            })
          }
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
        >
          <EstadoIcon className="h-3.5 w-3.5" />
          Ver así
        </button>
      </div>

      <FichaRol
        rol={abierta ? rol : undefined}
        modulosActivos={modulosActivos}
        modulosSoloLectura={modulosSoloLectura}
        personas={personas.length}
        alCerrar={() => setAbierta(false)}
      />
    </>
  );
}
