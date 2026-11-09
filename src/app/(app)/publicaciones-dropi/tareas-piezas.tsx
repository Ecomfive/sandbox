"use client";

import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { SinFotoIcon } from "@/lib/nav-icons";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import {
  cuandoTarea,
  diaSiguiente,
  ESTADOS_TAREA,
  etiquetaEstado,
  etiquetaPrioridad,
  iniciales,
  MAX_NOTA_TAREA,
  MAX_TITULO_TAREA,
  PRIORIDADES,
  vencimiento,
  type CambioTarea,
  type EstadoTarea,
  type Prioridad,
  type TareaVista,
} from "@/lib/publicaciones/tareas";
import { claseCampoPanel, claseOpcionPanel, PanelCelda } from "../compras/panel-celda";
import { EditorFecha } from "../compras/celda-editable";
import { marcarTareaHecha } from "./recomendaciones-actions";
import { usePersonasTareas } from "./recomendacion-publicacion";
import { actualizarTarea, buscarPublicacionesParaTarea, crearTareaPublicacion } from "./tareas-actions";
import type { PublicacionDeTarea } from "./tareas-datos";

/** Hoy en Panamá (AAAA-MM-DD). */
export const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

export const botonOscuro = `inline-flex min-h-9 items-center justify-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60 ${anilloFoco}`;
export const botonClaro = `inline-flex min-h-9 items-center justify-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-60 ${anilloFoco}`;
const colorEstado = (e: EstadoTarea) => ESTADOS_TAREA.find((x) => x.valor === e)?.color ?? "#8b8d98";
const colorPrioridad = (p: Prioridad | null) => PRIORIDADES.find((x) => x.valor === p)?.color;

/** Dentro del formulario de la ficha de la publicación, Enter en un campo de la tarea no debe enviar la ficha: lo atiende la tarea. */
function sinEnviarFicha(alEnter: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      alEnter();
    }
  };
}

/** El círculo del estado, como en ClickUp: vacío (Por hacer), lleno a la mitad (En curso), a tres cuartos (En revisión) y con su marca (Hecha). */
export function CirculoEstado({ estado, className = "h-4 w-4" }: { estado: EstadoTarea; className?: string }) {
  const c = colorEstado(estado);
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`shrink-0 ${className}`}>
      {estado === "hecha" ? (
        <>
          <circle cx="8" cy="8" r="7" fill={c} />
          <path d="M4.8 8.2l2.1 2.1 4.3-4.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray={estado === "por_hacer" ? "2.2 1.6" : undefined} />
          {estado === "en_curso" && <path d="M8 3.6a4.4 4.4 0 0 1 0 8.8z" fill={c} />}
          {estado === "en_revision" && <path d="M8 3.6a4.4 4.4 0 1 1 -4.4 4.4H8z" fill={c} />}
        </>
      )}
    </svg>
  );
}

/** La bandera de la prioridad (vacía y gris sin prioridad). */
export function BanderaIcon({ prioridad, className = "h-4 w-4" }: { prioridad: Prioridad | null; className?: string }) {
  const c = colorPrioridad(prioridad);
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`shrink-0 ${className} ${c ? "" : "text-muted-foreground"}`}>
      <path d="M3.5 14.5V2" stroke={c ?? "currentColor"} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M3.5 2.5h8.2l-1.8 3 1.8 3H3.5" fill={c ?? "none"} stroke={c ?? "currentColor"} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/** El círculo con las iniciales de la persona a la que le toca. */
export function Iniciales({ nombre, className = "h-7 w-7 text-[11px]" }: { nombre: string | null; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primario-suave font-semibold text-primario ${className}`}>
      {iniciales(nombre)}
    </span>
  );
}

interface OpcionLista {
  valor: string;
  etiqueta: string;
  icono?: ReactNode;
}

/** La lista de un panel (estado, prioridad, persona): flechas, Enter y, si son muchas, un buscador. Guarda al elegir. */
function PanelLista({ ancla, aria, opciones, elegida, alElegir, alCerrar }: { ancla: RefObject<HTMLElement | null>; aria: string; opciones: OpcionLista[]; elegida: string; alElegir: (v: string) => void; alCerrar: () => void }) {
  const [busqueda, setBusqueda] = useState("");
  const conBuscador = opciones.length > 6;
  const q = busqueda.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const vistas = q ? opciones.filter((o) => o.etiqueta.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)) : opciones;
  const [activa, setActiva] = useState(() => Math.max(0, opciones.findIndex((o) => o.valor === elegida)));
  const lista = useRef<HTMLUListElement>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    if (conBuscador) buscador.current?.focus();
    else lista.current?.focus();
  }, [conBuscador]);

  function teclas(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = vistas.length;
      if (n) setActiva((i) => (Math.min(i, n - 1) + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = vistas[Math.min(activa, vistas.length - 1)];
      if (o) alElegir(o.valor);
    }
  }

  return (
    <PanelCelda ancla={ancla} etiqueta={aria} alCerrar={alCerrar} ancho={240}>
      {conBuscador && (
        <input
          ref={buscador}
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setActiva(0);
          }}
          onKeyDown={teclas}
          placeholder="Buscar…"
          aria-label={`Buscar en ${aria.toLowerCase()}`}
          className={claseCampoPanel}
        />
      )}
      <ul
        ref={lista}
        role="listbox"
        aria-label={aria}
        aria-activedescendant={vistas.length ? `${id}-${activa}` : undefined}
        tabIndex={conBuscador ? -1 : 0}
        onKeyDown={teclas}
        className="m-0 flex max-h-72 list-none flex-col gap-0.5 overflow-y-auto p-1.5 outline-none"
      >
        {vistas.map((o, i) => (
          <li
            key={o.valor || "vacio"}
            id={`${id}-${i}`}
            role="option"
            aria-selected={o.valor === elegida}
            onMouseEnter={() => setActiva(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => alElegir(o.valor)}
            className={`${claseOpcionPanel} cursor-pointer ${i === activa ? "bg-muted" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              {o.icono}
              <span className="truncate">{o.etiqueta}</span>
            </span>
            {o.valor === elegida && (
              <span aria-hidden="true" className="text-xs text-primario">
                ✓
              </span>
            )}
          </li>
        ))}
        {vistas.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados.</li>}
      </ul>
    </PanelCelda>
  );
}

/**
 * Cambiar una tarea desde la fila o la ficha: se ve al instante y, si el servidor lo rechaza, vuelve como estaba con un aviso. Una tarea de una
 * recomendación solo se puede dar por hecha (como en Recomendaciones); lo demás se cambia en la recomendación.
 */
export function useCambiarTarea(alCambiar: (t: TareaVista, p?: PublicacionDeTarea) => void) {
  const { personas } = usePersonasTareas();
  const { mostrarToast } = useToast();
  const [ocupado, empezar] = useTransition();

  function cambiar(t: TareaVista, cambio: CambioTarea, publicacion?: PublicacionDeTarea) {
    const ahora = new Date().toISOString();
    const nueva: TareaVista = {
      ...t,
      ...(cambio.titulo !== undefined ? { titulo: cambio.titulo } : {}),
      ...(cambio.nota !== undefined ? { nota: cambio.nota } : {}),
      ...(cambio.prioridad !== undefined ? { prioridad: cambio.prioridad } : {}),
      ...(cambio.plazo !== undefined ? { plazo: cambio.plazo } : {}),
      ...(cambio.publicacionId ? { publicacionId: cambio.publicacionId } : {}),
      ...(cambio.responsableId ? { responsableId: cambio.responsableId, responsableNombre: personas.find((p) => p.id === cambio.responsableId)?.nombre ?? t.responsableNombre } : {}),
      ...(cambio.estado ? { estado: cambio.estado, hechaEn: cambio.estado === "hecha" ? (t.hechaEn ?? ahora) : null, hechaPor: cambio.estado === "hecha" ? t.hechaPor : null } : {}),
      ...(cambio.archivar !== undefined ? { archivadaEn: cambio.archivar ? ahora : null } : {}),
    };
    alCambiar(nueva, publicacion);
    empezar(async () => {
      const r =
        t.origen === "recomendacion"
          ? await marcarTareaHecha(t.id, "")
              .then((x) => ({ ...x, tarea: undefined, publicacion: undefined }))
              .catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", tarea: undefined, publicacion: undefined }))
          : await actualizarTarea(t.id, cambio).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", tarea: undefined, publicacion: undefined }));
      if (r.error) {
        alCambiar(t);
        mostrarToast(r.error, "destructive");
        return;
      }
      if (r.tarea) alCambiar(r.tarea, r.publicacion ?? publicacion);
      if (cambio.estado === "hecha" && t.estado !== "hecha") mostrarToast("Tarea hecha");
      if (cambio.archivar !== undefined) mostrarToast(cambio.archivar ? "Tarea archivada" : "Tarea fuera de Archivadas");
    });
  }
  return { cambiar, ocupado };
}

/** El estado de una tarea: su círculo (o una píldora con el nombre, en la ficha) que abre la lista de estados. */
export function MenuEstado({ t, puedeEscribir, conEstados, alElegir, pildora = false }: { t: TareaVista; puedeEscribir: boolean; conEstados: boolean; alElegir: (e: EstadoTarea) => void; pildora?: boolean }) {
  const ancla = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  // Una de una recomendación (o sin la migración 0178) solo va de Por hacer a Hecha; una hecha de una recomendación ya no se reabre.
  const soloHecha = t.origen === "recomendacion" || !conEstados;
  const bloqueada = !puedeEscribir || (t.origen === "recomendacion" && t.estado === "hecha");
  const opciones = (soloHecha ? ESTADOS_TAREA.filter((e) => e.valor === "hecha" || e.valor === t.estado || (t.origen === "manual" && e.valor === "por_hacer")) : ESTADOS_TAREA).map((e) => ({
    valor: e.valor,
    etiqueta: e.etiqueta,
    icono: <CirculoEstado estado={e.valor} />,
  }));
  const texto = `Estado: ${etiquetaEstado(t.estado)}`;
  const contenido = pildora ? (
    <span style={{ backgroundColor: colorEstado(t.estado) }} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide text-white uppercase">
      <CirculoEstado estado={t.estado} className="h-3.5 w-3.5 [&_circle]:stroke-white" />
      {etiquetaEstado(t.estado)}
    </span>
  ) : (
    <CirculoEstado estado={t.estado} />
  );
  if (bloqueada)
    return pildora ? (
      contenido
    ) : (
      <span role="img" aria-label={texto} className="inline-flex h-8 w-8 shrink-0 items-center justify-center">
        {contenido}
      </span>
    );
  return (
    <>
      <Tooltip texto="Cambiar estado">
        <button
          ref={ancla}
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-label={`${texto}. Cambiar estado de «${t.titulo}»`}
          className={`inline-flex shrink-0 items-center justify-center rounded-md ${pildora ? "" : "h-8 w-8 hover:bg-muted"} ${anilloFoco}`}
        >
          {contenido}
        </button>
      </Tooltip>
      {abierto && (
        <PanelLista
          ancla={ancla}
          aria="Estado de la tarea"
          opciones={opciones}
          elegida={t.estado}
          alCerrar={() => setAbierto(false)}
          alElegir={(v) => {
            setAbierto(false);
            if (v !== t.estado) alElegir(v as EstadoTarea);
          }}
        />
      )}
    </>
  );
}

/** La prioridad: su bandera, que abre la lista (Urgente, Alta, Normal, Baja o Sin prioridad). */
export function MenuPrioridad({ t, puedeEscribir, alElegir, conTexto = false }: { t: TareaVista; puedeEscribir: boolean; alElegir: (p: Prioridad | null) => void; conTexto?: boolean }) {
  const ancla = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const contenido = (
    <>
      <BanderaIcon prioridad={t.prioridad} />
      {conTexto && <span className={t.prioridad ? "" : "text-muted-foreground"}>{etiquetaPrioridad(t.prioridad)}</span>}
    </>
  );
  if (!puedeEscribir || t.origen === "recomendacion")
    return (
      <span role="img" aria-label={`Prioridad: ${etiquetaPrioridad(t.prioridad)}`} className={`inline-flex shrink-0 items-center gap-2 ${conTexto ? "text-sm" : "h-8 w-8 justify-center"}`}>
        {contenido}
      </span>
    );
  return (
    <>
      <Tooltip texto="Cambiar prioridad">
        <button
          ref={ancla}
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-label={`Prioridad: ${etiquetaPrioridad(t.prioridad)}. Cambiar la prioridad de «${t.titulo}»`}
          className={`inline-flex shrink-0 items-center gap-2 rounded-md hover:bg-muted ${conTexto ? "min-h-8 px-2 text-sm" : "h-8 w-8 justify-center"} ${anilloFoco}`}
        >
          {contenido}
        </button>
      </Tooltip>
      {abierto && (
        <PanelLista
          ancla={ancla}
          aria="Prioridad de la tarea"
          opciones={[...PRIORIDADES.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta, icono: <BanderaIcon prioridad={p.valor} /> })), { valor: "", etiqueta: "Sin prioridad", icono: <BanderaIcon prioridad={null} /> }]}
          elegida={t.prioridad ?? ""}
          alCerrar={() => setAbierto(false)}
          alElegir={(v) => {
            setAbierto(false);
            if ((v || null) !== t.prioridad) alElegir((v || null) as Prioridad | null);
          }}
        />
      )}
    </>
  );
}

/** A quién le toca: el círculo con sus iniciales, que abre la lista de personas (con buscador). */
export function MenuResponsable({ t, puedeEscribir, alElegir, conTexto = false }: { t: TareaVista; puedeEscribir: boolean; alElegir: (id: string) => void; conTexto?: boolean }) {
  const { personas, yo } = usePersonasTareas();
  const ancla = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const nombre = t.responsableNombre ?? "Sin asignar";
  const contenido = (
    <>
      <Iniciales nombre={t.responsableNombre} />
      {conTexto && <span className="truncate">{nombre}</span>}
    </>
  );
  if (!puedeEscribir || t.origen === "recomendacion" || personas.length === 0)
    return conTexto ? (
      <span className="inline-flex min-w-0 items-center gap-2 text-sm">{contenido}</span>
    ) : (
      <Tooltip texto={nombre}>
        <span role="img" tabIndex={0} aria-label={`Le toca a ${nombre}`} className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${anilloFoco}`}>
          {contenido}
        </span>
      </Tooltip>
    );
  return (
    <>
      <Tooltip texto={conTexto ? "Cambiar responsable" : `${nombre} · Cambiar`}>
        <button
          ref={ancla}
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-label={`Le toca a ${nombre}. Cambiar quién hace «${t.titulo}»`}
          className={`inline-flex min-w-0 shrink-0 items-center gap-2 rounded-md hover:bg-muted ${conTexto ? "min-h-8 px-1.5 text-sm" : "h-8 w-8 justify-center"} ${anilloFoco}`}
        >
          {contenido}
        </button>
      </Tooltip>
      {abierto && (
        <PanelLista
          ancla={ancla}
          aria="Quién hace la tarea"
          opciones={personas.map((p) => ({ valor: p.id, etiqueta: p.id === yo ? `${p.nombre} (yo)` : p.nombre, icono: <Iniciales nombre={p.nombre} className="h-6 w-6 text-[10px]" /> }))}
          elegida={t.responsableId ?? ""}
          alCerrar={() => setAbierto(false)}
          alElegir={(v) => {
            setAbierto(false);
            if (v && v !== t.responsableId) alElegir(v);
          }}
        />
      )}
    </>
  );
}

/** Para cuándo: la fecha dicha en relación con hoy (en rojo si ya pasó, ámbar si es hoy), que abre el selector de fechas con sus atajos. */
export function MenuFecha({ t, hoy, puedeEscribir, alElegir }: { t: TareaVista; hoy: string; puedeEscribir: boolean; alElegir: (plazo: string | null) => void }) {
  const ancla = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const v = vencimiento(t, hoy);
  const color = v === "atrasada" ? "text-destructive font-medium" : v === "hoy" ? "text-warning font-medium" : t.plazo ? "" : "text-muted-foreground";
  const texto = cuandoTarea(t.plazo, hoy);
  if (!puedeEscribir || t.origen === "recomendacion") return <span className={`inline-flex min-h-8 items-center text-sm tabular-nums ${color}`}>{texto}</span>;
  return (
    <>
      <Tooltip texto="Cambiar fecha">
        <button
          ref={ancla}
          type="button"
          onClick={() => setAbierto((x) => !x)}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-label={`Para cuándo: ${texto}. Cambiar la fecha de «${t.titulo}»`}
          className={`inline-flex min-h-8 items-center rounded-md px-1.5 text-sm tabular-nums hover:bg-muted ${color} ${anilloFoco}`}
        >
          {texto}
        </button>
      </Tooltip>
      {abierto && (
        <EditorFecha
          ancla={ancla}
          aria="Para cuándo"
          inicial={t.plazo ?? ""}
          alQuitar={() => {
            setAbierto(false);
            if (t.plazo) alElegir(null);
          }}
          alTerminar={(valor) => {
            setAbierto(false);
            if (valor === undefined) return;
            const nuevo = valor || null;
            if (nuevo !== t.plazo) alElegir(nuevo);
          }}
        />
      )}
    </>
  );
}

/** El producto de una tarea: foto, PUB-0000 y nombre. */
export function ChipPublicacion({ p, chico = false }: { p: PublicacionDeTarea | null | undefined; chico?: boolean }) {
  if (!p) return <span className="text-sm text-muted-foreground">Sin producto</span>;
  const foto = chico ? "h-7 w-7" : "h-9 w-9";
  return (
    <span className="flex min-w-0 items-center gap-2">
      {p.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.fotoUrl} alt="" className={`${foto} shrink-0 rounded-md border border-border object-cover`} loading="lazy" />
      ) : (
        <span className={`flex ${foto} shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground`}>
          <SinFotoIcon className="h-3.5 w-3.5" />
        </span>
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {numeroPublicacion(p.numero)}
          {p.dropiId ? ` · ID ${p.dropiId}` : ""}
        </span>
        <span className="truncate text-sm">{p.nombre}</span>
      </span>
    </span>
  );
}

/** Buscar el producto (la publicación) al que se asocia una tarea: por nombre, PUB-0000 o ID de Dropi, en el país de la barra. */
export function BuscadorPublicacion({ elegida, alElegir, enfocar = false }: { elegida: PublicacionDeTarea | null; alElegir: (p: PublicacionDeTarea | null) => void; enfocar?: boolean }) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<PublicacionDeTarea[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const id = useId();

  useEffect(() => {
    if (texto.trim().length < 2) return;
    let vigente = true;
    const espera = setTimeout(() => {
      setBuscando(true);
      buscarPublicacionesParaTarea(texto)
        .then((r) => vigente && setResultados(r.resultados))
        .catch(() => vigente && setResultados([]))
        .finally(() => vigente && setBuscando(false));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [texto]);

  if (elegida)
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-border-control bg-card px-2 py-1.5">
        <ChipPublicacion p={elegida} chico />
        <button type="button" onClick={() => alElegir(null)} className={`shrink-0 rounded px-2 py-1 text-xs font-medium text-primario hover:bg-muted ${anilloFoco}`}>
          Cambiar
        </button>
      </div>
    );
  const vistas = texto.trim().length >= 2 ? resultados : null;
  return (
    <div className="flex flex-col gap-1">
      <input
        autoFocus={enfocar}
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ej: Almohada viajera, PUB-0391 o 8179"
        aria-label="Buscar el producto de la tarea"
        aria-describedby={`${id}-ayuda`}
        className={`${fieldClass} w-full`}
      />
      <span id={`${id}-ayuda`} className="sr-only">
        Escribe al menos dos letras; los resultados salen debajo.
      </span>
      {buscando && <span className="text-xs text-muted-foreground">Buscando…</span>}
      {vistas && !buscando && (
        <ul aria-label="Productos encontrados" className="m-0 flex max-h-56 list-none flex-col gap-0.5 overflow-y-auto rounded-md border border-border bg-card p-1">
          {vistas.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados en este país.</li>}
          {vistas.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => alElegir(p)} className={`flex w-full rounded-md px-2 py-1.5 text-left hover:bg-muted ${anilloFoco}`}>
                <ChipPublicacion p={p} chico />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * «Agregar tarea»: qué hay que hacer, el producto (fijo si se abre desde una publicación; si no, se busca), para cuándo (mañana de entrada), a quién
 * le toca (a quien la crea, de entrada), la prioridad y una descripción.
 */
export function FormularioTarea({
  publicacion: fija,
  alCrear,
  alCancelar,
}: {
  /** La publicación de la tarea, si se abre desde ella; si no, se elige con el buscador. */
  publicacion?: PublicacionDeTarea | null;
  alCrear: (t: TareaVista, p: PublicacionDeTarea) => void;
  alCancelar: () => void;
}) {
  const id = useId();
  const { personas, yo } = usePersonasTareas();
  const { mostrarToast } = useToast();
  const [titulo, setTitulo] = useState("");
  const [producto, setProducto] = useState<PublicacionDeTarea | null>(fija ?? null);
  const [plazo, setPlazo] = useState(() => diaSiguiente(hoyPanama()));
  const [responsable, setResponsable] = useState(yo);
  const [prioridad, setPrioridad] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function guardar() {
    if (pendiente) return;
    if (!titulo.trim()) return void setError("Escribe qué hay que hacer.");
    if (!producto) return void setError("Elige el producto de la tarea.");
    setError(null);
    empezar(async () => {
      const r = await crearTareaPublicacion(producto.id, { titulo, plazo: plazo || null, responsableId: responsable || null, prioridad: prioridad || null, nota }).catch(() => ({
        error: "No se pudo. Inténtalo de nuevo.",
        tarea: undefined,
        publicacion: undefined,
      }));
      if (r.error || !r.tarea) return void setError(r.error ?? "No se pudo guardar la tarea.");
      mostrarToast("Tarea agregada");
      alCrear(r.tarea, r.publicacion ?? producto);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3" onKeyDown={sinEnviarFicha(guardar)}>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Qué hay que hacer *</span>
        <input
          autoFocus
          type="text"
          maxLength={MAX_TITULO_TAREA}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej: Verificar el inventario en bodega"
          aria-invalid={(!!error && !titulo.trim()) || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${fieldClass} w-full`}
        />
      </label>
      {!fija && (
        <div className="flex flex-col gap-1">
          <span className={labelClassSm}>Producto *</span>
          <BuscadorPublicacion elegida={producto} alElegir={setProducto} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Para cuándo</span>
          <input type="date" value={plazo} onChange={(e) => setPlazo(e.target.value)} className={`${fieldClass} w-full`} />
        </label>
        {personas.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Quién la hace</span>
            <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={`${fieldClass} w-full`}>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === yo ? `${p.nombre} (yo)` : p.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Prioridad</span>
          <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className={`${fieldClass} w-full`}>
            <option value="">Sin prioridad</option>
            {PRIORIDADES.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Descripción</span>
        <textarea rows={2} maxLength={MAX_NOTA_TAREA} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej: Contar las que quedan en el estante B" className={`${fieldClass} w-full`} />
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={guardar} disabled={pendiente} className={botonOscuro}>
          {pendiente ? "Guardando…" : "Agregar tarea"}
        </button>
        <button type="button" onClick={alCancelar} className={botonClaro}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Las columnas de la fila de una tarea (la misma rejilla en el encabezado). */
export const COLUMNAS_TAREA = "lg:grid-cols-[2rem_minmax(0,1fr)_minmax(0,15rem)_2.5rem_6.5rem_2.5rem]";
export const COLUMNAS_TAREA_SIN_PRODUCTO = "sm:grid-cols-[2rem_minmax(0,1fr)_2.5rem_6.5rem_2.5rem]";

/**
 * Una tarea en una lista, como una fila de ClickUp: el círculo del estado, qué hay que hacer (abre su ficha), el producto, a quién le toca, para
 * cuándo y la prioridad. Cada dato se cambia ahí mismo.
 */
export function FilaTarea({
  t,
  hoy,
  publicacion,
  conProducto = true,
  conEstados,
  puedeEscribir,
  alAbrir,
  alCambiar,
}: {
  t: TareaVista;
  hoy: string;
  publicacion?: PublicacionDeTarea | null;
  conProducto?: boolean;
  conEstados: boolean;
  puedeEscribir: boolean;
  alAbrir: () => void;
  alCambiar: (t: TareaVista, p?: PublicacionDeTarea) => void;
}) {
  const { cambiar } = useCambiarTarea(alCambiar);
  const hecha = t.estado === "hecha";
  return (
    <div className={`grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 py-1.5 transition-colors hover:bg-muted/50 ${conProducto ? COLUMNAS_TAREA : COLUMNAS_TAREA_SIN_PRODUCTO}`}>
      <MenuEstado t={t} puedeEscribir={puedeEscribir} conEstados={conEstados} alElegir={(estado) => cambiar(t, { estado })} />
      <button type="button" onClick={alAbrir} aria-label={`Abrir la tarea «${t.titulo}»`} className={`flex min-w-0 flex-col items-start rounded-md py-1 text-left ${anilloFoco}`}>
        <span className={`max-w-full truncate text-sm font-medium hover:underline ${hecha ? "text-muted-foreground line-through" : ""}`}>{t.titulo}</span>
        {(t.nota || t.origen === "recomendacion" || t.archivadaEn) && (
          <span className="max-w-full truncate text-xs text-muted-foreground">
            {t.archivadaEn ? "Archivada · " : ""}
            {t.origen === "recomendacion" ? "De una recomendación" : t.nota}
          </span>
        )}
      </button>
      {conProducto && (
        <span className="col-start-2 min-w-0 lg:col-start-auto">
          <ChipPublicacion p={publicacion} chico />
        </span>
      )}
      <span className={`col-start-2 flex items-center gap-1 ${conProducto ? "lg:col-start-auto lg:contents" : "sm:col-start-auto sm:contents"}`}>
        <MenuResponsable t={t} puedeEscribir={puedeEscribir} alElegir={(responsableId) => cambiar(t, { responsableId })} />
        <span className="min-w-0">{!hecha && <MenuFecha t={t} hoy={hoy} puedeEscribir={puedeEscribir} alElegir={(plazo) => cambiar(t, { plazo })} />}</span>
        {conEstados ? <MenuPrioridad t={t} puedeEscribir={puedeEscribir} alElegir={(prioridad) => cambiar(t, { prioridad })} /> : <span />}
      </span>
    </div>
  );
}
