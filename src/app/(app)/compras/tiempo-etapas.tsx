"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { CabeceraTarjeta, Punto, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { tiempoPorEtapa, type EventoEtapa } from "@/lib/compras/tiempo-etapas";
import { etiquetaEtapa, numeroOC, type FilaCompra } from "./def-compras";
import { entero, usd } from "./calculos-compras";

/** Las etapas que se miden, en el orden del flujo (Completado y Descartado son el final: no se mide cuánto se quedan). */
const ETAPAS = ["cotizar", "cotizado", "produccion", "tracking", "arribo_mercancia", "backlog"] as const;
/** Las del recorrido normal, para sumar el ciclo de Cotizar a Arribo. */
const RECORRIDO = ["cotizar", "cotizado", "produccion", "tracking", "arribo_mercancia"];
/** Con menos estancias que estas, «9 de cada 10» no dice mucho y no se marca a nadie como «más de lo normal». */
const MIN_MUESTRA = 3;
/** Pospuesta no tiene un tiempo «normal»: ahí no se marca a nadie. */
const SIN_NORMAL = ["backlog"];

const d = (n: number | null) => (n === null ? "—" : `${entero(n)} d`);

/**
 * «Tiempo en cada etapa»: para cada etapa de la compra, lo que tardaron las que ya salieron de ella (mediana, promedio, 9 de
 * cada 10 y máximo, del historial de etapa) y las que están ahora en ella, con cuántos días llevan y cuántas pasan de lo
 * normal (más que 9 de cada 10). Pulsar una etapa despliega las compras que están ahí, de la que más lleva a la que menos.
 */
export function TiempoEtapas({ compras, eventos, dia, vista }: { compras: FilaCompra[]; eventos: EventoEtapa[]; dia: string; vista: string }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const filas = useMemo(() => tiempoPorEtapa(eventos, compras, ETAPAS, dia), [eventos, compras, dia]);
  const maximo = Math.max(1, ...filas.map((f) => f.pasadas.mediana ?? 0));
  const ciclo = filas.filter((f) => RECORRIDO.includes(f.etapa)).reduce((s, f) => s + (f.pasadas.mediana ?? 0), 0);
  const prefijo = `/compras/lista?${vista === "todos" ? "" : `ver=${vista}&`}abrir=`;
  const columnas = ["Etapa", "Pasaron", "Mediana", "Promedio", "9 de cada 10", "Máximo", "Ahora", "Llevan (mediana)", "Más de lo normal"];

  return (
    <section aria-labelledby="d-tiempo-etapas" className="min-w-0 rounded-[10px] border border-border bg-card">
      <CabeceraTarjeta id="d-tiempo-etapas" titulo="Tiempo en cada etapa">
        <span className="text-xs text-muted-foreground">
          De Cotizar a Arribo: <b className="font-semibold text-foreground tabular-nums">{entero(ciclo)} días</b> (suma de medianas) · pulsa una etapa para ver sus compras
        </span>
      </CabeceraTarjeta>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse">
          <thead>
            <tr>
              {columnas.map((t, i) => (
                <th key={t} scope="col" className={`${claseTh} ${i > 0 ? "text-right" : ""} ${t === "Mediana" ? "w-[22%]" : ""}`}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const fiable = !SIN_NORMAL.includes(f.etapa) && f.pasadas.n >= MIN_MUESTRA && f.pasadas.p90 !== null;
              const tarde = fiable ? f.ahora.filter((x) => x.dias > f.pasadas.p90!) : [];
              const llevan = f.ahora.length ? [...f.ahora].sort((a, b) => a.dias - b.dias)[Math.floor(f.ahora.length / 2)].dias : null;
              const desplegada = abierta === f.etapa;
              return (
                <Fragment key={f.etapa}>
                  <tr className={desplegada ? "bg-muted/50" : ""}>
                    <th scope="row" className={`${claseTd} text-left font-medium`}>
                      <button
                        type="button"
                        aria-expanded={desplegada}
                        disabled={!f.ahora.length}
                        onClick={() => setAbierta(desplegada ? null : f.etapa)}
                        className={`flex items-center gap-1.5 rounded text-left enabled:hover:underline disabled:cursor-default ${anilloFoco}`}
                      >
                        <span aria-hidden="true" className={`text-muted-foreground transition-transform ${desplegada ? "rotate-90" : ""} ${f.ahora.length ? "" : "invisible"}`}>
                          ›
                        </span>
                        {etiquetaEtapa(f.etapa)}
                      </button>
                    </th>
                    <td className={`${claseTd} text-right tabular-nums`}>{entero(f.pasadas.n)}</td>
                    <td className={claseTd}>
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 rounded-full bg-muted">
                          <span className="barra-neon block h-1.5 rounded-full" style={{ width: `${f.pasadas.mediana ? Math.max(3, (f.pasadas.mediana / maximo) * 100) : 0}%` }} />
                        </span>
                        <b className="w-12 text-right font-semibold tabular-nums">{d(f.pasadas.mediana)}</b>
                      </span>
                    </td>
                    <td className={`${claseTd} text-right tabular-nums`}>{d(f.pasadas.promedio)}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{d(f.pasadas.p90)}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{d(f.pasadas.max)}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{entero(f.ahora.length)}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>{d(llevan)}</td>
                    <td className={`${claseTd} text-right tabular-nums`}>
                      {tarde.length ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                          <Punto tono="peligro" />
                          {entero(tarde.length)}
                        </span>
                      ) : fiable ? (
                        "0"
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {desplegada && (
                    <tr>
                      <td colSpan={columnas.length} className="border-b border-border bg-muted/30 p-0">
                        <ul className="m-0 max-h-[320px] list-none overflow-auto p-0">
                          {f.ahora.map(({ compra: c, dias }) => {
                            const fuera = fiable && dias > f.pasadas.p90!;
                            return (
                              <li key={c.id} className="flex items-center gap-3 border-b border-border/50 px-4 py-2 text-[13px] last:border-b-0">
                                <span className={`w-16 shrink-0 text-right font-semibold tabular-nums ${fuera ? "text-destructive" : ""}`}>{entero(dias)} d</span>
                                <Link href={`${prefijo}${c.id}`} className={`min-w-0 flex-1 truncate rounded hover:underline ${anilloFoco}`}>
                                  <span className="text-muted-foreground tabular-nums">{c.codigo ?? numeroOC(c.numero)}</span> {c.lineas.length ? c.lineas.map((l) => l.nombre).join(", ") : c.nombre}
                                </Link>
                                <span className="shrink-0 text-muted-foreground">{c.paisCodigo ?? "—"}</span>
                                <span className="hidden w-36 shrink-0 truncate text-muted-foreground sm:block">{c.proveedor ?? "—"}</span>
                                <span className="w-24 shrink-0 text-right text-muted-foreground tabular-nums">{c.montoTotal === null ? "—" : usd(c.montoTotal, true)}</span>
                                {fuera && <span className="shrink-0 text-xs font-medium text-destructive">más de lo normal</span>}
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
