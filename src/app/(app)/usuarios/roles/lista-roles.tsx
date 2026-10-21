"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AvatarRol } from "@/components/permisos/piezas-permisos";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { BuscarIcon } from "@/lib/nav-icons";
import { CrearRolPanel } from "./crear-rol-panel";

export interface FilaRol {
  id: string;
  nombre: string;
  color: string | null;
  personas: number;
  modulos: number;
}

const normalizar = (t: string) => t.trim().toLowerCase();

/** La lista de roles al lado del editor: el elegido va resaltado; cada uno dice cuántas personas lo tienen y a cuántos módulos llega. */
export function ListaRoles({
  roles,
  elegidoId,
  otrosRoles,
  puedeEscribir,
}: {
  roles: FilaRol[];
  elegidoId: string | null;
  otrosRoles: { id: string; nombre: string }[];
  puedeEscribir: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return q ? roles.filter((r) => normalizar(r.nombre).includes(q)) : roles;
  }, [roles, busqueda]);

  return (
    <aside aria-label="Lista de roles" className="rounded-[14px] border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-3.5">
        <div className="flex items-center gap-2">
          <h2 className="grow text-[15px] font-bold">Roles</h2>
          {puedeEscribir && <CrearRolPanel roles={otrosRoles} />}
        </div>
        <div className="relative">
          <BuscarIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar rol" aria-label="Buscar rol" className={`${fieldClass} w-full pl-9`} />
        </div>
      </div>
      <nav aria-label="Roles" className="flex flex-col gap-1 p-2">
        {visibles.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Ningún rol coincide.</p>}
        {visibles.map((r) => {
          const activo = r.id === elegidoId;
          return (
            <Link
              key={r.id}
              href={`/usuarios/roles?rol=${r.id}`}
              aria-current={activo ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[11px] border p-2.5 ${anilloFoco} ${activo ? "border-primario/40 bg-accent" : "border-transparent hover:bg-muted"}`}
            >
              <AvatarRol nombre={r.nombre} color={r.color} />
              <span className="min-w-0 grow">
                <span className="block truncate font-semibold">{r.nombre}</span>
                <span className={`block text-[12.5px] ${activo ? "text-accent-foreground" : "text-muted-foreground"}`}>
                  {r.personas === 0 ? "Sin personas" : `${r.personas} persona${r.personas === 1 ? "" : "s"}`} · {r.modulos} módulo{r.modulos === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
