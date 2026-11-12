"use client";

import Link from "next/link";
import { useState } from "react";
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { anilloFoco } from "@/components/ui/field";
import { nombreDeFila, PERIODOS_ENTREGAS, repartoEntregas, type EntregaDropshipper, type PeriodoEntregas } from "@/lib/publicaciones/entregas-dropshipper";

const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toLocaleString("es-PA", { maximumFractionDigits: n < 0.1 ? 1 : 0 })} %`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (d: string | null) => (d ? `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "—");
const A_LA_VISTA = 8;

/**
 * «Quién lo vende» (12 nov 2026, pedido de Alcides): los pedidos ENTREGADOS de todos los IDs de Dropi del producto, repartidos entre los
 * dropshippers que los vendieron. Solo cuenta lo entregado (no lo que solo salió ni lo que va en camino), por la fecha del pedido.
 */
export function EntregasPorDropshipper({ filas, pais }: { filas: EntregaDropshipper[]; pais: string }) {
  const [periodo, setPeriodo] = useState<PeriodoEntregas>("30");
  const [todos, setTodos] = useState(false);
  const abreCrm = usePuedeAbrir("crm-dropshippers");
  const { filas: reparto, total } = repartoEntregas(filas, periodo);
  const visibles = todos ? reparto : reparto.slice(0, A_LA_VISTA);

  return (
    <section aria-label={`Quién lo vende en ${pais}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="m-0 text-sm font-semibold">
          Quién lo vende <span className="font-normal text-muted-foreground">· pedidos entregados</span>
        </h4>
        <div role="group" aria-label="Periodo" className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
          {PERIODOS_ENTREGAS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={periodo === p.id}
              onClick={() => {
                setPeriodo(p.id);
                setTodos(false);
              }}
              className={`rounded px-2 py-1 ${periodo === p.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"} ${anilloFoco}`}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">Sin pedidos entregados {periodo === "total" ? "registrados" : `en los últimos ${periodo} días`}.</p>
      ) : (
        <>
          <p className="m-0 text-xs text-muted-foreground tabular-nums">
            {entero(total)} {total === 1 ? "pedido entregado" : "pedidos entregados"} entre {entero(reparto.length)} {reparto.length === 1 ? "dropshipper" : "dropshippers"}
          </p>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {visibles.map((e) => {
              const nombre = nombreDeFila(e);
              return (
                <li key={e.dropshipperId ?? `u-${e.usuario}`} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {e.dropshipperId && abreCrm ? (
                        <Link href={`/crm-dropshippers?abrir=${e.dropshipperId}`} className={`font-medium hover:underline ${anilloFoco}`}>
                          {nombre}
                        </Link>
                      ) : (
                        <span className="font-medium">{nombre}</span>
                      )}
                      {!e.dropshipperId && <span className="text-xs text-muted-foreground"> · sin vincular en el CRM{e.usuario ? ` (usuario ${e.usuario})` : ""}</span>}
                      <span className="block text-xs text-muted-foreground">Último entregado: {fecha(e.ultimo)}</span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      <span className="font-semibold">{entero(e.entregados)}</span>
                      <span className="ml-2 inline-block w-12 text-xs text-muted-foreground">{pct(e.parte)}</span>
                    </span>
                  </div>
                  <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primario" style={{ width: `${Math.max(2, e.parte * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
          {reparto.length > A_LA_VISTA && (
            <button type="button" onClick={() => setTodos((t) => !t)} className={`w-fit text-xs font-medium text-primario hover:underline ${anilloFoco}`}>
              {todos ? "Ver menos" : `Ver los ${entero(reparto.length)}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
