"use client";

import { useEffect, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { AdjuntoIcon } from "@/lib/nav-icons";
import { diasEntreFechas, type Etapa } from "@/lib/sugerencias/seguimiento";
import { recomendacionesDeDropshipper, type RecomendacionCliente } from "../sugerencias-clientes/actions";

type Datos = Extract<Awaited<ReturnType<typeof recomendacionesDeDropshipper>>, { recomendaciones: unknown }>;

const COLOR_ETAPA: Record<Etapa["estado"], string> = {
  hecha: "bg-success",
  actual: "bg-primario ring-4 ring-primario-suave",
  pendiente: "bg-border",
  fallo: "bg-destructive",
};
const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;

/** La línea de tiempo de una recomendación: cada etapa con su fecha y los días desde que el cliente la recomendó. */
function Recorrido({ r }: { r: RecomendacionCliente }) {
  return (
    <ol className="m-0 mt-2 ml-1 flex list-none flex-col gap-0 border-l border-border p-0 pl-4">
      {r.seguimiento.etapas.map((e) => (
        <li key={e.clave} className="relative pb-2 last:pb-0">
          <span aria-hidden="true" className={`absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full ${COLOR_ETAPA[e.estado]}`} />
          <span className={`flex flex-wrap items-baseline justify-between gap-x-2 text-[13px] ${e.estado === "pendiente" ? "text-muted-foreground" : ""}`}>
            <span className={e.estado === "actual" ? "font-semibold" : e.estado === "fallo" ? "font-medium text-destructive" : ""}>
              {e.etiqueta}
              {e.estado === "actual" && <span className="sr-only"> (etapa actual)</span>}
            </span>
            {e.fecha && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatearFecha(e.fecha)} · día {diasEntreFechas(r.creadoEn, e.fecha)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Lo que este cliente nos recomendó (del más nuevo al más viejo) con su % de acierto arriba: de lo recomendado, cuánto salió
 * Winner en el test. Cada producto dice en qué etapa va y cuántos días lleva, y despliega su recorrido completo para
 * contárselo al cliente: recomendado, seleccionado, oferta, test, resultado y compra (sin cantidades ni costos).
 */
export function RecomendacionesDropshipper({ dropshipperId, version }: { dropshipperId: string; version: number }) {
  const [datos, setDatos] = useState<Datos | "error" | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    recomendacionesDeDropshipper(dropshipperId)
      .then((r) => vigente && setDatos("recomendaciones" in r ? r : "error"))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [dropshipperId, version]);

  if (datos === null) return <p className="m-0 text-[13px] text-muted-foreground">Cargando…</p>;
  if (datos === "error") return <p role="alert" className="m-0 text-[13px] text-destructive">No se pudieron cargar las recomendaciones.</p>;
  if (datos.recomendaciones.length === 0) return <p className="m-0 text-[13px] text-muted-foreground">Todavía no ha recomendado productos.</p>;

  const { acierto } = datos;
  return (
    <div className="flex flex-col gap-3">
      <dl className="m-0 grid grid-cols-3 gap-2 text-center">
        {[
          ["Recomendados", String(acierto.recomendados)],
          ["Acierto", acierto.pct === null ? "—" : `${acierto.pct} %`],
          ["Comprados", String(acierto.comprados)],
        ].map(([t, v]) => (
          <div key={t} className="rounded-lg border border-border px-2 py-1.5">
            <dt className="text-[11px] text-muted-foreground">{t}</dt>
            <dd className="m-0 text-base font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 -mt-1 text-xs text-muted-foreground">
        Acierto: {acierto.winners} de {acierto.recomendados} salieron Winner en el test.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
        {datos.recomendaciones.map((r) => {
          const actual = r.seguimiento.etapas.find((e) => e.clave === r.seguimiento.actual);
          const abiertaEsta = abierta === r.id;
          return (
            <li key={r.id} className="rounded-lg border border-border px-2.5 py-2">
              <button
                type="button"
                aria-expanded={abiertaEsta}
                onClick={() => setAbierta(abiertaEsta ? null : r.id)}
                className={`flex w-full items-center gap-2.5 rounded text-left ${anilloFoco}`}
              >
                {r.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.fotoUrl} alt="" className="h-8 w-8 shrink-0 rounded-md border border-border object-cover" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
                    <AdjuntoIcon className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{r.nombre}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {r.codigo} · {formatearFecha(r.creadoEn)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className={`text-xs font-medium ${actual?.estado === "fallo" ? "text-destructive" : ""}`}>{actual?.etiqueta}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {r.seguimiento.terminado ? `en ${dias(r.seguimiento.dias)}` : `lleva ${dias(r.seguimiento.dias)}`}
                  </span>
                </span>
              </button>
              {abiertaEsta && <Recorrido r={r} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
