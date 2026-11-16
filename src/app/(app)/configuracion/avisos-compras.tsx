"use client";

import { useState, useTransition } from "react";
import { fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { AVISOS_DE_COMPRAS, type EventoAviso } from "@/lib/compras/llegadas-avisos";
import { cambiarDestinatarioAviso } from "./avisos-compras-actions";

export interface PersonaAvisoCompras {
  id: string;
  nombre: string;
  rol: string | null;
}

/**
 * Configuración › «Avisos de Compras» (16 nov 2026, pedido de Hernán): quién recibe el aviso al pasar una compra a «06 - Llegada a Puerto» (Logística, el usuario de Dinora) y a
 * «07 - En Bodega» (Pagos, María José). Una casilla por persona activa; guarda al momento.
 */
export function AvisosComprasConfig({ personas, marcados, puedeEscribir }: { personas: PersonaAvisoCompras[]; marcados: Record<EventoAviso, string[]>; puedeEscribir: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {AVISOS_DE_COMPRAS.map((a) => (
        <Grupo key={a.evento} evento={a.evento} titulo={a.titulo} detalle={a.detalle} personas={personas} inicial={marcados[a.evento] ?? []} puedeEscribir={puedeEscribir} />
      ))}
    </div>
  );
}

function Grupo({ evento, titulo, detalle, personas, inicial, puedeEscribir }: { evento: EventoAviso; titulo: string; detalle: string; personas: PersonaAvisoCompras[]; inicial: string[]; puedeEscribir: boolean }) {
  const [marcados, setMarcados] = useState(() => new Set(inicial));
  const [buscar, setBuscar] = useState("");
  const [, startTransition] = useTransition();
  const { mostrarToast } = useToast();
  const q = buscar.trim().toLowerCase();
  const visibles = q ? personas.filter((p) => p.nombre.toLowerCase().includes(q) || (p.rol ?? "").toLowerCase().includes(q)) : personas;

  const cambiar = (p: PersonaAvisoCompras, activo: boolean) => {
    const poner = (valor: boolean) =>
      setMarcados((m) => {
        const n = new Set(m);
        if (valor) n.add(p.id);
        else n.delete(p.id);
        return n;
      });
    poner(activo);
    startTransition(async () => {
      const r = await cambiarDestinatarioAviso(evento, p.id, activo);
      if (r.error) {
        poner(!activo);
        mostrarToast(r.error, "destructive");
      } else mostrarToast(activo ? `${p.nombre} recibirá este aviso` : `${p.nombre} ya no recibe este aviso`);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div>
        <h3 className="m-0 text-sm font-semibold">{titulo}</h3>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          {detalle} {marcados.size === 1 ? "1 persona marcada." : `${marcados.size} personas marcadas.`}
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="sr-only">Buscar persona para {titulo}</span>
        <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre o rol" className={fieldClass} />
      </label>
      <ul className="m-0 flex max-h-72 list-none flex-col divide-y divide-border overflow-y-auto p-0">
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
