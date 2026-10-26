"use client";

/* eslint-disable @next/next/no-img-element -- imágenes de Storage */
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, fieldClassSm } from "@/components/ui/field";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { useToast } from "@/components/ui/toast";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { Ventana } from "@/components/ui/ventana";
import { CheckIcon, CopiarIcon, EstadoIcon, EtiquetaIcon, InteligenciaIcon, ListaIcon, SugerenciaIcon } from "@/lib/nav-icons";
import { etiquetaTipoFoto, type AccionAnalisis, type Impacto, type TipoIA } from "@/lib/publicaciones/ia/asistente";
import { chequearTitulo } from "@/lib/publicaciones/ia/criterios";
import { conTexto, LIMITES_TEXTO } from "@/lib/publicaciones/ia/fotos-base";
import { medirDescripcion } from "@/lib/publicaciones/descripcion-dropi";
import { descripcionAHtml } from "@/lib/publicaciones/descripcion-dropi";
import type { EstadoRevision } from "@/lib/publicaciones/optimizacion";
import {
  analizarPublicacionIA,
  aprobarFotosIA,
  elegirDescripcionIA,
  elegirTituloIA,
  estadoAsistenteIA,
  generarFotoIA,
  obtenerAsistenteIA,
  planearFotosIA,
  proponerTextoIA,
  proponerTitulosIA,
  valorarIA,
  type AsistenteVista,
  type EstadoIA,
  type GuardadoIA,
} from "./ia-actions";

type Pestana = "analisis" | "titulos" | "texto" | "fotos";
type Icono = ComponentType<{ className?: string }>;

const botonNeon = `boton-neon inline-flex h-10 items-center justify-center gap-2 border border-transparent px-4 text-sm font-medium text-white disabled:pointer-events-none disabled:opacity-40 ${anilloFoco} !rounded-md`;
// «Resolver con IA» de las recomendaciones: el mismo morado difuminado del «Asistente de IA», a la altura de los otros botones de la tarjeta.
const botonNeonChico = `boton-neon inline-flex h-9 items-center justify-center gap-1.5 border border-transparent px-3 text-sm font-medium text-white disabled:pointer-events-none disabled:opacity-40 ${anilloFoco} !rounded-md`;
const botonChico = `inline-flex h-8 items-center gap-1.5 rounded-md border border-border-control bg-card px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" });

function ImagenIcono({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m21 16-5-5-8 9" />
    </svg>
  );
}

const PESTANAS: { id: Pestana; etiqueta: string; icono: Icono; revisiones: string[] }[] = [
  { id: "analisis", etiqueta: "Análisis", icono: InteligenciaIcon, revisiones: [] },
  { id: "titulos", etiqueta: "Título", icono: EtiquetaIcon, revisiones: ["titulo_espanol", "titulo_largo", "titulo_cantidad", "titulo_angulo", "titulo_formato"] },
  { id: "texto", etiqueta: "Descripción", icono: ListaIcon, revisiones: ["descripcion"] },
  { id: "fotos", etiqueta: "Fotos", icono: ImagenIcono, revisiones: ["fotos"] },
];

const PESTANA_DE: Record<TipoIA, Pestana> = { analisis: "analisis", titulos: "titulos", texto: "texto", fotos: "fotos" };
const PESTANA_DE_ACCION: Partial<Record<AccionAnalisis, Pestana>> = { titulo: "titulos", descripcion: "texto", angulos: "texto", fotos: "fotos" };

/**
 * «Resolver con IA» en una recomendación de optimización (o «Asistente de IA» en la ficha): abre el asistente de esa publicación. Revisa
 * la publicación con las reglas del sistema y propone títulos, descripción, ángulos de venta y fotos; lo generado se guarda y se sube a
 * Dropi a mano. `tipo` dice con qué pestaña se abre.
 */
export function BotonAsistenteIA({ publicacionId, tipo = "analisis", principal = false }: { publicacionId: string; tipo?: TipoIA; principal?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={principal ? botonNeon : botonNeonChico} onClick={() => setAbierto(true)}>
        <SugerenciaIcon aria-hidden="true" className="h-4 w-4" />
        {principal ? "Asistente de IA" : "Resolver con IA"}
      </button>
      {abierto && <PanelAsistente publicacionId={publicacionId} inicial={PESTANA_DE[tipo]} alCerrar={() => setAbierto(false)} />}
    </>
  );
}

function PanelAsistente({ publicacionId, inicial, alCerrar }: { publicacionId: string; inicial: Pestana; alCerrar: () => void }) {
  const [estado, setEstado] = useState<EstadoIA | null>(null);
  const [vista, setVista] = useState<AsistenteVista | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    Promise.all([estadoAsistenteIA(), obtenerAsistenteIA(publicacionId)])
      .then(([e, v]) => {
        if (!vigente) return;
        setEstado(e);
        if ("error" in v) setError(v.error);
        else setVista(v);
      })
      .catch(() => vigente && setError("No se pudo abrir el asistente."));
    return () => {
      vigente = false;
    };
  }, [publicacionId]);

  return (
    <Ventana
      abierto
      alCerrar={alCerrar}
      lado="centro"
      ancho="xl"
      titulo={
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="boton-neon flex h-7 w-7 items-center justify-center rounded-lg text-white">
            <SugerenciaIcon className="h-4 w-4" />
          </span>
          Asistente de IA
        </span>
      }
    >
      {error && (
        <p role="alert" className="m-5 text-sm text-destructive">
          {error}
        </p>
      )}
      {!error && (!estado || !vista) && <Esqueleto />}
      {!error && estado && vista && <ContenidoAsistente publicacionId={publicacionId} inicial={inicial} estado={estado} vista={vista} />}
    </Ventana>
  );
}

function Esqueleto() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4 p-6">
      <div className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      <div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-48 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      </div>
      <span className="sr-only">Cargando el asistente…</span>
    </div>
  );
}

// --- Encabezado, pestañas y piezas comunes -----------------------------------------------------------------------------

function AnilloNota({ cumple, total }: { cumple: number; total: number }) {
  const fraccion = total ? cumple / total : 0;
  const r = 22;
  const c = 2 * Math.PI * r;
  const completo = total > 0 && cumple === total;
  return (
    <div role="img" aria-label={`${cumple} de ${total} puntos cumplidos`} className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <svg viewBox="0 0 56 56" aria-hidden="true" className="absolute inset-0 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={completo ? "var(--success)" : "var(--primario)"} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - fraccion)} />
      </svg>
      <span className="text-sm font-semibold tabular-nums">
        {cumple}
        <span className="text-xs font-normal text-muted-foreground">/{total}</span>
      </span>
    </div>
  );
}

function Estatus({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-warning"}`} />
      {texto}
    </span>
  );
}

function Encabezado({ vista, estado }: { vista: AsistenteVista; estado: EstadoIA }) {
  const c = vista.contexto;
  const [ampliada, setAmpliada] = useState(false);
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border px-6 py-5" style={{ backgroundImage: "linear-gradient(135deg, var(--primario-suave), var(--card) 75%)" }}>
      {c.fotoUrl ? (
        // Un clic la abre en grande, para leer la etiqueta (pedido de Alcides, 25 oct 2026).
        <button type="button" onClick={() => setAmpliada(true)} aria-label={`Ver en grande la foto de ${c.nombre}`} className={`shrink-0 rounded-xl ${anilloFoco}`}>
          <img src={c.fotoUrl} alt="" className="h-16 w-16 rounded-xl border border-border bg-card object-cover shadow-sm hover:opacity-90" />
        </button>
      ) : (
        <span aria-hidden="true" className="h-16 w-16 shrink-0 rounded-xl border border-dashed border-border-control bg-card" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase tabular-nums">{c.numero}</span>
        <h3 className="m-0 truncate text-lg font-semibold">{c.nombre}</h3>
        <div className="flex flex-wrap gap-2">
          <Estatus ok={estado.texto} texto={estado.texto ? `${estado.proveedor} · ${estado.modelo}` : "Sin IA de texto conectada"} />
          <Estatus ok={estado.gemini} texto={estado.gemini ? "Gemini · fotos" : "Sin Gemini para fotos"} />
          {c.indicaciones > 0 && <Estatus ok texto={`${c.indicaciones} ${c.indicaciones === 1 ? "indicación" : "indicaciones"} del equipo`} />}
          {c.ejemplos > 0 && <Estatus ok texto={`${c.ejemplos} ${c.ejemplos === 1 ? "título del equipo" : "títulos del equipo"} de ejemplo`} />}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right text-xs text-muted-foreground">
          <span className="block font-medium text-foreground">Optimización</span>
          en Dropi
        </div>
        <AnilloNota cumple={c.nota.cumple} total={c.nota.total} />
      </div>
      <VisorImagen src={ampliada ? c.fotoUrl : null} alt={c.nombre} onClose={() => setAmpliada(false)} />
    </header>
  );
}

function ContenidoAsistente({ publicacionId, inicial, estado, vista }: { publicacionId: string; inicial: Pestana; estado: EstadoIA; vista: AsistenteVista }) {
  const [pestana, setPestana] = useState<Pestana>(inicial);
  const mal = (p: (typeof PESTANAS)[number]) => vista.contexto.revisiones.some((r) => p.revisiones.includes(r.clave) && (r.estado === "falta" || r.estado === "revisar"));

  function teclas(e: React.KeyboardEvent) {
    const i = PESTANAS.findIndex((p) => p.id === pestana);
    const ir = (k: number) => {
      e.preventDefault();
      const nueva = PESTANAS[(k + PESTANAS.length) % PESTANAS.length].id;
      setPestana(nueva);
      requestAnimationFrame(() => document.getElementById(`asistente-pestana-${nueva}`)?.focus());
    };
    if (e.key === "ArrowRight") ir(i + 1);
    else if (e.key === "ArrowLeft") ir(i - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(PESTANAS.length - 1);
  }

  return (
    <div className="@container flex flex-col">
      <Encabezado vista={vista} estado={estado} />
      {estado.avisos.map((a) => (
        <p key={a.proveedor} role="alert" className={`m-0 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-6 py-2.5 text-sm font-medium ${a.agotado ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning"}`}>
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${a.agotado ? "bg-destructive" : "bg-warning"}`} />
          {a.agotado ? `El crédito de ${a.proveedor} se agotó.` : `El crédito de ${a.proveedor} está por acabarse${a.saldoUsd !== null ? `: quedan unos $${a.saldoUsd.toFixed(2)}` : ""}.`}
          <a href="/publicaciones-dropi/consumo" className={`underline underline-offset-2 ${anilloFoco}`}>
            Ver consumo
          </a>
        </p>
      ))}
      <div role="tablist" aria-label="Qué mejorar" onKeyDown={teclas} className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex shrink-0 gap-0.5 overflow-x-auto border-b border-border bg-card px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PESTANAS.map((p) => {
          const activa = pestana === p.id;
          const Ico = p.icono;
          return (
            <button
              key={p.id}
              id={`asistente-pestana-${p.id}`}
              type="button"
              role="tab"
              aria-selected={activa}
              aria-controls={`asistente-panel-${p.id}`}
              tabIndex={activa ? 0 : -1}
              onClick={() => setPestana(p.id)}
              className={`relative flex shrink-0 items-center gap-1.5 px-2.5 py-3 text-sm font-medium transition-colors ${anilloFoco} ${activa ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Ico className="h-4 w-4" />
              {p.etiqueta}
              {mal(p) && <span role="img" aria-label="Tiene algo por mejorar" className="h-2 w-2 rounded-full bg-warning" />}
              {activa && <span aria-hidden="true" className="barra-neon absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
            </button>
          );
        })}
      </div>
      <div id={`asistente-panel-${pestana}`} role="tabpanel" aria-labelledby={`asistente-pestana-${pestana}`} className="flex shrink-0 flex-col gap-5 p-6">
        {pestana === "analisis" && <PanelAnalisis publicacionId={publicacionId} estado={estado} vista={vista} ir={setPestana} />}
        {pestana === "titulos" && <PanelTitulos publicacionId={publicacionId} estado={estado} vista={vista} />}
        {pestana === "texto" && <PanelTexto publicacionId={publicacionId} estado={estado} vista={vista} />}
        {pestana === "fotos" && <PanelFotos publicacionId={publicacionId} estado={estado} vista={vista} />}
      </div>
    </div>
  );
}

function Tarjeta({ icono: Ico, titulo, derecha, children }: { icono?: Icono; titulo: string; derecha?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h4 className="m-0 flex items-center gap-2 text-sm font-semibold">
          {Ico && (
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-primario-suave text-primario">
              <Ico className="h-4 w-4" />
            </span>
          )}
          {titulo}
        </h4>
        {derecha}
      </div>
      {children}
    </section>
  );
}

function SinClave({ cual }: { cual: string }) {
  return (
    <p role="status" className="m-0 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
      Falta conectar {cual}
    </p>
  );
}

function AvisoError({ texto }: { texto: string | null }) {
  return texto ? (
    <p role="alert" className="m-0 rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
      {texto}
    </p>
  ) : null;
}

/** La etiqueta que avisa que lo que se ve lo escribió una IA, con quién y cuándo. */
function EtiquetaIA({ g }: { g: GuardadoIA<unknown> }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <SugerenciaIcon aria-hidden="true" className="h-3.5 w-3.5 text-primario" />
      Generado con IA{g.modelo ? ` · ${g.modelo}` : ""} · {g.por ? `${g.por}, ` : ""}
      {fechaHora(g.creadoEn)}
    </span>
  );
}

/** «¿Te sirvió?»: lo que el equipo responde queda guardado y la IA lo tiene en cuenta en los siguientes pedidos. */
function Valoracion({ g }: { g: GuardadoIA<unknown> }) {
  const { mostrarToast } = useToast();
  const [util, setUtil] = useState<boolean | null>(g.feedback?.util ?? null);
  const [nota, setNota] = useState(g.feedback?.nota ?? "");
  const [explicando, setExplicando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function enviar(u: boolean, n: string) {
    setGuardando(true);
    const r = await valorarIA(g.id, u, n).catch(() => ({ error: "No se pudo guardar." }));
    setGuardando(false);
    if (r.error) return mostrarToast(r.error, "destructive");
    setUtil(u);
    setExplicando(false);
    mostrarToast(u ? "Gracias: la IA lo tendrá en cuenta" : "Anotado: la IA lo evitará");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
      <span className="text-muted-foreground">¿Te sirvió?</span>
      <button type="button" aria-pressed={util === true} disabled={guardando} className={`${botonChico} ${util === true ? "!border-success !bg-success-soft !text-success" : ""}`} onClick={() => enviar(true, "")}>
        Sí
      </button>
      <button type="button" aria-pressed={util === false} disabled={guardando} className={`${botonChico} ${util === false ? "!border-destructive !bg-destructive-soft !text-destructive" : ""}`} onClick={() => setExplicando(true)}>
        No
      </button>
      {util === false && !explicando && g.feedback?.nota && <span className="text-xs text-muted-foreground">«{g.feedback.nota}»</span>}
      {explicando && (
        <span className="flex w-full flex-wrap items-center gap-2">
          <input
            autoFocus
            value={nota}
            maxLength={400}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") enviar(false, nota);
              if (e.key === "Escape") {
                e.stopPropagation();
                setExplicando(false);
              }
            }}
            aria-label="Por qué no te sirvió"
            placeholder="Ej: suena a promesa médica, muy largo…"
            className={`${fieldClass} min-w-0 flex-1`}
          />
          <button type="button" disabled={guardando} className={botonChico} onClick={() => enviar(false, nota)}>
            Guardar
          </button>
        </span>
      )}
    </div>
  );
}

// --- Análisis ----------------------------------------------------------------------------------------------------------

const MARCA: Record<EstadoRevision, { texto: string; clase: string }> = {
  ok: { texto: "Cumple", clase: "bg-success-soft text-success" },
  falta: { texto: "Falta", clase: "bg-destructive-soft text-destructive" },
  revisar: { texto: "Revisar", clase: "bg-warning-soft text-warning" },
  sin_datos: { texto: "Sin datos", clase: "bg-muted text-muted-foreground" },
  no_aplica: { texto: "No aplica", clase: "bg-muted text-muted-foreground" },
};

const IMPACTO: Record<Impacto, { texto: string; franja: string; clase: string }> = {
  alto: { texto: "Impacto alto", franja: "bg-destructive", clase: "bg-destructive-soft text-destructive" },
  medio: { texto: "Impacto medio", franja: "bg-warning", clase: "bg-warning-soft text-warning" },
  bajo: { texto: "Impacto bajo", franja: "bg-azul", clase: "bg-azul-soft text-azul" },
};

function PanelAnalisis({ publicacionId, estado, vista, ir }: { publicacionId: string; estado: EstadoIA; vista: AsistenteVista; ir: (p: Pestana) => void }) {
  const [actual, setActual] = useState(vista.analisis);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analizar() {
    setError(null);
    setTrabajando(true);
    const r = await analizarPublicacionIA(publicacionId).catch(() => ({ error: "No se pudo analizar. Inténtalo de nuevo." }) as { error: string; guardado?: undefined });
    setTrabajando(false);
    if (r.error) setError(r.error);
    else if (r.guardado) setActual(r.guardado);
  }

  const a = actual?.resultado;
  return (
    <div className="grid gap-5 @3xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Tarjeta icono={EstadoIcon} titulo="Revisión del sistema">
        <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {vista.contexto.revisiones.map((r) => (
            <li key={r.clave} className="flex items-start justify-between gap-3 py-2 text-sm">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{r.etiqueta}</span>
                <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{r.detalle}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${MARCA[r.estado].clase}`}>{MARCA[r.estado].texto}</span>
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta icono={SugerenciaIcon} titulo="Análisis con IA" derecha={actual && !trabajando ? <EtiquetaIA g={actual} /> : undefined}>
        {!estado.texto && <SinClave cual="una IA de texto (OpenAI o Claude)" />}
        <div>
          <button type="button" className={botonNeon} disabled={!estado.texto || trabajando} onClick={analizar}>
            <SugerenciaIcon aria-hidden="true" className="h-4 w-4" />
            {a ? "Analizar de nuevo" : "Analizar con IA"}
          </button>
        </div>
        {trabajando && <ProgresoEstimado etiqueta="Analizando la publicación" estimadoMs={60_000} pasos={["Revisando las reglas y los números", "Mirando la foto y la competencia", "Ordenando lo que más conviene mejorar"]} />}
        <AvisoError texto={error} />
        {a && !trabajando && (
          <div className="flex flex-col gap-4">
            {a.resumen && (
              <p className="m-0 flex gap-2.5 rounded-xl bg-primario-suave px-3.5 py-3 text-sm leading-relaxed">
                <SugerenciaIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primario" />
                <span>{a.resumen}</span>
              </p>
            )}
            {a.prioridades.length > 0 && (
              <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                {a.prioridades.map((p, i) => {
                  const destino = PESTANA_DE_ACCION[p.accion];
                  return (
                    <li key={`${i}-${p.titulo}`} className="flex overflow-hidden rounded-xl border border-border">
                      <span aria-hidden="true" className={`w-1.5 shrink-0 ${IMPACTO[p.impacto].franja}`} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
                          <span className="text-sm font-semibold">{p.titulo}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${IMPACTO[p.impacto].clase}`}>{IMPACTO[p.impacto].texto}</span>
                        </div>
                        <p className="m-0 text-sm text-muted-foreground">{p.detalle}</p>
                        {destino && (
                          <div>
                            <button type="button" className={botonChico} onClick={() => ir(destino)}>
                              Resolver
                              <span aria-hidden="true">→</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {a.proceso.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border-control px-3.5 py-3">
                <h5 className="m-0 flex items-center gap-2 text-sm font-semibold">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primario" />
                  Para el equipo
                </h5>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {a.proceso.map((p) => (
                    <li key={p.sugerencia} className="text-sm">
                      <span className="font-medium">{p.sugerencia}</span>
                      {p.porQue && <span className="block text-xs text-muted-foreground">{p.porQue}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {actual && <Valoracion g={actual} />}
          </div>
        )}
      </Tarjeta>
    </div>
  );
}

// --- Título ------------------------------------------------------------------------------------------------------------

/** El largo del título contra el rango ideal: una barra con la franja buena y una marca donde está. */
function MedidorLargo({ largo, min, max }: { largo: number; min: number; max: number }) {
  const escala = Math.max(Math.round(max * 1.3), largo + 2);
  const dentro = largo >= min && largo <= max;
  return (
    <div className="flex flex-col gap-1.5">
      <div role="img" aria-label={`${largo} caracteres; lo ideal es de ${min} a ${max}`} className="relative h-2.5 rounded-full bg-muted">
        <span aria-hidden="true" className="absolute inset-y-0 rounded-full bg-success-soft ring-1 ring-success/30" style={{ left: `${(min / escala) * 100}%`, width: `${((max - min) / escala) * 100}%` }} />
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 rounded-full ${dentro ? "bg-success" : largo > max ? "bg-destructive" : "bg-warning"}`} style={{ width: `${Math.min(100, (largo / escala) * 100)}%`, opacity: 0.85 }} />
      </div>
      <p className="m-0 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span className={`font-medium ${dentro ? "text-success" : largo > max ? "text-destructive" : "text-warning"}`}>{largo} caracteres</span>
        <span>
          ideal de {min} a {max}
        </span>
      </p>
    </div>
  );
}

function OpcionTitulo({ indice, inicial, porque, categoria, nombreProducto, reglas, iaId, elegido, alElegir }: { indice: number; inicial: string; porque: string; categoria: string | null; nombreProducto: string | null; reglas: { minTitulo: number; maxTitulo: number }; iaId: string; elegido: string | null; alElegir: (t: string) => void }) {
  const { mostrarToast } = useToast();
  const [texto, setTexto] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const r = chequearTitulo(texto, categoria, reglas, nombreProducto);
  const largo = r.chequeos.find((c) => c.clave === "largo")!;
  const esElegido = elegido !== null && elegido === texto.replace(/\s+/g, " ").trim();

  async function copiar(guardarComoElegido: boolean) {
    if (!guardarComoElegido) {
      return navigator.clipboard.writeText(texto.trim()).then(
        () => mostrarToast("Copiado"),
        () => mostrarToast("No se pudo copiar", "destructive"),
      );
    }
    setGuardando(true);
    const res: Awaited<ReturnType<typeof elegirTituloIA>> = await elegirTituloIA(iaId, texto).catch(() => ({ error: "No se pudo guardar el título elegido." }));
    setGuardando(false);
    if (res.error) return mostrarToast(res.error, "destructive");
    alElegir(texto.replace(/\s+/g, " ").trim());
    // Para Dropi queda pendiente: lo aplica el favorito «Aplicar en Dropi» desde la pestaña de Dropi (lo dice la ficha).
    const d = res.dropi;
    mostrarToast(`Nombre cambiado en el sistema. ${d?.detalle ?? ""}`, d?.estado === "error" ? "destructive" : "info");
  }

  return (
    <li className={`flex flex-col gap-2.5 rounded-2xl border p-3.5 ${esElegido ? "border-success bg-success-soft/40" : r.cumple ? "border-border bg-card" : "border-warning/60 bg-card"}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primario-suave text-xs font-semibold text-primario tabular-nums">
          {indice + 1}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input value={texto} maxLength={200} onChange={(e) => setTexto(e.target.value)} aria-label={`Título propuesto ${indice + 1}`} className={`${fieldClass} w-full text-sm font-medium`} />
          {porque && <p className="m-0 text-xs text-muted-foreground">{porque}</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${largo.ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{largo.texto}</span>
            {r.chequeos
              .filter((c) => c.clave !== "largo")
              .map((c) => (
                <span key={c.clave} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${c.ok ? "bg-muted text-muted-foreground" : c.obligatorio ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground"}`}>
                  {c.ok ? <CheckIcon aria-hidden="true" className="h-3 w-3 text-success" /> : <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${c.obligatorio ? "bg-warning" : "bg-border-control"}`} />}
                  {c.texto}
                </span>
              ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {esElegido && (
          <Badge tone="success">
            <CheckIcon aria-hidden="true" className="mr-1 h-3 w-3" />
            Elegido
          </Badge>
        )}
        <button type="button" className={botonChico} onClick={() => copiar(false)}>
          <CopiarIcon aria-hidden="true" className="h-3.5 w-3.5" />
          Copiar
        </button>
        <button type="button" className={`${botonChico} !border-transparent !bg-foreground !text-background hover:!bg-foreground/85`} disabled={guardando || texto.trim().length < 8} onClick={() => copiar(true)}>
          Usar este título
        </button>
      </div>
    </li>
  );
}

function PanelTitulos({ publicacionId, estado, vista }: { publicacionId: string; estado: EstadoIA; vista: AsistenteVista }) {
  const c = vista.contexto;
  const [actual, setActual] = useState(vista.titulos);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string | null>(vista.titulos?.resultado.elegido?.titulo ?? null);

  async function sugerir() {
    setError(null);
    setTrabajando(true);
    const r = await proponerTitulosIA(publicacionId).catch(() => ({ error: "No se pudo generar. Inténtalo de nuevo." }) as { error: string; guardado?: undefined });
    setTrabajando(false);
    if (r.error) setError(r.error);
    else if (r.guardado) {
      setActual(r.guardado);
      setElegido(null);
    }
  }

  const t = actual?.resultado;
  const largoActual = c.tituloActual.trim().length;
  const revTitulo = c.revisiones.filter((r) => r.clave.startsWith("titulo_"));
  return (
    <div className="grid gap-5 @3xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-5">
        <Tarjeta icono={EtiquetaIcon} titulo="Título actual">
          <p className="m-0 text-base font-semibold [overflow-wrap:anywhere]">{c.tituloActual}</p>
          {!c.tituloDeDropi && <p className="m-0 text-xs text-muted-foreground">Todavía no se leyó de Dropi: se usa el nombre guardado.</p>}
          <MedidorLargo largo={largoActual} min={c.reglas.minTitulo} max={c.reglas.maxTitulo} />
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {revTitulo.map((r) => (
              <li key={r.clave} className={`rounded-full px-2 py-0.5 text-xs font-medium ${MARCA[r.estado].clase}`}>
                <span className="sr-only">{MARCA[r.estado].texto}: </span>
                {r.etiqueta}
              </li>
            ))}
          </ul>
        </Tarjeta>
        {c.competidores.length > 0 && (
          <Tarjeta titulo={`Así lo titulan otros (${c.competidores.length})`}>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-muted-foreground">
              {c.competidores.map((x) => (
                <li key={x} className="rounded-lg bg-muted px-2.5 py-1.5 [overflow-wrap:anywhere]">
                  {x}
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}
      </div>

      <Tarjeta icono={SugerenciaIcon} titulo="Sugerencias de la IA" derecha={actual && !trabajando ? <EtiquetaIA g={actual} /> : undefined}>
        {!estado.texto && <SinClave cual="una IA de texto (OpenAI o Claude)" />}
        <div>
          <button type="button" className={botonNeon} disabled={!estado.texto || trabajando} onClick={sugerir}>
            <SugerenciaIcon aria-hidden="true" className="h-4 w-4" />
            {t ? "Sugerir otros títulos" : "Sugerir títulos"}
          </button>
        </div>
        {trabajando && <ProgresoEstimado etiqueta="Generando títulos" estimadoMs={30_000} pasos={["Leyendo las reglas y los títulos aprobados", "Escribiendo opciones", "Revisando que cumplan"]} />}
        <AvisoError texto={error} />
        {t && !trabajando && actual && (
          <div className="flex flex-col gap-3">
            {t.enfoque && <p className="m-0 text-sm text-muted-foreground">{t.enfoque}</p>}
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {t.titulos.map((x, i) => (
                <OpcionTitulo key={`${actual.id}-${i}`} indice={i} inicial={x.titulo} porque={x.porque} categoria={c.categoria} nombreProducto={c.nombreProducto} reglas={c.reglas} iaId={actual.id} elegido={elegido} alElegir={setElegido} />
              ))}
            </ul>
            {t.descartados > 0 && (
              <p className="m-0 text-xs text-muted-foreground">
                {t.descartados} {t.descartados === 1 ? "propuesta no cumplía" : "propuestas no cumplían"} las reglas y se {t.descartados === 1 ? "descartó" : "descartaron"}.
              </p>
            )}
            {t.titulos.every((x) => !x.cumple) && <p className="m-0 text-xs text-warning">Ninguna cumplió del todo: ajústalas a mano (el contador te dice qué falta).</p>}
            <Valoracion g={actual} />
          </div>
        )}
      </Tarjeta>
    </div>
  );
}

// --- Descripción y ángulos -----------------------------------------------------------------------------------------------

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const { mostrarToast } = useToast();
  return (
    <button
      type="button"
      className={botonChico}
      aria-label={`Copiar ${etiqueta}`}
      onClick={() => {
        navigator.clipboard.writeText(texto).then(
          () => mostrarToast("Copiado"),
          () => mostrarToast("No se pudo copiar", "destructive"),
        );
      }}
    >
      <CopiarIcon aria-hidden="true" className="h-3.5 w-3.5" />
      Copiar
    </button>
  );
}

function PanelTexto({ publicacionId, estado, vista }: { publicacionId: string; estado: EstadoIA; vista: AsistenteVista }) {
  const { mostrarToast } = useToast();
  const [actual, setActual] = useState(vista.texto);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const min = vista.contexto.reglas.minDescripcion;
  // El texto que se usará (el propuesto, tal cual o corregido) y cómo va en la cola de «Aplicar en Dropi».
  const [texto, setTexto] = useState(vista.texto?.resultado.descripcion ?? "");
  const [usando, setUsando] = useState(false);
  const [enDropi, setEnDropi] = useState<AsistenteVista["descripcionDropi"]>(vista.descripcionDropi);
  const medida = medirDescripcion(descripcionAHtml(texto));

  async function generar() {
    setError(null);
    setTrabajando(true);
    const r = await proponerTextoIA(publicacionId).catch(() => ({ error: "No se pudo generar. Inténtalo de nuevo." }) as { error: string; guardado?: undefined });
    setTrabajando(false);
    if (r.error) setError(r.error);
    else if (r.guardado) {
      setActual(r.guardado);
      setTexto(r.guardado.resultado.descripcion);
      setEnDropi(null);
    }
  }

  async function usar(iaId: string) {
    setError(null);
    setUsando(true);
    const r = await elegirDescripcionIA(iaId, texto).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }) as { error: string; dropi?: undefined });
    setUsando(false);
    if (r.error) return setError(r.error);
    setEnDropi("pendiente");
    mostrarToast(r.dropi?.detalle ?? "Descripción pendiente para Dropi");
  }

  const t = actual?.resultado;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {!estado.texto && <SinClave cual="una IA de texto (OpenAI o Claude)" />}
        <button type="button" className={botonNeon} disabled={!estado.texto || trabajando} onClick={generar}>
          <SugerenciaIcon aria-hidden="true" className="h-4 w-4" />
          {t ? "Volver a investigar" : "Investigar descripción y ángulos"}
        </button>
        {actual && !trabajando && <EtiquetaIA g={actual} />}
      </div>
      {trabajando && <ProgresoEstimado etiqueta="Investigando el producto" estimadoMs={80_000} pasos={["Investigando el producto en internet", "Mirando la foto", "Escribiendo la descripción", "Armando los ángulos de venta"]} />}
      <AvisoError texto={error} />
      {t && !trabajando && actual && (
        <div className="grid gap-5 @3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="flex flex-col gap-5">
            {t.descripcion && (
              <Tarjeta icono={ListaIcon} titulo="Descripción" derecha={<Copiar texto={texto} etiqueta="la descripción" />}>
                <label className="flex flex-col gap-1.5">
                  <span className="sr-only">Descripción para Dropi</span>
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={12}
                    disabled={usando}
                    className={`${fieldClass} max-h-[26rem] w-full resize-y text-sm leading-relaxed [overflow-wrap:anywhere]`}
                  />
                </label>
                <p className={`m-0 text-xs tabular-nums ${medida.largo >= min ? "text-success" : "text-warning"}`}>
                  {medida.largo.toLocaleString("es-PA")} caracteres · mínimo {min}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className={botonNeon} disabled={usando || !medida.cumple || enDropi === "pendiente"} onClick={() => usar(actual.id)}>
                    <CheckIcon aria-hidden="true" className="h-4 w-4" />
                    {usando ? "Un momento…" : enDropi === "pendiente" ? "Pendiente para Dropi" : "Usar esta descripción"}
                  </button>
                  {enDropi === "pendiente" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
                      {vista.sinPublicar ? "Se sube a Dropi al publicarla" : "Pendiente: «Aplicar en Dropi»"}
                    </span>
                  )}
                  {enDropi === "aplicada" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
                      Ya está en Dropi
                    </span>
                  )}
                </div>
              </Tarjeta>
            )}
            {t.notas && <p className="m-0 rounded-xl bg-muted/50 px-3.5 py-3 text-sm text-muted-foreground">{t.notas}</p>}
            {t.fuentes.length > 0 && (
              <section aria-label="Páginas consultadas" className="flex flex-col gap-2">
                <h5 className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Páginas consultadas</h5>
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                  {t.fuentes.map((f) => (
                    <li key={f.url} className="max-w-full">
                      <a href={f.url} target="_blank" rel="noreferrer noopener" className={`block max-w-full truncate rounded-full border border-border bg-card px-2.5 py-1 text-xs hover:bg-muted ${anilloFoco}`}>
                        {f.titulo || f.url}
                        <span className="sr-only"> (se abre en una pestaña nueva)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          {t.angulos.length > 0 && (
            <Tarjeta icono={SugerenciaIcon} titulo="Ángulos de venta">
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {t.angulos.map((a, i) => (
                  <li key={a.nombre} className="flex gap-3 rounded-xl border border-border px-3 py-2.5">
                    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primario-suave text-xs font-semibold text-primario tabular-nums">
                      {i + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                      <span className="font-semibold">{a.nombre}</span>
                      <span className="[overflow-wrap:anywhere]">{a.gancho}</span>
                      {a.paraQuien && <span className="text-xs text-muted-foreground">Para: {a.paraQuien}</span>}
                      {a.objecion && <span className="text-xs text-muted-foreground">Resuelve: {a.objecion}</span>}
                    </div>
                    <Copiar texto={a.gancho} etiqueta="el gancho" />
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
          <div className="@3xl:col-span-2">
            <Valoracion g={actual} />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Fotos -------------------------------------------------------------------------------------------------------------

function PanelFotos({ publicacionId, estado, vista }: { publicacionId: string; estado: EstadoIA; vista: AsistenteVista }) {
  const [plan, setPlan] = useState(vista.fotos);
  const [planeando, setPlaneando] = useState(false);
  const [generando, setGenerando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lo que la persona escribió en el cuadro de textos de cada foto informativa (sin guardar todavía).
  const [textosEditados, setTextosEditados] = useState<Record<number, string>>({});
  const [ampliada, setAmpliada] = useState<{ url: string; titulo: string } | null>(null);
  const ocupado = planeando || generando !== null;
  const revFotos = vista.contexto.revisiones.find((r) => r.clave === "fotos");
  const { mostrarToast } = useToast();
  // Las fotos marcadas para subirlas a Dropi (sin guardar todavía) y las que ya quedaron pendientes en la cola.
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [aprobando, setAprobando] = useState(false);
  const alternarMarca = (i: number) =>
    setMarcadas((antes) => {
      const ahora = new Set(antes);
      if (ahora.has(i)) ahora.delete(i);
      else ahora.add(i);
      return ahora;
    });

  async function aprobar(iaId: string) {
    setError(null);
    setAprobando(true);
    const indices = [...marcadas];
    const r = await aprobarFotosIA(iaId, indices).catch(() => ({ error: "No se pudo. Inténtalo de nuevo." }) as { error: string; aprobadas?: undefined; dropi?: undefined });
    setAprobando(false);
    if (r.error) return setError(r.error);
    setPlan((p) => (p ? { ...p, resultado: { ...p.resultado, fotos: p.resultado.fotos.map((f, k) => (indices.includes(k) && f.url ? { ...f, dropi: "pendiente" as const } : f)) } } : p));
    setMarcadas(new Set());
    mostrarToast(r.dropi?.detalle ?? "Fotos pendientes para Dropi");
  }

  async function generarUna(iaId: string, i: number, textos?: string) {
    setGenerando(i);
    const r = await generarFotoIA(iaId, i, textos === undefined ? undefined : textos.split("\n")).catch(() => ({ error: "No se pudo generar la foto. Inténtalo de nuevo." }) as { error: string; url?: undefined; textos?: undefined; textoOk?: undefined });
    setGenerando(null);
    setPlan((p) => {
      if (!p) return p;
      const fotos = p.resultado.fotos.map((f, k) => (k === i ? { ...f, url: r.url ?? f.url, error: r.error ?? null, ...(r.url ? { textos: r.textos ?? f.textos, textoOk: r.textoOk ?? null } : {}) } : f));
      return { ...p, resultado: { ...p.resultado, fotos } };
    });
    // Lo que quedó escrito en la imagen es lo que ahora muestra el cuadro.
    if (r.url) setTextosEditados((t) => {
      const resto = { ...t };
      delete resto[i];
      return resto;
    });
  }

  async function analizar() {
    setError(null);
    setPlaneando(true);
    const r = await planearFotosIA(publicacionId).catch(() => ({ error: "No se pudo analizar. Inténtalo de nuevo." }) as { error: string; guardado?: undefined });
    setPlaneando(false);
    if (r.error || !r.guardado) return setError(r.error ?? "No se pudo analizar.");
    setPlan(r.guardado);
    setMarcadas(new Set());
    setTextosEditados({});
    // Se generan una por una (cada una tarda): si una falla, sigue con las demás y queda anotado en su tarjeta.
    for (let i = 0; i < r.guardado.resultado.fotos.length; i++) await generarUna(r.guardado.id, i);
  }

  const fotos = plan?.resultado.fotos ?? [];
  const hechas = fotos.filter((f) => f.url).length;
  return (
    <div className="flex flex-col gap-5">
      <VisorImagen src={ampliada?.url ?? null} alt={ampliada?.titulo ?? ""} onClose={() => setAmpliada(null)} />
      <div className="flex flex-wrap items-center gap-3">
        {!estado.texto && <SinClave cual="una IA de texto (decide qué fotos faltan)" />}
        {!estado.gemini && <SinClave cual="Gemini (genera las fotos)" />}
        <button type="button" className={botonNeon} disabled={!estado.texto || !estado.gemini || ocupado} onClick={analizar}>
          <SugerenciaIcon aria-hidden="true" className="h-4 w-4" />
          {plan ? "Analizar de nuevo y generar" : "Analizar y generar fotos"}
        </button>
        {revFotos && <span className="text-sm text-muted-foreground">{revFotos.detalle}</span>}
        {plan && !ocupado && <EtiquetaIA g={plan} />}
      </div>
      {planeando && <ProgresoEstimado etiqueta="Analizando qué fotos faltan" estimadoMs={45_000} pasos={["Mirando la foto del producto", "Revisando cómo lo muestran otros vendedores", "Decidiendo qué fotos faltan"]} />}
      <AvisoError texto={error} />
      {plan && !planeando && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {plan.resultado.analisis && <p className="m-0 rounded-xl bg-primario-suave px-3.5 py-3 text-sm">{plan.resultado.analisis}</p>}
            <div className="flex items-center gap-3">
              <div role="progressbar" aria-label="Fotos generadas" aria-valuemin={0} aria-valuemax={fotos.length} aria-valuenow={hechas} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                <div className="barra-neon h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${fotos.length ? (hechas / fotos.length) * 100 : 0}%` }} />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {hechas} de {fotos.length} generadas
              </span>
            </div>
          </div>
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 @3xl:grid-cols-3">
            {fotos.map((f, i) => (
              <li key={f.tipo} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                <div className="relative aspect-square bg-muted">
                  {f.url ? (
                    <button type="button" onClick={() => setAmpliada({ url: f.url!, titulo: f.titulo })} aria-label={`Ver en grande: ${f.titulo}`} className={`block h-full w-full ${anilloFoco}`}>
                      <img src={f.url} alt={`${f.titulo}: foto generada`} loading="lazy" className="h-full w-full object-cover hover:opacity-90" />
                    </button>
                  ) : (
                    <span className={`flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground ${generando === i ? "animate-pulse motion-reduce:animate-none" : ""}`}>
                      <ImagenIcono className="h-8 w-8 opacity-50" />
                      {generando === i ? "Generando…" : f.error ? "No se pudo generar" : "Sin generar"}
                    </span>
                  )}
                  <span className="absolute top-2 left-2 rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-sm">{etiquetaTipoFoto(f.tipo)}</span>
                </div>
                <div className="flex flex-col gap-2 p-3">
                  <span className="truncate text-sm font-medium">{f.titulo}</span>
                  {conTexto(f.tipo) && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium">Textos de la imagen</span>
                      <textarea
                        rows={3}
                        value={textosEditados[i] ?? (f.textos ?? []).join("\n")}
                        onChange={(e) => setTextosEditados((t) => ({ ...t, [i]: e.target.value }))}
                        disabled={ocupado}
                        placeholder={`Una línea por texto. Ej: ${LIMITES_TEXTO[f.tipo].ejemplo}`}
                        className={`${fieldClassSm} w-full resize-y`}
                      />
                    </label>
                  )}
                  {f.url && f.textoOk != null && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${f.textoOk ? "bg-success" : "bg-warning"}`} />
                      {f.textoOk ? "Texto verificado" : "Revisar el texto"}
                    </span>
                  )}
                  {f.error && !f.url && (
                    <p role="alert" className="m-0 text-xs text-destructive">
                      {f.error}
                    </p>
                  )}
                  {f.url && f.dropi === "pendiente" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
                      {vista.sinPublicar ? "Se sube a Dropi al publicarla" : "Pendiente: «Aplicar en Dropi»"}
                    </span>
                  )}
                  {f.url && f.dropi === "subida" && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
                      Ya está en Dropi
                    </span>
                  )}
                  {f.url && !f.dropi && (
                    <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-xs font-medium">
                      <input type="checkbox" checked={marcadas.has(i)} onChange={() => alternarMarca(i)} disabled={ocupado || aprobando} className="h-4 w-4" />
                      Subir a Dropi
                    </label>
                  )}
                  <div className="flex gap-2">
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer noopener" download className={`${botonChico} flex-1 justify-center`}>
                        Descargar
                      </a>
                    )}
                    <button type="button" className={`${botonChico} flex-1 justify-center`} disabled={!estado.gemini || ocupado} onClick={() => generarUna(plan.id, i, conTexto(f.tipo) ? (textosEditados[i] ?? (f.textos ?? []).join("\n")) : undefined)}>
                      {f.url ? "Rehacer" : "Generar"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={botonNeon} disabled={marcadas.size === 0 || ocupado || aprobando} onClick={() => aprobar(plan.id)}>
              <CheckIcon aria-hidden="true" className="h-4 w-4" />
              {aprobando ? "Un momento…" : marcadas.size ? `Dejar ${marcadas.size} ${marcadas.size === 1 ? "foto pendiente" : "fotos pendientes"} para Dropi` : "Marca las fotos que quieres subir a Dropi"}
            </button>
          </div>
          <Valoracion g={plan} />
        </div>
      )}
    </div>
  );
}

/** Para la prueba visual: el contenido del asistente con lo que se le pase, sin pedirlo al servidor. */
export const ContenidoAsistentePrueba = ContenidoAsistente;
