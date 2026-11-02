"use client";

import { useEffect, useState, useTransition } from "react";
import { TextoConMenciones } from "@/components/ui/campo-menciones";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatearTiempoRelativo } from "@/lib/formato";
import type { AccesoCrm } from "@/lib/crm/areas";
import { escalarCaso, obtenerLineaDeTiempo, type ItemLinea } from "./actions";

/** «Pasar a Comercial» en un caso abierto: Atención lo deja como seguimiento del área comercial. */
export function BotonEscalar({ casoId, escalado }: { casoId: string; escalado: boolean }) {
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  if (escalado) return <span className="text-xs text-muted-foreground">Pasado a Comercial</span>;
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        start(async () => {
          const r = await escalarCaso(casoId);
          mostrarToast(r.error ?? "Caso pasado a Comercial", r.error ? "destructive" : undefined);
        })
      }
      className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-40 ${anilloFoco}`}
    >
      Pasar a Comercial
    </button>
  );
}

const FILTROS = [
  { id: "todo", etiqueta: "Todo" },
  { id: "comercial", etiqueta: "Comercial" },
  { id: "atencion", etiqueta: "Atención" },
] as const;

/** Todo lo que ha pasado con el dropshipper. Quien tiene el área comercial puede filtrar por área; Atención ve solo lo suyo. */
export function LineaDeTiempo({ dropshipperId, acceso, version }: { dropshipperId: string; acceso: AccesoCrm; version: number }) {
  const [datos, setDatos] = useState<ItemLinea[] | "error" | null>(null);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todo");

  useEffect(() => {
    let vigente = true;
    obtenerLineaDeTiempo(dropshipperId)
      .then((r) => vigente && setDatos("items" in r ? r.items : "error"))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [dropshipperId, version]);

  const items = Array.isArray(datos) ? datos.filter((i) => filtro === "todo" || i.area === filtro || i.area === "general") : [];

  return (
    <div className="flex flex-col gap-2.5">
      {acceso.comercial && (
        <div role="group" aria-label="Filtrar actividad por área" className="flex gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${anilloFoco} ${
                filtro === f.id ? "border-primario bg-primario text-white" : "border-border bg-card hover:bg-accent"
              }`}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      )}
      {datos === null && <p className="m-0 text-[13px] text-muted-foreground">Cargando…</p>}
      {datos === "error" && <p role="alert" className="m-0 text-[13px] text-destructive">No se pudo cargar la actividad.</p>}
      {Array.isArray(datos) && items.length === 0 && <p className="m-0 text-[13px] text-muted-foreground">Sin actividad.</p>}
      {items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
          {items.map((i) => (
            <li key={i.id} className="flex gap-2">
              <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${i.area === "comercial" ? "bg-foreground" : "bg-border-control"}`} />
              <span className="min-w-0">
                <TextoConMenciones texto={i.texto} />
                <span className="block text-xs text-muted-foreground">
                  {formatearTiempoRelativo(i.creadoEn)}
                  {acceso.comercial && i.area !== "general" ? ` · ${i.area === "comercial" ? "Comercial" : "Atención"}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
