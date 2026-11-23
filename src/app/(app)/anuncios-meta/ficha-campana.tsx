"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas de los anuncios, directo de Meta */
import { useEffect, useState, useTransition } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { horaDeMeta } from "@/lib/meta-ads/hora";
import { AnunciosIcon, CalendarioIcon, EnlaceIcon, EtiquetaIcon, FlechaAbajoIcon, FlechaArribaIcon, HistorialIcon, MargenIcon, PersonaIcon } from "@/lib/nav-icons";
import { METRICAS_CAMPANA, dolares, holdRate, nivelesDeMetricas, resultado, type ClaveMetrica, type Resultados } from "@/lib/meta-ads/metricas";
import { nombreEvento } from "@/lib/meta-ads/actividad-equipo";
import { NOMBRE_DECISION, type Decision } from "@/lib/meta-ads/decision-anuncio";
import { NOMBRE_ETAPA, type Etapa } from "@/lib/meta-ads/nombre";
import type { ActividadVista, AnuncioVista, CampanaVista } from "@/lib/meta-ads/vistas";
import { corregirCampanaMeta, obtenerActividadCampanaMeta, soltarCorreccionMeta } from "./actions";
import { NOMBRE_VEREDICTO, veredictoDe } from "./def-campanas";
import { BarraApilada } from "./graficas";
import { Cifra, entero, InsigniaEstructura, InsigniaEtapa, MetricasEnLinea, nombreEstado, porcentaje, Resultado, textoMetrica } from "./piezas";

/** El color de cada decisión: cortar en rojo, observar y rotar en ámbar, consolidar en verde. */
const TONO_DECISION: Record<Decision, Tone> = { cortar: "destructive", mantener: "neutral", observar: "warning", consolidar: "success", rebalancear: "info", rotar: "warning" };

function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button type="button" aria-label={texto} aria-disabled={!activo} onClick={() => activo && alHacerClic()} className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${activo ? "hover:bg-muted" : "cursor-default opacity-40"}`}>
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

/** La línea de apoyo de algunas cifras: el valor de las compras, lo que mantiene el video 15 s y cuántos vieron la landing. */
function apoyoDeMetrica(clave: ClaveMetrica, r: Resultados): string | undefined {
  if (clave === "compras") return r.valor > 0 ? `Valor ${dolares(r.valor)}` : undefined;
  if (clave === "hook") return holdRate(r) !== null ? `Mantienen 15 s: ${porcentaje(holdRate(r), 0)}` : undefined;
  if (clave === "cvr") return r.vioLanding > 0 ? `${entero(r.vioLanding)} vieron la landing` : undefined;
  return undefined;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0 min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

const urlSegura = (u: string | null) => (u && /^https:\/\//i.test(u) ? u : null);

function EditorEtiquetas({ c, productos }: { c: CampanaVista; productos: string[] }) {
  const { mostrarToast } = useToast();
  const [guardando, empezar] = useTransition();
  const [producto, setProducto] = useState(c.producto ?? "");
  // El ángulo que vio la IA en los videos no se guarda como corrección a mano si nadie lo toca.
  const anguloGuardado = c.anguloOrigen === "video" ? "" : (c.angulo ?? "");
  const [angulo, setAngulo] = useState(anguloGuardado);
  const [etapa, setEtapa] = useState<Etapa | "">(c.etapa ?? "");
  const cambio = producto !== (c.producto ?? "") || angulo !== anguloGuardado || etapa !== (c.etapa ?? "");
  const guardar = () =>
    empezar(async () => {
      const r = await corregirCampanaMeta(c.id, { producto, angulo, etapa });
      if (r.error) mostrarToast(r.error, "destructive");
      else mostrarToast("Guardado: la lectura de Meta ya no pisa estos datos.");
    });
  const soltar = () =>
    empezar(async () => {
      const r = await soltarCorreccionMeta(c.id, ["producto", "angulo", "etapa"]);
      if (r.error) mostrarToast(r.error, "destructive");
      else mostrarToast(r.aviso ?? "Listo.", "info");
    });
  const id = `meta-${c.id}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1" htmlFor={`${id}-producto`}>
          <span className={labelClassSm}>Producto</span>
          <input id={`${id}-producto`} list={`${id}-productos`} className={fieldClassSm} value={producto} onChange={(e) => setProducto(e.target.value)} maxLength={80} placeholder="Ej: Faja moldeadora" />
          <datalist id={`${id}-productos`}>
            {productos.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1" htmlFor={`${id}-angulo`}>
          <span className={labelClassSm}>Ángulo a mano</span>
          <input id={`${id}-angulo`} className={fieldClassSm} value={angulo} onChange={(e) => setAngulo(e.target.value)} maxLength={80} placeholder={c.anguloOrigen === "video" && c.angulo ? `Por sus videos: ${c.angulo}` : "Ej: Dolor de espalda"} />
        </label>
        <label className="flex flex-col gap-1" htmlFor={`${id}-etapa`}>
          <span className={labelClassSm}>Etapa</span>
          <select id={`${id}-etapa`} className={fieldClassSm} value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa | "")}>
            <option value="">Sin etapa</option>
            {(Object.keys(NOMBRE_ETAPA) as Etapa[]).map((e) => (
              <option key={e} value={e}>
                {NOMBRE_ETAPA[e]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={guardar} disabled={!cambio || guardando} className="min-h-8 rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        {c.manual.length > 0 && (
          <button type="button" onClick={soltar} disabled={guardando} className="min-h-8 rounded-md border border-border-control px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50">
            Volver a lo que dice el nombre
          </button>
        )}
        {c.manual.length > 0 && <span className="text-xs text-muted-foreground">Corregido a mano: {c.manual.map((m) => (m === "angulo" ? "ángulo" : m)).join(", ")}</span>}
      </div>
    </div>
  );
}

/** La mezcla de ángulos de la campaña: cada video cuenta con el ángulo que tiene, y los porcentajes suman 100. */
function MezclaDeAngulos({ c, colores }: { c: CampanaVista; colores: Map<string, string> }) {
  const sin = c.videosTotal - c.videosConAngulo;
  if (c.angulos.length === 0) {
    return (
      <p className="m-0 text-sm text-muted-foreground">
        {c.videosTotal === 0 ? "Esta campaña no tiene anuncios con video." : `Ninguno de sus ${c.videosTotal} ${c.videosTotal === 1 ? "video tiene" : "videos tienen"} ángulo todavía.`}{" "}
        {c.videosTotal > 0 && (
          <a href="/anuncios-meta/videos" className="font-medium text-foreground underline underline-offset-2">
            Analizarlos en Videos
          </a>
        )}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <BarraApilada partes={c.angulos.map((a) => ({ nombre: a.angulo, valor: a.videos, color: colores.get(a.angulo) ?? "var(--grafica-5)" }))} alto={18} conPorcentaje etiqueta={`Ángulos de la campaña: ${c.angulos.map((a) => `${a.angulo} ${a.pct} %`).join(", ")}`} />
      <ul role="list" className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
        {c.angulos.map((a) => (
          <li key={a.angulo} className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colores.get(a.angulo) ?? "var(--grafica-5)" }} />
              <span className="truncate">{a.angulo}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold">{a.pct} %</span>{" "}
              <span className="text-xs text-muted-foreground">
                {a.videos} {a.videos === 1 ? "video" : "videos"} · {dolares(a.gasto)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-muted-foreground">
        {c.videosConAngulo} de {c.videosTotal} {c.videosTotal === 1 ? "video con ángulo" : "videos con ángulo"}
        {sin > 0 ? `; ${sin} sin analizar no cuentan.` : "."} Se clasifica como «{c.angulo}»{c.anguloOrigen === "manual" ? " (corregido a mano)" : ""}.
      </p>
    </div>
  );
}

function Actividad({ id }: { id: string }) {
  const [eventos, setEventos] = useState<ActividadVista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    obtenerActividadCampanaMeta(id).then((r) => {
      if (!vigente) return;
      if (r.error) setError(r.error);
      else setEventos(r.eventos ?? []);
    });
    return () => {
      vigente = false;
    };
  }, [id]);
  if (error) return <p className="m-0 text-sm text-destructive">{error}</p>;
  if (!eventos) return <p className="m-0 text-sm text-muted-foreground">Cargando…</p>;
  if (eventos.length === 0) return <p className="m-0 text-sm text-muted-foreground">Meta no entregó cambios de esta campaña (puede faltar el permiso de actividad del acceso).</p>;
  return (
    <ol role="list" className="m-0 flex list-none flex-col gap-2 p-0">
      {eventos.map((e, i) => (
        <li key={`${e.fecha}-${i}`} className="flex flex-col text-sm">
          <span>
            <span className="font-medium">{e.actor ?? "Alguien"}</span> {nombreEvento(e.tipo).toLowerCase()}
            {e.objeto && e.tipo !== "create_campaign_group" ? ` · ${e.objeto}` : ""}
          </span>
          <span className="text-xs text-muted-foreground">
            {horaDeMeta(e.fecha)}
            {e.detalle ? ` · ${e.detalle}` : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** La ficha de una campaña: cómo le va, cómo está montada, sus etiquetas (producto, ángulo y etapa, que se pueden corregir), sus anuncios con el video y el texto, y los cambios que hizo el equipo en Meta. */
export function FichaCampana({ campana: c, colores, anuncios, actId, productos, escribe, alCerrar, anterior, siguiente }: { campana: CampanaVista | undefined; colores: Map<string, string>; anuncios: AnuncioVista[]; actId: string | null; productos: string[]; escribe: boolean; alCerrar: () => void; anterior?: () => void; siguiente?: () => void }) {
  const r = c?.r;
  const veredicto = c ? veredictoDe(c) : null;
  return (
    <Ventana
      abierto={!!c}
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        c && (
          <>
            <span className="min-w-0 break-words text-lg font-semibold">{c.nombre}</span>
            <InsigniaEtapa etapa={c.etapa} />
          </>
        )
      }
      navegacion={
        <>
          <BotonNavegar texto="Campaña anterior" icono={FlechaArribaIcon} activo={!!anterior} alHacerClic={() => anterior?.()} />
          <BotonNavegar texto="Campaña siguiente" icono={FlechaAbajoIcon} activo={!!siguiente} alHacerClic={() => siguiente?.()} />
        </>
      }
    >
      {c && r && veredicto && (
        <div className="flex flex-col divide-y divide-border px-5 py-5">
          <Seccion icono={MargenIcon} titulo="Cómo le va en el periodo">
            <p className="m-0 text-sm">
              <span className="font-medium">{NOMBRE_VEREDICTO[veredicto]}.</span> <Resultado r={r} tope={c.tope} /> estimado con un CPA tope de {dolares(c.tope)}
              {c.topeDefinido ? "" : " (el de por defecto: defínelo en Cuentas)"}.
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {METRICAS_CAMPANA.map((m) => (
                <Cifra key={m.clave} titulo={m.titulo} valor={textoMetrica(m.clave, r)} nivel={nivelesDeMetricas(r, c.etapa, c.tope)[m.clave]} apoyo={apoyoDeMetrica(m.clave, r)} />
              ))}
            </div>
            <p className="m-0 text-xs text-muted-foreground">
              Resultado = {r.compras} compras × {dolares(c.tope)} − {dolares(r.gasto)} = {dolares(resultado(r, c.tope))}
            </p>
          </Seccion>

          <Seccion icono={AnunciosIcon} titulo="Cómo está montada">
            <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-3">
              <Dato etiqueta="Tipo">
                <InsigniaEstructura estructura={c.estructura} puja={c.puja} />
              </Dato>
              <Dato etiqueta="Presupuesto diario">{c.presupuestoDiario !== null ? dolares(c.presupuestoDiario) : c.estructura === "ABO" ? "En cada conjunto" : "—"}</Dato>
              <Dato etiqueta="Estado en Meta">{nombreEstado(c.estado)}</Dato>
              <Dato etiqueta="Cuenta publicitaria">{c.cuentaNombre}</Dato>
              <Dato etiqueta="Audiencia y país">{c.mercado ?? "—"}</Dato>
              <Dato etiqueta="Tanda de videos">{c.videos ?? "—"}</Dato>
              <Dato etiqueta="Creada">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarioIcon aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                  {c.creadaEn ? horaDeMeta(c.creadaEn) : "—"}
                </span>
              </Dato>
              <Dato etiqueta="La montó">
                <span className="inline-flex items-center gap-1.5">
                  <PersonaIcon aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                  {c.persona ?? "No se sabe (ni el nombre ni Meta lo dicen)"}
                </span>
                {c.personaMeta && c.personaMeta !== c.persona && <span className="block text-xs text-muted-foreground">Creada en Meta con la sesión de {c.personaMeta}</span>}
              </Dato>
            </dl>
            {actId && (
              <a href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${actId.replace("act_", "")}&selected_campaign_ids=${c.metaId}`} target="_blank" rel="noopener noreferrer" className={`inline-flex w-fit items-center gap-1.5 text-sm underline underline-offset-2 ${anilloFoco}`}>
                <EnlaceIcon aria-hidden="true" className="h-4 w-4" />
                Abrir en el Administrador de anuncios
                <span className="sr-only"> (se abre en una pestaña nueva)</span>
              </a>
            )}
          </Seccion>

          <Seccion icono={EtiquetaIcon} titulo="De qué ángulos está hecha">
            <MezclaDeAngulos c={c} colores={colores} />
          </Seccion>

          <Seccion icono={EtiquetaIcon} titulo="Producto, ángulo y etapa">
            {escribe ? (
              <EditorEtiquetas c={c} productos={productos} />
            ) : (
              <dl className="m-0 grid grid-cols-3 gap-3">
                <Dato etiqueta="Producto">{c.producto ?? "—"}</Dato>
                <Dato etiqueta="Ángulo">{c.angulo ?? "—"}</Dato>
                <Dato etiqueta="Etapa">{c.etapa ? NOMBRE_ETAPA[c.etapa] : "—"}</Dato>
              </dl>
            )}
            {c.etapa && c.etapaMotivo && <p className="m-0 mt-2 text-xs text-muted-foreground">Etapa {NOMBRE_ETAPA[c.etapa]}: {c.etapaMotivo}</p>}
          </Seccion>

          <Seccion icono={AnunciosIcon} titulo={`Anuncios (${anuncios.length})`}>
            {anuncios.length === 0 ? (
              <p className="m-0 text-sm text-muted-foreground">Meta no entregó anuncios de esta campaña.</p>
            ) : (
              <ul role="list" className="m-0 flex list-none flex-col gap-3 p-0">
                {[...anuncios].sort((a, b) => b.r.gasto - a.r.gasto).map((a) => {
                  const mini = urlSegura(a.miniatura);
                  return (
                    <li key={a.id} className="flex gap-3 rounded-lg border border-border p-2.5">
                      {mini ? <img src={mini} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-md bg-muted object-cover" /> : <span aria-hidden="true" className="h-16 w-16 shrink-0 rounded-md bg-muted" />}
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <p className="m-0 truncate text-sm font-medium">
                          {a.numero && <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums">{a.numero}</span>}
                          {a.nombre}
                          {!a.activo && <span className="ml-2 text-xs font-normal text-muted-foreground">apagado</span>}
                        </p>
                        {a.decision && (
                          <p className="m-0 flex flex-wrap items-center gap-2 text-xs">
                            <Badge tone={TONO_DECISION[a.decision]}>{NOMBRE_DECISION[a.decision]}</Badge>
                            <span className="min-w-0 text-muted-foreground">{a.decisionMotivo}</span>
                          </p>
                        )}
                        {a.angulo && <p className="m-0 text-xs text-foreground">Ángulo: {a.angulo}</p>}
                        {a.copy && <p className="m-0 line-clamp-2 text-xs text-muted-foreground">{a.copy}</p>}
                        {a.landing && <p className="m-0 truncate text-xs text-muted-foreground">Landing: {a.landing}</p>}
                        <p className="m-0 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>{dolares(a.r.gasto)}</span>
                          <span>{a.r.compras} compras</span>
                        </p>
                        {a.r.gasto > 0 && <MetricasEnLinea r={a.r} tope={c.tope} etapa={c.etapa} completa />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Seccion>

          <Seccion icono={HistorialIcon} titulo="Cambios en Meta">
            <Actividad id={c.id} />
          </Seccion>
        </div>
      )}
    </Ventana>
  );
}
