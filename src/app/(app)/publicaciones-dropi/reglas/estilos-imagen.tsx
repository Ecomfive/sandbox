"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { ProgresoEstimado } from "@/components/ui/progreso-estimado";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { CerrarIcon, CheckIcon, LapizIcon, PapeleraIcon, SugerenciaIcon } from "@/lib/nav-icons";
import { TIPOS_FOTO } from "@/lib/publicaciones/ia/asistente";
import { MAX_GUIA, MAX_IMAGENES_MODELO, TIPO_GENERAL } from "@/lib/publicaciones/ia/estilos";
import type { EstiloGuardado } from "@/lib/publicaciones/ia/estilos-datos";
import { actualizarEstiloImagenIA, analizarImagenesModeloIA, eliminarEstiloImagenIA, guardarEstiloImagenIA } from "../ia-estilos-actions";
import { comprimirImagen } from "./comprimir-imagen";

const OPCIONES_TIPO = [{ valor: TIPO_GENERAL, etiqueta: "Todas las fotos" }, ...TIPOS_FOTO.map((t) => ({ valor: t.valor as string, etiqueta: t.etiqueta }))];
const etiquetaTipo = (t: string) => OPCIONES_TIPO.find((o) => o.valor === t)?.etiqueta ?? t;
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });

const botonNeon = `boton-neon inline-flex h-10 items-center justify-center gap-2 border border-transparent px-4 text-sm font-medium text-white disabled:pointer-events-none disabled:opacity-40 ${anilloFoco} !rounded-md`;
const botonSecundario = `inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`;
const botonIcono = `inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-control bg-card text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 ${anilloFoco}`;

function ImagenIcono({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m21 16-5-5-8 9" />
    </svg>
  );
}

function Aviso({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="m-0 text-sm text-destructive">
      {texto}
    </p>
  );
}

/**
 * Reglas › Imágenes modelo: el equipo sube imágenes que le gustan, la IA las analiza y aquí queda **solo la guía de estilo en texto**
 * (las imágenes no se guardan). Cada guía se agrega al pedido de las fotos que genera Gemini y al plan de fotos; se puede apagar,
 * corregir o eliminar. Con permiso de escritura se agregan y cambian.
 */
export function EstilosImagen({ estilos, disponible, puedeEscribir, conectado }: { estilos: EstiloGuardado[]; disponible: boolean; puedeEscribir: boolean; conectado: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  const editable = puedeEscribir && disponible;

  function alternar(e: EstiloGuardado) {
    setError(null);
    empezar(async () => {
      const r = await actualizarEstiloImagenIA(e.id, { activo: !e.activo }).catch(() => ({ error: "No se pudo guardar el cambio." }));
      if (r.error) return setError(r.error);
      router.refresh();
    });
  }

  function eliminar(e: EstiloGuardado) {
    setError(null);
    empezar(async () => {
      const r = await eliminarEstiloImagenIA(e.id).catch(() => ({ error: "No se pudo eliminar la guía." }));
      if (r.error) return setError(r.error);
      setBorrando(null);
      mostrarToast("Guía eliminada");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="estilos-imagen-ia" aria-busy={ocupado} className="flex max-w-3xl flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted px-4 py-2">
        <h2 id="estilos-imagen-ia" className="m-0 flex items-center gap-2 text-sm font-semibold">
          <ImagenIcono className="h-4 w-4 text-primario" />
          Imágenes modelo
        </h2>
        {editable && <BotonAgregar onClick={() => setNuevo(true)} className="!py-1.5" />}
      </div>
      {!disponible && (
        <p role="alert" className="m-0 border-b border-border px-4 py-3 text-sm text-destructive">
          Para guardarlas falta correr en Supabase la migración 0135.
        </p>
      )}
      {disponible && estilos.length === 0 && <p className="m-0 px-4 py-4 text-sm text-muted-foreground">Todavía no hay imágenes modelo.</p>}
      {estilos.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {estilos.map((e) => (
            <li key={e.id} className="flex flex-col">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-medium">{e.nombre}</p>
                  <p className="m-0 truncate text-xs text-muted-foreground">
                    {etiquetaTipo(e.tipo)} · {e.creadoPor ? `${e.creadoPor} · ` : ""}
                    {fecha(e.creadoEn)}
                  </p>
                </div>
                {editable ? (
                  <button
                    type="button"
                    aria-pressed={e.activo}
                    aria-label={`${e.nombre}: ${e.activo ? "activa. Pulsa para apagarla" : "apagada. Pulsa para activarla"}`}
                    disabled={ocupado}
                    onClick={() => alternar(e)}
                    className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium disabled:opacity-50 ${anilloFoco} ${e.activo ? "border-transparent bg-primario-suave text-primario" : "border-border-control bg-card text-muted-foreground"}`}
                  >
                    {e.activo ? "Activa" : "Apagada"}
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">{e.activo ? "Activa" : "Apagada"}</span>
                )}
                {editable && (
                  <>
                    <Tooltip texto="Editar guía">
                      <button type="button" aria-label={`Editar la guía ${e.nombre}`} aria-expanded={editando === e.id} onClick={() => setEditando(editando === e.id ? null : e.id)} className={botonIcono}>
                        <LapizIcon className="h-4 w-4" />
                      </button>
                    </Tooltip>
                    <Tooltip texto="Eliminar guía">
                      <button type="button" aria-label={`Eliminar la guía ${e.nombre}`} onClick={() => setBorrando(e.id)} className={botonIcono}>
                        <PapeleraIcon className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </>
                )}
              </div>
              {borrando === e.id && (
                <div role="alert" className="flex flex-wrap items-center gap-3 border-t border-border bg-muted px-4 py-2.5 text-sm">
                  <span className="flex-1">¿Eliminar «{e.nombre}»?</span>
                  <button type="button" disabled={ocupado} onClick={() => eliminar(e)} className={`inline-flex h-8 items-center rounded-md bg-destructive px-3 text-xs font-medium text-white disabled:opacity-50 ${anilloFoco}`}>
                    Eliminar
                  </button>
                  <button type="button" onClick={() => setBorrando(null)} className={`inline-flex h-8 items-center rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted ${anilloFoco}`}>
                    Cancelar
                  </button>
                </div>
              )}
              {editando === e.id && <EditarEstilo key={e.id} estilo={e} cerrar={() => setEditando(null)} />}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="border-t border-border px-4 py-3">
          <Aviso texto={error} />
        </div>
      )}
      {nuevo && <NuevoEstilo conectado={conectado} cerrar={() => setNuevo(false)} />}
    </section>
  );
}

/** Corregir una guía ya guardada: nombre, a qué fotos aplica y el texto. «Guardar cambios» solo si algo cambió. */
function EditarEstilo({ estilo, cerrar }: { estilo: EstiloGuardado; cerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [nombre, setNombre] = useState(estilo.nombre);
  const [tipo, setTipo] = useState(estilo.tipo);
  const [guia, setGuia] = useState(estilo.guia);
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();
  const sinGuardar = nombre.trim() !== estilo.nombre || tipo !== estilo.tipo || guia.trim() !== estilo.guia.trim();

  function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await actualizarEstiloImagenIA(estilo.id, { nombre, tipo, guia }).catch(() => ({ error: "No se pudo guardar el cambio." }));
      if (r.error) return setError(r.error);
      mostrarToast("Guía guardada");
      cerrar();
      router.refresh();
    });
  }

  return (
    <form onSubmit={guardar} aria-busy={guardando} className="flex flex-col gap-3 border-t border-border bg-muted/40 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} required className={`${fieldClass} w-full`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Aplica a</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={`${fieldClass} w-full`}>
            {OPCIONES_TIPO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Guía de estilo</span>
        <textarea value={guia} onChange={(e) => setGuia(e.target.value)} rows={8} maxLength={MAX_GUIA} className={`${fieldClass} w-full resize-y`} />
      </label>
      <Aviso texto={error} />
      <div className="flex gap-2">
        {sinGuardar && (
          <button type="submit" disabled={guardando} className={`${botonSecundario} !bg-foreground !text-background hover:!bg-foreground/85 !border-transparent`}>
            <CheckIcon className="h-4 w-4" />
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        )}
        <button type="button" onClick={cerrar} disabled={guardando} className={botonSecundario}>
          {sinGuardar ? "Cancelar" : "Cerrar"}
        </button>
      </div>
    </form>
  );
}

interface ImagenElegida {
  id: number;
  nombre: string;
  dataUrl: string;
}

/**
 * La ficha de «Agregar»: nombre, a qué fotos aplica, hasta 3 imágenes (se reducen en el navegador) y «Analizar con IA», que escribe la guía.
 * La guía se puede corregir antes de guardarla. Las imágenes viven solo aquí, en memoria: al cerrar se pierden y nunca se suben.
 */
function NuevoEstilo({ conectado, cerrar }: { conectado: boolean; cerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState(TIPO_GENERAL);
  const [imagenes, setImagenes] = useState<ImagenElegida[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [guia, setGuia] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const siguienteId = useRef(0);
  const ocupado = leyendo || analizando || guardando;

  async function elegir(ev: React.ChangeEvent<HTMLInputElement>) {
    const archivos = [...(ev.target.files ?? [])].slice(0, MAX_IMAGENES_MODELO - imagenes.length);
    ev.target.value = "";
    if (!archivos.length) return;
    setError(null);
    setLeyendo(true);
    const nuevas: ImagenElegida[] = [];
    for (const a of archivos) {
      try {
        nuevas.push({ id: siguienteId.current++, nombre: a.name, dataUrl: await comprimirImagen(a) });
      } catch (e) {
        setError((e as Error).message);
      }
    }
    setImagenes((prev) => [...prev, ...nuevas].slice(0, MAX_IMAGENES_MODELO));
    setLeyendo(false);
  }

  async function analizar() {
    setError(null);
    setAnalizando(true);
    const r = await analizarImagenesModeloIA({ tipo, imagenes: imagenes.map((i) => i.dataUrl) }).catch(() => ({ error: "No se pudo analizar. Inténtalo de nuevo." }) as { error: string; guia?: undefined });
    setAnalizando(false);
    if (r.error || !r.guia) return setError(r.error ?? "No se pudo analizar.");
    setGuia(r.guia);
  }

  function guardar() {
    setError(null);
    empezar(async () => {
      const r = await guardarEstiloImagenIA({ nombre, tipo, guia: guia ?? "" }).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) return setError(r.error);
      mostrarToast("Imagen modelo guardada");
      cerrar();
      router.refresh();
    });
  }

  function intentarCerrar() {
    if (guia !== null && !guardando) return setConfirmandoCierre(true);
    cerrar();
  }

  return (
    <Ventana
      abierto
      lado="derecha"
      ancho="lg"
      alCerrar={intentarCerrar}
      titulo={
        <>
          <ImagenIcono className="h-4 w-4 text-primario" />
          Agregar imágenes modelo
        </>
      }
    >
      <div className="flex flex-col gap-5 p-5">
        {confirmandoCierre && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted px-3.5 py-3 text-sm">
            <span className="flex-1">¿Descartar la guía sin guardar?</span>
            <button type="button" onClick={cerrar} className={`inline-flex h-8 items-center rounded-md bg-destructive px-3 text-xs font-medium text-white ${anilloFoco}`}>
              Descartar
            </button>
            <button type="button" onClick={() => setConfirmandoCierre(false)} className={`inline-flex h-8 items-center rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted ${anilloFoco}`}>
              Seguir editando
            </button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Nombre</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Ej: Infografía de beneficios" className={`${fieldClass} w-full`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Aplica a</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={guia !== null} className={`${fieldClass} w-full`}>
              {OPCIONES_TIPO.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Imágenes</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {imagenes.length} de {MAX_IMAGENES_MODELO}
            </span>
          </div>
          <ul className="m-0 grid list-none grid-cols-3 gap-3 p-0">
            {imagenes.map((i, n) => (
              <li key={i.id} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local en memoria, no una imagen del sitio */}
                <img src={i.dataUrl} alt={`Imagen modelo ${n + 1}: ${i.nombre}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={`Quitar la imagen ${n + 1}`}
                  disabled={ocupado}
                  onClick={() => setImagenes((prev) => prev.filter((x) => x.id !== i.id))}
                  className={`absolute top-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm backdrop-blur-sm hover:bg-card disabled:opacity-50 ${anilloFoco}`}
                >
                  <CerrarIcon className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {imagenes.length < MAX_IMAGENES_MODELO && (
              <li>
                <label className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-control bg-card text-xs font-medium text-muted-foreground hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${ocupado ? "pointer-events-none opacity-50" : ""}`}>
                  <ImagenIcono className="h-6 w-6" />
                  {leyendo ? "Leyendo…" : "Elegir imágenes"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={ocupado} onChange={elegir} className="sr-only" />
                </label>
              </li>
            )}
          </ul>
        </div>

        {!conectado && (
          <p role="alert" className="m-0 text-sm text-destructive">
            Falta conectar una IA de texto (OPENAI_API_KEY o ANTHROPIC_API_KEY en Vercel).
          </p>
        )}
        <Aviso texto={error} />

        {analizando ? (
          <ProgresoEstimado etiqueta="Analizando las imágenes" estimadoMs={25_000} pasos={["Mirando las imágenes", "Describiendo el estilo", "Armando la guía"]} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={botonNeon} disabled={!conectado || imagenes.length === 0 || ocupado} onClick={analizar}>
              <SugerenciaIcon aria-hidden="true" className="h-4 w-4" />
              {guia === null ? "Analizar con IA" : "Analizar de nuevo"}
            </button>
          </div>
        )}

        {guia !== null && !analizando && (
          <div className="flex flex-col gap-3 border-t border-border pt-5">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Guía de estilo</span>
              <textarea value={guia} onChange={(e) => setGuia(e.target.value)} rows={10} maxLength={MAX_GUIA} className={`${fieldClass} w-full resize-y`} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={ocupado || nombre.trim().length < 2 || guia.trim().length < 20} onClick={guardar} className={`${botonSecundario} !h-10 !border-transparent !bg-foreground !text-background hover:!bg-foreground/85`}>
                <CheckIcon className="h-4 w-4" />
                {guardando ? "Guardando..." : "Guardar guía"}
              </button>
            </div>
          </div>
        )}
      </div>
    </Ventana>
  );
}
