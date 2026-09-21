"use client";

import { useMemo, useState } from "react";
import { CrearRolPanel } from "./crear-rol-panel";
import { CrearUsuarioPanel } from "./crear-usuario-panel";
import type { FilaUsuario, Rol } from "./def-usuarios";
import { FilaPersona } from "./fila-persona";
import { FilaRol } from "./fila-rol";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { fieldClassSm } from "@/components/ui/field";
import { MODULOS } from "@/lib/modulos";

const normalizar = (texto: string) => texto.trim().toLowerCase();

type Pestana = "personas" | "roles";

export function UsuariosYRoles({
  personas,
  roles,
  modulosPorRol,
  soloLecturaPorRol,
  miId,
}: {
  personas: FilaUsuario[];
  roles: Rol[];
  modulosPorRol: Map<string, Set<string>>;
  soloLecturaPorRol: Map<string, Set<string>>;
  miId: string;
}) {
  const [pestana, setPestana] = useState<Pestana>("personas");
  const [busqueda, setBusqueda] = useState("");

  const personasFiltradas = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return personas;
    return personas.filter((p) => normalizar(p.nombre ?? "").includes(q) || normalizar(p.email).includes(q));
  }, [personas, busqueda]);

  const rolesFiltrados = useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return roles;
    return roles.filter((r) => normalizar(r.nombre).includes(q));
  }, [roles, busqueda]);

  const personasPorRol = useMemo(() => {
    const mapa = new Map<string, FilaUsuario[]>();
    for (const p of personas) {
      if (!p.rolId) continue;
      if (!mapa.has(p.rolId)) mapa.set(p.rolId, []);
      mapa.get(p.rolId)!.push(p);
    }
    return mapa;
  }, [personas]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 border-b border-border" role="tablist">
          {(
            [
              { id: "personas", etiqueta: "Personas", cantidad: personas.length },
              { id: "roles", etiqueta: `Roles (${roles.length})`, cantidad: null },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={pestana === p.id}
              onClick={() => setPestana(p.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                pestana === p.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
        {pestana === "personas" ? <CrearUsuarioPanel roles={roles} /> : <CrearRolPanel />}
      </div>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder={pestana === "personas" ? "Buscar por nombre o correo…" : "Buscar rol…"}
        aria-label={pestana === "personas" ? "Buscar persona" : "Buscar rol"}
        className={`${fieldClassSm} w-full max-w-sm`}
      />

      {pestana === "personas" ? (
        personasFiltradas.length === 0 ? (
          <EstadoVacio mensaje={busqueda ? "Ninguna coincide con la búsqueda." : "Todavía no hay usuarios."} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {personasFiltradas.map((p) => (
              <FilaPersona key={p.id} persona={p} roles={roles} miId={miId} />
            ))}
          </div>
        )
      ) : rolesFiltrados.length === 0 ? (
        <EstadoVacio mensaje={busqueda ? "Ninguno coincide con la búsqueda." : "Todavía no hay roles."} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {rolesFiltrados.map((r) => (
            <FilaRol
              key={r.id}
              rol={r}
              totalModulos={MODULOS.length}
              modulosActivos={modulosPorRol.get(r.id) ?? new Set()}
              modulosSoloLectura={soloLecturaPorRol.get(r.id) ?? new Set()}
              personas={personasPorRol.get(r.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
