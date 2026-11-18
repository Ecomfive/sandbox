"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas de los videos, directo de Meta */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { formatearFechaHora } from "@/lib/formato";
import { Ventana } from "@/components/ui/ventana";
import { Seccion } from "@/components/ui/seccion-ficha";
import { AnunciosIcon, EtiquetaIcon, MargenIcon, RobotIcon } from "@/lib/nav-icons";
import { confiable, cpa, ctr, dolares, holdRate, hookRate, nivelDeCpa, nivelDeCtr, nivelDeHook } from "@/lib/meta-ads/metricas";
import type { VideoVista } from "@/lib/meta-ads/vistas";
import { analizarPendientesMeta, analizarVideoAhoraMeta, corregirAnguloVideoMeta } from "./actions";
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
export function ListaVideos({ videos, escribe, iaConectada, sinAnalizar }: { videos: VideoVista[]; escribe: boolean; iaConectada: boolean; sinAnalizar: number }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [trabajando, empezar] = useTransition();
  const [abierto, setAbierto] = useState<string | null>(null);
  const v = videos.find((x) => x.id === abierto);
  const hayPocaData = videos.some((x) => !confiable(x.r));
  const mini = urlSegura(v?.miniatura ?? null);
  const analizarPendientes = () =>
    empezar(async () => {
      const r = await analizarPendientesMeta();
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        const hechos = (r.analizados ?? 0) + (r.sinArchivo ?? 0);
        mostrarToast(`${hechos} ${hechos === 1 ? "video analizado" : "videos analizados"}${r.sinArchivo ? ` (${r.sinArchivo} solo con el texto porque Meta no dio el archivo)` : ""}${r.errores ? `, ${r.errores} con error: ${r.mensajes?.[0] ?? ""}` : ""}${r.faltan ? `. Faltan ${r.faltan}: pulsa otra vez.` : "."}`, r.errores ? "destructive" : "success");
        router.refresh();
      }
    });
  return (
    <>
      {escribe && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <p className="m-0 flex items-center gap-2 text-sm">
            <RobotIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            {!iaConectada ? "Falta conectar Gemini (GEMINI_API_KEY) para que la IA vea los videos." : sinAnalizar === 0 ? "La IA ya vio todos los videos con gasto." : `${sinAnalizar} ${sinAnalizar === 1 ? "video falta" : "videos faltan"} por analizar con IA (de más a menos gasto).`}
          </p>
          {iaConectada && sinAnalizar > 0 && (
            <button type="button" onClick={analizarPendientes} disabled={trabajando} className="min-h-9 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50">
              {trabajando ? "Viendo los videos… puede tardar unos minutos" : "Analizar los pendientes"}
            </button>
          )}
        </div>
      )}
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
                    <span className="truncate text-xs text-muted-foreground">{x.producto ?? "Sin producto"}</span>
                    <span className="truncate text-xs">
                      {x.analisis?.angulo ? (
                        <span className="font-medium">
                          Ángulo: {x.analisis.angulo}
                          {x.analisis.estado === "sin_archivo" && <span className="font-normal text-muted-foreground"> (provisional)</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Ángulo sin analizar</span>
                      )}
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
            <Seccion icono={RobotIcon} titulo="Lo que vio la IA">
              <AnalisisIA v={v} escribe={escribe} iaConectada={iaConectada} />
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

function Fila({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{t}</dt>
      <dd className="m-0 break-words text-sm">{children}</dd>
    </div>
  );
}

/** Lo que Gemini vio en el video (ángulo, promesa, gancho, lo que dice y a quién le habla), con el ángulo corregible y el botón para analizarlo o volver a hacerlo. */
function AnalisisIA({ v, escribe, iaConectada }: { v: VideoVista; escribe: boolean; iaConectada: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [trabajando, empezar] = useTransition();
  const a = v.analisis;
  const [angulo, setAngulo] = useState(a?.angulo ?? "");
  const analizar = () =>
    empezar(async () => {
      const r = await analizarVideoAhoraMeta(v.id);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(r.mensaje ?? "Listo.");
        router.refresh();
      }
    });
  const guardarAngulo = () =>
    empezar(async () => {
      const r = await corregirAnguloVideoMeta(v.id, angulo);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(angulo.trim() ? "Ángulo guardado: un nuevo análisis ya no lo cambia." : "Ángulo quitado.");
        router.refresh();
      }
    });
  return (
    <div className="flex flex-col gap-3">
      {a && a.estado !== "error" ? (
        <>
          {a.estado === "sin_archivo" && <p className="m-0 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">La IA no vio el video: Meta no entregó el archivo ({a.error ?? "sin permiso"}). Se analizó solo el texto del anuncio y la miniatura, así que el ángulo es provisional.</p>}
          <dl className="m-0 flex flex-col gap-3">
            <Fila t="Ángulo">
              <span className="font-medium">{a.angulo ?? "—"}</span>
              {a.anguloManual && <span className="ml-2 text-xs text-muted-foreground">corregido a mano</span>}
            </Fila>
            {a.promesa && <Fila t="Promesa">{a.promesa}</Fila>}
            {a.gancho && <Fila t="Gancho (primeros 3 segundos)">{a.gancho}</Fila>}
            {a.resumen && <Fila t="De qué trata">{a.resumen}</Fila>}
            {a.publico && <Fila t="A quién le habla">{a.publico}</Fila>}
            {a.formato && <Fila t="Formato">{a.formato}</Fila>}
          </dl>
          {a.transcripcion && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-medium underline-offset-2 hover:underline">Lo que dice el video</summary>
              <p className="m-0 mt-1.5 whitespace-pre-line text-muted-foreground">{a.transcripcion}</p>
            </details>
          )}
          <p className="m-0 text-xs text-muted-foreground">
            Analizado el {formatearFechaHora(a.analizadoEn)}
            {a.duracionS ? ` · ${a.duracionS} s` : ""}
          </p>
        </>
      ) : (
        <p className="m-0 text-sm text-muted-foreground">{a?.estado === "error" ? `El último intento falló: ${a.error ?? "sin detalle"}.` : "La IA todavía no vio este video."}</p>
      )}
      {escribe && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <span className={labelClassSm}>
                <EtiquetaIcon aria-hidden="true" className="mr-1 inline h-3 w-3" />
                Corregir el ángulo
              </span>
              <input className={fieldClassSm} value={angulo} onChange={(e) => setAngulo(e.target.value)} maxLength={60} placeholder="Ej: Dolor de espalda" />
            </label>
            <button type="button" disabled={trabajando || angulo.trim() === (a?.angulo ?? "")} onClick={guardarAngulo} className="min-h-8 rounded-md border border-border-control bg-card px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50">
              Guardar
            </button>
          </div>
          {iaConectada && (
            <button type="button" disabled={trabajando} onClick={analizar} className="min-h-9 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50">
              {trabajando ? "Viendo el video… puede tardar un minuto" : a && a.estado === "analizado" ? "Volver a analizar con IA" : "Analizar con IA"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
