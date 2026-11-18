"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas de los videos, directo de Meta */
import Link from "next/link";
import { useState } from "react";
import { Ventana } from "@/components/ui/ventana";
import { Seccion } from "@/components/ui/seccion-ficha";
import { AnunciosIcon, MargenIcon } from "@/lib/nav-icons";
import { confiable, cpa, ctr, dolares, holdRate, hookRate, nivelDeCpa, nivelDeCtr, nivelDeHook } from "@/lib/meta-ads/metricas";
import type { VideoVista } from "@/lib/meta-ads/vistas";
import { AVISO_POCA_DATA, Cifra, entero, InsigniaEtapa, MetricasEnLinea, Nivel, porcentaje, Resultado, valorCpa } from "./piezas";

const urlSegura = (u: string | null) => (u && /^https:\/\//i.test(u) ? u : null);

function Dato({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-muted-foreground">{t}</dt>
      <dd className="m-0 font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/** Los videos con gasto en los últimos 30 días, cada uno una sola vez. Tocar uno abre su ficha: en qué anuncios y campañas se usa y cómo le fue en cada una. */
export function ListaVideos({ videos }: { videos: VideoVista[] }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const v = videos.find((x) => x.id === abierto);
  const hayPocaData = videos.some((x) => !confiable(x.r));
  const mini = urlSegura(v?.miniatura ?? null);
  return (
    <>
      <ul role="list" className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4 p-0">
        {videos.map((x) => {
          const m = urlSegura(x.miniatura);
          const ok = confiable(x.r);
          return (
            <li key={x.id} className="min-w-0">
              <button type="button" onClick={() => setAbierto(x.id)} className={`flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-border-control hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${ok ? "" : "opacity-80"}`}>
                <span className="flex gap-3 p-3">
                  {m ? <img src={m} alt="" loading="lazy" className="h-24 w-24 shrink-0 rounded-md bg-muted object-cover" /> : <span aria-hidden="true" className="h-24 w-24 shrink-0 rounded-md bg-muted" />}
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="line-clamp-2 text-sm font-medium">
                      {x.numero && <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{x.numero}</span>}
                      {x.nombre}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {x.producto ?? "Sin producto"}
                      {x.angulo ? ` · ${x.angulo}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      En {x.anuncios} {x.anuncios === 1 ? "anuncio" : "anuncios"} de {x.campanas} {x.campanas === 1 ? "campaña" : "campañas"}
                    </span>
                    {!ok && <span className="text-xs text-muted-foreground">poca data</span>}
                  </span>
                </span>
                <dl className="m-0 grid grid-cols-3 gap-x-2 gap-y-2 border-t border-border px-3 py-2.5 text-xs">
                  <Dato t="Gasto">{dolares(x.r.gasto)}</Dato>
                  <Dato t="Compras">{entero(x.r.compras)}</Dato>
                  <Dato t="CPA">{ok && x.r.compras > 0 ? <Nivel nivel={nivelDeCpa(cpa(x.r), x.tope)}>{valorCpa(x.r)}</Nivel> : valorCpa(x.r)}</Dato>
                  <Dato t="Hook (3 s)">{hookRate(x.r) === null ? "—" : ok ? <Nivel nivel={nivelDeHook(hookRate(x.r))}>{porcentaje(hookRate(x.r), 0)}</Nivel> : porcentaje(hookRate(x.r), 0)}</Dato>
                  <Dato t="Pasan 15 s">{porcentaje(holdRate(x.r), 0)}</Dato>
                  <Dato t="CTR">{ok ? <Nivel nivel={nivelDeCtr(ctr(x.r))}>{porcentaje(ctr(x.r))}</Nivel> : porcentaje(ctr(x.r))}</Dato>
                </dl>
                <span className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
                  <span>Resultado estimado</span>
                  <Resultado r={x.r} tope={x.tope} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hayPocaData && <p className="m-0 text-xs text-muted-foreground">{AVISO_POCA_DATA}</p>}

      <Ventana
        abierto={!!v}
        alCerrar={() => setAbierto(null)}
        lado="derecha"
        ancho="lg"
        titulo={
          v && (
            <span className="min-w-0 break-words text-lg font-semibold">
              {v.numero ? `${v.numero} · ` : ""}
              {v.nombre}
            </span>
          )
        }
      >
        {v && (
          <div className="flex flex-col divide-y divide-border px-5 py-5">
            <Seccion icono={MargenIcon} titulo="Cómo le fue (30 días)">
              <div className="flex gap-3">
                {mini ? <img src={mini} alt="" className="h-28 w-28 shrink-0 rounded-md bg-muted object-cover" /> : null}
                <p className="m-0 text-sm text-muted-foreground">
                  {v.producto ?? "Sin producto"}
                  {v.angulo ? ` · ángulo ${v.angulo}` : ""}
                </p>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
                <Cifra titulo="Gasto" valor={dolares(v.r.gasto)} />
                <Cifra titulo="Compras" valor={entero(v.r.compras)} />
                <Cifra titulo="CPA" valor={valorCpa(v.r)} nivel={nivelDeCpa(cpa(v.r), v.tope)} />
                <Cifra titulo="Hook (3 s)" valor={porcentaje(hookRate(v.r), 0)} nivel={nivelDeHook(hookRate(v.r))} />
                <Cifra titulo="CTR del enlace" valor={porcentaje(ctr(v.r), 2)} nivel={nivelDeCtr(ctr(v.r))} />
              </div>
            </Seccion>
            <Seccion icono={AnunciosIcon} titulo={`Dónde se usa (${v.anunciosDetalle.length} ${v.anunciosDetalle.length === 1 ? "anuncio" : "anuncios"})`}>
              <ul role="list" className="m-0 flex list-none flex-col gap-3 p-0">
                {v.anunciosDetalle.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 rounded-lg border border-border p-2.5">
                    <p className="m-0 truncate text-sm font-medium">
                      {a.nombre}
                      {!a.activo && <span className="ml-2 text-xs font-normal text-muted-foreground">apagado</span>}
                    </p>
                    <p className="m-0 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <InsigniaEtapa etapa={a.etapa} />
                      <Link href={`/anuncios-meta/campanas?abrir=${a.campanaId}`} className="min-w-0 truncate underline underline-offset-2 hover:text-foreground">
                        {a.campanaNombre || "Ver la campaña"}
                      </Link>
                    </p>
                    <p className="m-0 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{dolares(a.r.gasto)}</span>
                      <span>{a.r.compras} compras</span>
                    </p>
                    {a.r.gasto > 0 && <MetricasEnLinea r={a.r} tope={v.tope} />}
                  </li>
                ))}
              </ul>
            </Seccion>
          </div>
        )}
      </Ventana>
    </>
  );
}
