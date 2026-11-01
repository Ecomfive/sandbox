"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { colorEstado, colorPrioridad, etiquetaEstado, etiquetaPrioridad } from "@/lib/tareas/tareas";
import { EditorFecha } from "../compras/celda-editable";
import { claseCampoPanel, claseOpcionPanel, PanelCelda } from "../compras/panel-celda";

export interface Opcion {
  valor: string;
  etiqueta: string;
  icono?: ReactNode;
}

/** Hoy en Panamá (AAAA-MM-DD). */
export const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «12 nov»; si no es de este año, «12 nov 25». */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-");
  const esteAno = a === hoyPanama().slice(0, 4);
  return `${Number(d)} ${MESES[Number(m) - 1]}${esteAno ? "" : ` ${a.slice(2)}`}`;
}

/** El círculo de color del estado (como en ClickUp): lleno si está hecho o archivado, con borde si no. */
export function CirculoEstado({ estado, className = "h-3.5 w-3.5" }: { estado: string; className?: string }) {
  const color = colorEstado(estado);
  const lleno = estado === "hecho" || estado === "archivado";
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full border-2 ${className}`} style={{ borderColor: color, background: lleno ? color : "transparent" }} />;
}

/** La bandera de la prioridad, con su color; gris y punteada sin prioridad. */
export function Bandera({ prioridad, className = "h-4 w-4" }: { prioridad: string | null; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill={prioridad ? colorPrioridad(prioridad) : "none"} stroke={colorPrioridad(prioridad)} strokeWidth={1.75} strokeDasharray={prioridad ? undefined : "2 2"}>
      <path d="M5 21V4m0 0h11l-2 4 2 4H5" strokeLinejoin="round" />
    </svg>
  );
}

/** Las iniciales de una persona en un círculo; punteado si no hay nadie. */
export function Iniciales({ nombre, className = "h-7 w-7 text-[11px]" }: { nombre: string | null; className?: string }) {
  if (!nombre)
    return (
      <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-control text-muted-foreground ${className}`}>
        +
      </span>
    );
  const ini = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-foreground font-semibold text-background ${className}`}>
      {ini}
    </span>
  );
}

/** La lista de opciones de un menú de celda: flechas y Enter, y buscador si son muchas. */
function PanelLista({ ancla, aria, opciones, elegida, alElegir, alCerrar }: { ancla: RefObject<HTMLElement | null>; aria: string; opciones: Opcion[]; elegida: string; alElegir: (v: string) => void; alCerrar: () => void }) {
  const [busqueda, setBusqueda] = useState("");
  const conBuscador = opciones.length > 7;
  const limpio = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const vistas = busqueda ? opciones.filter((o) => limpio(o.etiqueta).includes(limpio(busqueda))) : opciones;
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

/** Un botón que abre una lista de opciones bajo él y guarda al elegir (estado, prioridad, persona, módulo). */
export function MenuOpciones({
  etiqueta,
  ayuda,
  opciones,
  valor,
  alElegir,
  puedeEscribir,
  children,
  className = "",
}: {
  etiqueta: string;
  ayuda: string;
  opciones: Opcion[];
  valor: string;
  alElegir: (v: string) => void;
  puedeEscribir: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ancla = useRef<HTMLButtonElement>(null);
  if (!puedeEscribir) return <span className={`inline-flex items-center gap-1.5 ${className}`}>{children}</span>;
  return (
    <>
      <Tooltip texto={ayuda}>
        <button ref={ancla} type="button" aria-label={etiqueta} aria-haspopup="listbox" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)} className={`inline-flex items-center gap-1.5 rounded-md ${anilloFoco} ${className}`}>
          {children}
        </button>
      </Tooltip>
      {abierto && (
        <PanelLista
          ancla={ancla}
          aria={etiqueta}
          opciones={opciones}
          elegida={valor}
          alElegir={(v) => {
            setAbierto(false);
            if (v !== valor) alElegir(v);
          }}
          alCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}

/** Un botón con una fecha que abre el editor de fecha de Compras (Hoy, Mañana, En una semana, Quitar). */
export function MenuFecha({ etiqueta, valor, alElegir, puedeEscribir, children, className = "" }: { etiqueta: string; valor: string | null; alElegir: (v: string | null) => void; puedeEscribir: boolean; children: ReactNode; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const ancla = useRef<HTMLButtonElement>(null);
  if (!puedeEscribir) return <span className={className}>{children}</span>;
  return (
    <>
      <Tooltip texto={etiqueta}>
        <button ref={ancla} type="button" aria-label={`${etiqueta}: ${valor ? fechaCorta(valor) : "sin fecha"}`} aria-expanded={abierto} onClick={() => setAbierto((a) => !a)} className={`inline-flex items-center rounded-md ${anilloFoco} ${className}`}>
          {children}
        </button>
      </Tooltip>
      {abierto && (
        <EditorFecha
          ancla={ancla}
          aria={etiqueta}
          inicial={valor ?? ""}
          conQuitar={!!valor}
          alQuitar={() => {
            setAbierto(false);
            alElegir(null);
          }}
          alTerminar={(v, motivo) => {
            setAbierto(false);
            if (motivo === "escape" || v === undefined) return;
            const nuevo = v || null;
            if (nuevo !== valor) alElegir(nuevo);
          }}
        />
      )}
    </>
  );
}

/** Las opciones de estado, con su círculo de color. */
export const opcionesEstado = (estados: readonly { valor: string }[]): Opcion[] => estados.map((e) => ({ valor: e.valor, etiqueta: etiquetaEstado(e.valor), icono: <CirculoEstado estado={e.valor} /> }));
/** Las opciones de prioridad, con su bandera. */
export const opcionesPrioridad = (prioridades: readonly { valor: string }[]): Opcion[] => [
  ...prioridades.map((p) => ({ valor: p.valor, etiqueta: etiquetaPrioridad(p.valor), icono: <Bandera prioridad={p.valor} /> })),
  { valor: "", etiqueta: "Sin prioridad", icono: <Bandera prioridad={null} /> },
];
