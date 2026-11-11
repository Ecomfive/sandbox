"use client";

import { useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { fieldClass } from "@/components/ui/field";
import { cambiarLiderTareas } from "./lideres-tareas-actions";

export interface PersonaLider {
  id: string;
  nombre: string;
  rol: string | null;
  activo: boolean;
}

/**
 * Configuración › «Líderes: asignan tareas» (9 nov 2026, pedido de Hernán): quién, además de un administrador, asigna tareas a otras personas (en Equipo ›
 * Tareas y con el botón de tareas de cada módulo). Un rol que empieza con «Líder» ya cuenta. Una casilla por persona activa; guarda al momento.
 */
export function LideresTareasConfig({ personas, puedeEscribir }: { personas: PersonaLider[]; puedeEscribir: boolean }) {
  const [marcados, setMarcados] = useState(() => new Set(personas.filter((p) => p.activo).map((p) => p.id)));
  const [buscar, setBuscar] = useState("");
  const [, startTransition] = useTransition();
  const { mostrarToast } = useToast();

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q ? personas.filter((p) => p.nombre.toLowerCase().includes(q) || (p.rol ?? "").toLowerCase().includes(q)) : personas;
  }, [personas, buscar]);

  const cambiar = (p: PersonaLider, activo: boolean) => {
    setMarcados((m) => {
      const n = new Set(m);
      if (activo) n.add(p.id);
      else n.delete(p.id);
      return n;
    });
    startTransition(async () => {
      const r = await cambiarLiderTareas(p.id, activo);
      if (r.error) {
        setMarcados((m) => {
          const n = new Set(m);
          if (activo) n.delete(p.id);
          else n.add(p.id);
          return n;
        });
        mostrarToast(r.error, "destructive");
      } else mostrarToast(activo ? `${p.nombre} ya asigna tareas` : `${p.nombre} ya no asigna tareas`);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <p className="m-0 text-sm text-muted-foreground">
        Las personas marcadas, además de los administradores y de quien tiene un rol «Líder…», pueden asignarle una tarea a otra persona en cualquier módulo. {marcados.size === 1 ? "1 líder marcado" : `${marcados.size} líderes marcados`}.
      </p>
      <label className="flex flex-col gap-1">
        <span className="sr-only">Buscar persona</span>
        <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre o rol" className={fieldClass} />
      </label>
      <ul className="m-0 flex max-h-80 list-none flex-col divide-y divide-border overflow-y-auto p-0">
        {visibles.map((p) => (
          <li key={p.id}>
            <label className={`flex items-center gap-3 px-1 py-2 ${puedeEscribir ? "cursor-pointer" : ""}`}>
              <input type="checkbox" className="h-4 w-4 shrink-0" checked={marcados.has(p.id)} disabled={!puedeEscribir} onChange={(e) => cambiar(p, e.target.checked)} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nombre}</span>
              {p.rol && <span className="shrink-0 text-xs text-muted-foreground">{p.rol}</span>}
            </label>
          </li>
        ))}
        {visibles.length === 0 && <li className="px-1 py-2 text-sm text-muted-foreground">Nadie coincide con «{buscar}».</li>}
      </ul>
    </div>
  );
}
