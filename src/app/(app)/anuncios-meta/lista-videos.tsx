"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas de los videos, directo de Meta */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { ListaDatos } from "@/components/tabla/lista-datos";
import type { IconoComp } from "@/components/tabla/botones-vista";
import type { NombreFilas } from "@/lib/tabla/pie";
import { useToast } from "@/components/ui/toast";
import { BarraAvance } from "@/components/ui/barra-avance";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { EVENTO_ABRIR_VIDEO } from "./para-revisar";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { formatearFechaHora } from "@/lib/formato";
import { Ventana } from "@/components/ui/ventana";
import { Seccion } from "@/components/ui/seccion-ficha";
import { AnunciosIcon, ChevronRightIcon, EstadoIcon, EtiquetaIcon, FiltroIcon, MargenIcon, ProductoIcon, RobotIcon } from "@/lib/nav-icons";
import { confiable, cpa, ctr, dolares, holdRate, hookRate, nivelDeCpa, nivelDeCtr, nivelDeHook } from "@/lib/meta-ads/metricas";
import { CRITERIOS_VIDEO, ordenarVideos, sentidoNatural, type CriterioVideo, type Sentido } from "@/lib/meta-ads/orden-videos";
import type { VideoVista } from "@/lib/meta-ads/vistas";
import { analizarSiguienteMeta, analizarVideoAhoraMeta, corregirAnguloVideoMeta } from "./actions";
import { anguloDeVideo, DEF_VIDEOS } from "./def-videos";
import { EstructuraYLlamado } from "./estructura-video";
import { ReproductorVideo } from "./reproductor-video";
import { TarjetaVideo } from "./tarjeta-video";
import { AVISO_POCA_DATA, Cifra, entero, InsigniaEtapa, MetricasEnLinea, Nivel, porcentaje, Resultado, valorCpa } from "./piezas";

const urlSegura = (u: string | null) => (u && /^https:\/\//i.test(u) ? u : null);

const NOMBRE: NombreFilas = { singular: "video", plural: "videos" };
const ICONOS: Record<string, IconoComp> = { nombre: AnunciosIcon, campanaTexto: AnunciosIcon, angulo: EtiquetaIcon, producto: ProductoIcon, campana: AnunciosIcon, etapa: EtiquetaIcon, veredicto: MargenIcon, datos: FiltroIcon, analisis: RobotIcon, gancho: FiltroIcon, formato: FiltroIcon, ctaTipo: FiltroIcon, recurso: FiltroIcon, llegaCta: MargenIcon, activo: EstadoIcon, gasto: MargenIcon, compras: MargenIcon, cpa: MargenIcon, hook: MargenIcon, hold: MargenIcon, ctr: MargenIcon, campanas: AnunciosIcon, anuncios: AnunciosIcon };

const COLUMNAS = "lg:grid-cols-[minmax(0,3fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,1fr)_1rem]";

function EncabezadoFilas() {
  return (
    <div aria-hidden="true" className={`hidden gap-3 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid ${COLUMNAS}`}>
      <span>Video</span>
      <span className="text-right">Gasto</span>
      <span className="text-right">Compras</span>
      <span className="text-right">CPA</span>
      <span className="text-right">Hook (3 s)</span>
      <span className="text-right">Pasan 15 s</span>
      <span className="text-right">CTR</span>
      <span className="text-right">Resultado estimado</span>
      <span />
    </div>
  );
}

/** Una cifra de la fila: con su nombre a la vista en pantalla angosta (ahí no hay encabezado) y solo para lectores de pantalla en la ancha. */
function Celda({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline justify-between gap-2 text-sm tabular-nums lg:block lg:text-right">
      <span className="text-xs text-muted-foreground lg:sr-only">{t}</span>
      <span>{children}</span>
    </span>
  );
}

function FilaVideo({ x, alAbrir }: { x: VideoVista; alAbrir: () => void }) {
  const m = urlSegura(x.miniatura);
  const ok = confiable(x.r);
  const angulo = anguloDeVideo(x);
  return (
    <button type="button" onClick={alAbrir} className={`grid w-full cursor-pointer grid-cols-1 items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground ${COLUMNAS} ${ok ? "" : "text-muted-foreground"}`}>
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-zinc-600 to-zinc-800">
          {m && <img src={m} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor">
              <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.1-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
            </svg>
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-1 text-sm font-medium text-foreground">
            {x.numero && <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">{x.numero}</span>}
            {x.nombre}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {x.producto ?? "Sin producto"} · {angulo ? `Ángulo: ${angulo}${x.analisis?.estado === "sin_archivo" ? " (provisional)" : ""}` : "Ángulo sin analizar"}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            En {x.anuncios} {x.anuncios === 1 ? "anuncio" : "anuncios"} de {x.campanas} {x.campanas === 1 ? "campaña" : "campañas"}
            {ok ? "" : " · poca data"}
          </span>
        </span>
      </span>
      <Celda t="Gasto">{dolares(x.r.gasto)}</Celda>
      <Celda t="Compras">{entero(x.r.compras)}</Celda>
      <Celda t="CPA">{ok && x.r.compras > 0 ? <Nivel nivel={nivelDeCpa(cpa(x.r), x.tope)}>{valorCpa(x.r)}</Nivel> : valorCpa(x.r)}</Celda>
      <Celda t="Hook (3 s)">{hookRate(x.r) === null ? "—" : ok ? <Nivel nivel={nivelDeHook(hookRate(x.r))}>{porcentaje(hookRate(x.r), 0)}</Nivel> : porcentaje(hookRate(x.r), 0)}</Celda>
      <Celda t="Pasan 15 s">{porcentaje(holdRate(x.r), 0)}</Celda>
      <Celda t="CTR">{ok ? <Nivel nivel={nivelDeCtr(ctr(x.r))}>{porcentaje(ctr(x.r))}</Nivel> : porcentaje(ctr(x.r))}</Celda>
      <span className="lg:text-right">
        <span className="sr-only">Resultado estimado: </span>
        <Resultado r={x.r} tope={x.tope} />
      </span>
      <ChevronRightIcon aria-hidden="true" className="hidden h-4 w-4 text-muted-foreground lg:block" />
    </button>
  );
}

/** «Ordenar por» y el sentido (de mayor a menor o al revés): la barra común filtra y agrupa, pero no ordena filas. */
type VistaVideos = "tarjetas" | "lista";
const CLAVE_VISTA = "anuncios-meta-videos-vista-v1";

const oyentesDeVista = new Set<() => void>();
/** Lo elegido en esta pestaña, por si el navegador no deja guardar. */
let vistaEnMemoria: VistaVideos | null = null;
function leerVista(): VistaVideos {
  try {
    const guardada = window.localStorage.getItem(CLAVE_VISTA);
    if (guardada === "lista" || guardada === "tarjetas") return guardada;
  } catch {
    /* sin almacenamiento */
  }
  return vistaEnMemoria ?? "tarjetas";
}
/** La vista elegida, guardada en el navegador (sin almacenamiento queda en tarjetas); vale en todas las pestañas abiertas. */
function useVistaVideos(): [VistaVideos, (v: VistaVideos) => void] {
  const vista = useSyncExternalStore(
    (avisar) => {
      oyentesDeVista.add(avisar);
      window.addEventListener("storage", avisar);
      return () => {
        oyentesDeVista.delete(avisar);
        window.removeEventListener("storage", avisar);
      };
    },
    leerVista,
    () => "tarjetas" as VistaVideos,
  );
  const elegir = (v: VistaVideos) => {
    vistaEnMemoria = v;
    try {
      window.localStorage.setItem(CLAVE_VISTA, v);
    } catch {
      /* no pasa nada: solo no se recuerda */
    }
    oyentesDeVista.forEach((f) => f());
  };
  return [vista, elegir];
}

function OrdenDeVideos({ criterio, sentido, alCambiar, vista, alElegirVista }: { criterio: CriterioVideo; sentido: Sentido; alCambiar: (c: CriterioVideo, s: Sentido) => void; vista: VistaVideos; alElegirVista: (v: VistaVideos) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Ordenar por</span>
        <select value={criterio} onChange={(e) => alCambiar(e.target.value as CriterioVideo, sentidoNatural(e.target.value as CriterioVideo))} className={`${fieldClassSm} w-auto min-w-[14rem]`}>
          {CRITERIOS_VIDEO.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => alCambiar(criterio, sentido === "asc" ? "desc" : "asc")}
        aria-label={`Cambiar el orden: ahora va de ${sentido === "asc" ? "menor a mayor" : "mayor a menor"}`}
        className="min-h-8 rounded-md border border-border-control bg-card px-3 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        {criterio === "nombre" ? (sentido === "asc" ? "A → Z" : "Z → A") : sentido === "asc" ? "De menor a mayor ↑" : "De mayor a menor ↓"}
      </button>
      <div role="group" aria-label="Cómo ver los videos" className="ml-auto flex overflow-hidden rounded-md border border-border-control">
        {(["tarjetas", "lista"] as const).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={vista === o}
            onClick={() => alElegirVista(o)}
            className={`min-h-8 px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground ${vista === o ? "bg-foreground text-background" : "bg-card hover:bg-muted"}`}
          >
            {o === "tarjetas" ? "Tarjetas" : "Lista"}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Los videos con gasto en el periodo elegido, cada uno una sola vez, con la barra común (buscar, filtrar y agrupar por ángulo, producto, campaña, etapa…) y un orden a elegir (gasto, CPA, hook…, ascendente o
 * descendente). Tocar uno abre su ficha: en qué anuncios y campañas se usa y cómo le fue en cada una; queda en la dirección (`?abrir=<id>`).
 */
export function ListaVideos({ videos, escribe, iaConectada, sinAnalizar, abrirInicial }: { videos: VideoVista[]; escribe: boolean; iaConectada: boolean; sinAnalizar: number; abrirInicial: string | null }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState<string | null>(() => (abrirInicial && videos.some((x) => x.id === abrirInicial) ? abrirInicial : null));
  const [criterio, setCriterio] = useState<CriterioVideo>("mejor");
  const [sentido, setSentido] = useState<Sentido>("asc");
  // Cómo se ven los videos (tarjetas o lista): lo elige cada persona y se recuerda en su navegador.
  const [vista, elegirVista] = useVistaVideos();
  // «Reproducir» desde una tarjeta abre la ficha y arranca el video; abrir la ficha con un clic en el cuerpo no lo arranca.
  const [reproducirAlAbrir, setReproducirAlAbrir] = useState(false);
  const abrirVideo = (id: string, reproducir: boolean) => {
    setReproducirAlAbrir(reproducir);
    setAbierto(id);
  };
  const ordenados = ordenarVideos(videos, criterio, sentido);
  // «Abrir este video» de «Para revisar» (arriba, en el resumen) pide abrir la ficha de ese video sin recargar la página.
  useEffect(() => {
    const abrirDesdeResumen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === "string") abrirVideo(id, false);
    };
    window.addEventListener(EVENTO_ABRIR_VIDEO, abrirDesdeResumen);
    return () => window.removeEventListener(EVENTO_ABRIR_VIDEO, abrirDesdeResumen);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (abierto) url.searchParams.set("abrir", abierto);
    else url.searchParams.delete("abrir");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [abierto]);
  // La ficha se dibuja en `<body>` (portal): con `?abrir=` arranca abierta, así que solo se monta ya en el navegador.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const v = enNavegador ? videos.find((x) => x.id === abierto) : undefined;
  const hayPocaData = videos.some((x) => !confiable(x.r));
  // «Analizar los pendientes»: de a un video por llamada, para mostrar el avance real y poder detenerlo. Lo ya analizado queda guardado.
  const [avance, setAvance] = useState<{ hecho: number; total: number; texto: string; terminado: boolean } | null>(null);
  const parar = useRef(false);
  const [deteniendo, setDeteniendo] = useState(false);
  const analizando = !!avance && !avance.terminado;
  const analizarPendientes = async () => {
    parar.current = false;
    setDeteniendo(false);
    const cuenta = { completo: 0, provisional: 0, error: 0 };
    let total = 0;
    let hecho = 0;
    let ultimoError = "";
    const vistos = new Set<string>();
    setAvance({ hecho: 0, total: Math.max(1, sinAnalizar), texto: "Buscando el siguiente video…", terminado: false });
    while (!parar.current) {
      const r = await analizarSiguienteMeta();
      if (r.error) {
        mostrarToast(r.error, "destructive");
        break;
      }
      if (r.ninguno || !r.videoId || vistos.has(r.videoId)) break;
      vistos.add(r.videoId);
      if (total === 0) total = Math.max(sinAnalizar, r.faltan ?? 1);
      hecho++;
      if (r.estado === "analizado") cuenta.completo++;
      else if (r.estado === "sin_archivo") cuenta.provisional++;
      else {
        cuenta.error++;
        ultimoError = r.mensaje ?? "";
      }
      const faltan = Math.max(0, (r.faltan ?? 1) - 1);
      total = Math.max(total, hecho + faltan);
      setAvance({ hecho, total, texto: faltan > 0 ? "Viendo el siguiente video con la IA…" : "Terminando…", terminado: false });
      if (faltan === 0) break;
    }
    setAvance(hecho > 0 ? { hecho, total: Math.max(total, hecho), texto: "", terminado: true } : null);
    if (hecho > 0) {
      mostrarToast(`${hecho} ${hecho === 1 ? "video" : "videos"}: ${cuenta.completo} con el video completo${cuenta.provisional ? `, ${cuenta.provisional} solo con el texto (Meta no dio el archivo)` : ""}${cuenta.error ? `, ${cuenta.error} con error: ${ultimoError}` : ""}${parar.current ? ". Detenido: lo hecho queda guardado." : "."}`, cuenta.error ? "destructive" : "success");
      router.refresh();
    } else if (!parar.current) mostrarToast("No hay videos pendientes.");
  };
  return (
    <>
      {escribe && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <p className="m-0 flex items-center gap-2 text-sm">
            <RobotIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            {!iaConectada ? "Falta conectar Gemini (GEMINI_API_KEY) para que la IA vea los videos." : sinAnalizar === 0 ? "La IA ya vio todos los videos de este periodo." : `${sinAnalizar} ${sinAnalizar === 1 ? "video de este periodo falta" : "videos de este periodo faltan"} por analizar con IA (de más a menos gasto).`}
          </p>
          {iaConectada && (
            <div className="flex flex-col items-end gap-1">
              <button type="button" onClick={analizarPendientes} disabled={analizando} className="min-h-9 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50">
                {analizando ? "Analizando…" : "Analizar los pendientes"}
              </button>
              <span className="text-xs text-muted-foreground">Revisa todo el historial leído. El sistema también los va analizando solo, cada 10 minutos.</span>
            </div>
          )}
        </div>
      )}
      {avance && (
        <BarraAvance
          hecho={avance.hecho}
          total={avance.total}
          texto={avance.texto}
          unidad="videos"
          etiqueta="Avance del análisis de videos"
          terminado={avance.terminado}
          deteniendo={deteniendo}
          alDetener={() => {
            parar.current = true;
            setDeteniendo(true);
          }}
        />
      )}
      <OrdenDeVideos
        criterio={criterio}
        sentido={sentido}
        alCambiar={(c, s) => {
          setCriterio(c);
          setSentido(s);
        }}
        vista={vista}
        alElegirVista={elegirVista}
      />
      <ListaDatos
        def={DEF_VIDEOS}
        filas={ordenados}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(x) => x.id}
        variante={vista === "tarjetas" ? "rejilla" : "filas"}
        encabezado={vista === "lista" ? <EncabezadoFilas /> : undefined}
        renderFila={(x, enOrden) =>
          vista === "tarjetas" ? <TarjetaVideo x={x} posicion={enOrden.indexOf(x) + 1} alAbrir={() => abrirVideo(x.id, false)} alReproducir={() => abrirVideo(x.id, true)} /> : <FilaVideo x={x} alAbrir={() => abrirVideo(x.id, true)} />
        }
        vacio="Todavía no hay videos con gasto en este periodo."
      />
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
            <div className="pb-5">
              <ReproductorVideo key={v.id} videoId={v.id} miniatura={v.miniatura} duracion={v.analisis?.duracionS ?? null} titulo={v.nombre} autoReproducir={reproducirAlAbrir} />
            </div>
            <Seccion icono={MargenIcon} titulo="Cómo le fue en el periodo">
              <p className="m-0 text-sm text-muted-foreground">
                {v.producto ?? "Sin producto"}
                {v.angulo ? ` · ángulo ${v.angulo}` : ""}
              </p>
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
            {v.analisis?.estado === "analizado" && (
              <Seccion icono={FiltroIcon} titulo="Estructura y llamado a la acción">
                <EstructuraYLlamado v={v} />
              </Seccion>
            )}
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
  const [viendo, setViendo] = useState(false);
  // Sin `useTransition`: en una transición asíncrona los cambios de estado de antes del `await` no se ven hasta que termina, y la barra de avance nunca salía.
  const analizar = async () => {
    setViendo(true);
    try {
      const r = await analizarVideoAhoraMeta(v.id);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(r.mensaje ?? "Listo.");
        router.refresh();
      }
    } finally {
      setViendo(false);
    }
  };
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
            {a.gancho && (
              <Fila t="Gancho (primeros 3 segundos)">
                {a.gancho}
                {a.ganchoTipo && <span className="ml-2 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">{a.ganchoTipo}</span>}
              </Fila>
            )}
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
      {viendo && <ProgresoEstimado compacta etiqueta="Analizando el video con la IA" estimadoMs={60_000} pasos={["Bajando el video de Meta", "La IA está viendo y escuchando el video", "Guardando el análisis"]} />}
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
            <button type="button" disabled={trabajando || viendo || angulo.trim() === (a?.angulo ?? "")} onClick={guardarAngulo} className="min-h-8 rounded-md border border-border-control bg-card px-3 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50">
              Guardar
            </button>
          </div>
          {iaConectada && (
            <button type="button" disabled={trabajando || viendo} onClick={analizar} className="min-h-9 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50">
              {viendo ? "Viendo el video…" : a && a.estado === "analizado" ? "Volver a analizar con IA" : "Analizar con IA"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
