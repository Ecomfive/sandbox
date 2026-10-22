"use client";

/* eslint-disable @next/next/no-img-element -- foto de Storage */
import Link from "next/link";
import { useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { DECISIONES, TIPOS_RECOMENDACION, type Recomendacion, type TipoRecomendacion } from "@/lib/publicaciones/recomendaciones";
import type { DecisionVista } from "../def-publicaciones";
import { LineaDecision, TarjetaRecomendacion } from "../recomendacion-publicacion";

export interface TareaRecomendacion {
  rec: Recomendacion;
  publicacion: { id: string; numero: number | null; nombre: string; fotoUrl: string | null; sku: string | null };
}

const chip = (activo: boolean) =>
  `inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors ${anilloFoco} ${activo ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`;

/**
 * Las recomendaciones pendientes del país como tareas (filtrables por tipo), y a la derecha cómo se han decidido: cuántas se
 * aceptan y se rechazan de cada tipo y las últimas decisiones con su porqué.
 */
export function PanelRecomendaciones({
  tareas,
  decisiones,
  nombreDe,
  puedeDecidir,
  faltaMigracion,
}: {
  tareas: TareaRecomendacion[];
  decisiones: DecisionVista[];
  nombreDe: Record<string, string>;
  puedeDecidir: boolean;
  faltaMigracion: boolean;
}) {
  const [tipo, setTipo] = useState<TipoRecomendacion | null>(null);
  const visibles = tipo ? tareas.filter((t) => t.rec.tipo === tipo) : tareas;
  const cuenta = (t: TipoRecomendacion) => tareas.filter((x) => x.rec.tipo === t).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="pendientes-t" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="pendientes-t" className="m-0 text-base font-semibold">
            Pendientes <span className="font-normal text-muted-foreground tabular-nums">({tareas.length})</span>
          </h2>
          <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={tipo === null} className={chip(tipo === null)} onClick={() => setTipo(null)}>
              Todas
            </button>
            {TIPOS_RECOMENDACION.map((t) => (
              <button key={t.valor} type="button" aria-pressed={tipo === t.valor} className={chip(tipo === t.valor)} onClick={() => setTipo(tipo === t.valor ? null : t.valor)}>
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.etiqueta}
                <span className="tabular-nums opacity-70">{cuenta(t.valor)}</span>
              </button>
            ))}
          </div>
        </div>
        {faltaMigracion && (
          <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
            Para guardar decisiones falta correr en Supabase la migración 0127.
          </p>
        )}
        {visibles.length === 0 ? (
          <p className="m-0 rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">No hay recomendaciones pendientes.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {visibles.map((t) => (
              <li key={`${t.publicacion.id}-${t.rec.tipo}`} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-start sm:gap-4">
                <Link
                  href={`/publicaciones-dropi?abrir=${t.publicacion.id}`}
                  className={`flex min-w-0 items-center gap-3 rounded-lg sm:w-44 sm:shrink-0 sm:flex-col sm:items-start ${anilloFoco}`}
                >
                  {t.publicacion.fotoUrl ? (
                    <img src={t.publicacion.fotoUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover" />
                  ) : (
                    <span aria-hidden="true" className="h-14 w-14 shrink-0 rounded-lg border border-dashed border-border-control" />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs text-muted-foreground tabular-nums">{numeroPublicacion(t.publicacion.numero)}</span>
                    <span className="text-sm font-medium [overflow-wrap:anywhere] hover:underline">{t.publicacion.nombre}</span>
                    {t.publicacion.sku && <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{t.publicacion.sku}</span>}
                  </span>
                </Link>
                <div className="min-w-0 flex-1">
                  <TarjetaRecomendacion publicacionId={t.publicacion.id} rec={t.rec} puedeDecidir={puedeDecidir} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside aria-labelledby="decisiones-t" className="flex min-w-0 flex-col gap-4">
        <h2 id="decisiones-t" className="m-0 text-base font-semibold">
          Decisiones
        </h2>
        <table className="w-full border-collapse overflow-hidden rounded-xl border border-border bg-card text-sm">
          <caption className="sr-only">Decisiones por tipo de recomendación</caption>
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Tipo
              </th>
              {DECISIONES.map((d) => (
                <th key={d.valor} scope="col" className="px-2 py-2 text-right font-medium">
                  {d.etiqueta}s
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {TIPOS_RECOMENDACION.map((t) => (
              <tr key={t.valor}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {t.etiqueta}
                </th>
                {DECISIONES.map((d) => (
                  <td key={d.valor} className="px-2 py-2 text-right tabular-nums">
                    {decisiones.filter((x) => x.tipo === t.valor && x.decision === d.valor).length}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {decisiones.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Todavía no se ha decidido ninguna.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-border rounded-xl border border-border bg-card px-3 py-1">
            {decisiones.slice(0, 30).map((d) => (
              <LineaDecision key={d.id} d={d} producto={nombreDe[d.publicacionId]} />
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
