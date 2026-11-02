"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { claseCampoPanel, PanelCelda, type MotivoCierre } from "@/app/(app)/compras/panel-celda";
import { textoLegibleSobre } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { limpiarEtiqueta, normalEtiqueta } from "@/lib/etiquetas";

// Colores de las etiquetas (como en ClickUp): cada nombre toma siempre el mismo, así una etiqueta se ve igual en todos los
// registros. Fondo suave y texto del mismo tono, legible en claro y en oscuro.
const PALETA = [
  { fondo: "#ede9fe", texto: "#5b21b6" },
  { fondo: "#fce7f3", texto: "#9d174d" },
  { fondo: "#dbeafe", texto: "#1e40af" },
  { fondo: "#dcfce7", texto: "#166534" },
  { fondo: "#fef3c7", texto: "#92400e" },
  { fondo: "#e0f2fe", texto: "#075985" },
  { fondo: "#fee2e2", texto: "#991b1b" },
  { fondo: "#f3e8ff", texto: "#6b21a8" },
  { fondo: "#ccfbf1", texto: "#115e59" },
  { fondo: "#ffedd5", texto: "#9a3412" },
];
export function colorEtiqueta(nombre: string) {
  let h = 0;
  for (const ch of nombre.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

/** Los colores para elegir (como la paleta de etiquetas de ClickUp). */
export const COLORES_ETIQUETA = [
  "#7B68EE",
  "#5B4FD8",
  "#3E63DD",
  "#0090FF",
  "#12A594",
  "#30A46C",
  "#FFC53D",
  "#F76B15",
  "#E5484D",
  "#D6409F",
  "#8E4EC6",
  "#00A2C7",
  "#A18072",
  "#8D8D8D",
  "#202020",
];

/** Una etiqueta, siempre en mayúsculas: con su color elegido (fondo lleno, como en ClickUp) o, si no tiene, el automático (suave). */
export function PastillaEtiqueta({ nombre, color }: { nombre: string; color?: string }) {
  const c = color ? { fondo: color, texto: textoLegibleSobre(color) } : colorEtiqueta(nombre);
  return (
    <span style={{ backgroundColor: c.fondo, color: c.texto }} className="inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[0.68rem] font-medium tracking-wide whitespace-nowrap uppercase">
      {nombre}
    </span>
  );
}

/**
 * El selector de etiquetas de ClickUp, bajo el botón que lo abre: «Buscar o añadir etiquetas…»; pulsar una la pone o la quita, escribir una
 * nueva y Enter la crea, y el círculo de cada una elige su color (vale para todos los registros que la tengan). Lo usan Compras y la Bandeja de
 * WhatsApp; cada módulo guarda a su manera (`alCambiar`, `alColor`). Con `alEliminar` (el CRM) cada etiqueta tiene además una papelera que, tras
 * confirmar, la elimina de todos los registros.
 */
export function PanelEtiquetas({
  ancla,
  titulo,
  puestas,
  todas,
  colores,
  alCambiar,
  alColor,
  alCerrar,
  alEliminar,
}: {
  ancla: RefObject<HTMLElement | null>;
  /** El nombre del panel para lectores de pantalla («Etiquetas de la compra»). */
  titulo: string;
  puestas: string[];
  /** Las etiquetas que ya existen en el módulo, para elegir. */
  todas: string[];
  /** El color elegido de cada etiqueta (por su nombre). */
  colores: Record<string, string>;
  alCambiar: (etiquetas: string[]) => void;
  alColor: (nombre: string, color: string) => void;
  alCerrar: (motivo: MotivoCierre) => void;
  /** Elimina la etiqueta de todos los registros (se pregunta antes). Sin esto, no se ofrece. */
  alEliminar?: (nombre: string) => void;
}) {
  const [pintando, setPintando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const q = normalEtiqueta(busqueda);
  const opciones = useMemo(() => {
    const lista = [...new Set([...todas, ...puestas])].sort((a, b) => a.localeCompare(b, "es"));
    return q ? lista.filter((e) => normalEtiqueta(e).includes(q)) : lista;
  }, [todas, puestas, q]);
  const nueva = limpiarEtiqueta(busqueda) ?? "";
  const puedeCrear = !!nueva && ![...todas, ...puestas].some((e) => normalEtiqueta(e) === normalEtiqueta(nueva));

  const alternar = (e: string) => alCambiar(puestas.includes(e) ? puestas.filter((x) => x !== e) : [...puestas, e]);
  function crear() {
    if (!puedeCrear) return;
    setPintando(null);
    alCambiar([...puestas, nueva]);
    setBusqueda("");
  }

  return (
    <PanelCelda ancla={ancla} etiqueta={titulo} ancho={280} alCerrar={alCerrar}>
      <input
        ref={campo}
        value={busqueda}
        onChange={(ev) => setBusqueda(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            if (puedeCrear) crear();
            else if (opciones.length === 1) alternar(opciones[0]);
          }
        }}
        placeholder="Buscar o añadir etiquetas…"
        aria-label="Buscar o añadir etiquetas"
        className={claseCampoPanel}
      />
      <p className="m-0 px-3 pt-2 pb-1 text-xs text-muted-foreground">Selecciona una opción</p>
      <ul className="m-0 flex max-h-64 list-none flex-col gap-0.5 overflow-y-auto p-1.5 pt-0">
        {puedeCrear && (
          <li>
            <button type="button" onClick={crear} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${anilloFoco}`}>
              <span className="text-muted-foreground">Crear</span> <PastillaEtiqueta nombre={nueva} color={colores[nueva]} />
            </button>
          </li>
        )}
        {opciones.map((e) => {
          const puesta = puestas.includes(e);
          const actual = colores[e] ?? colorEtiqueta(e).texto;
          return (
            <li key={e} className="flex flex-col">
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={puesta}
                  onClick={() => alternar(e)}
                  className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted ${anilloFoco}`}
                >
                  <PastillaEtiqueta nombre={e} color={colores[e]} />
                  {puesta && <span className="text-xs text-primario">✓</span>}
                </button>
                <button
                  type="button"
                  aria-label={`Color de la etiqueta ${e}`}
                  title="Color"
                  aria-expanded={pintando === e}
                  onClick={() => setPintando((p) => (p === e ? null : e))}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-muted ${anilloFoco}`}
                >
                  <span aria-hidden="true" style={{ backgroundColor: actual }} className="h-3 w-3 rounded-full ring-1 ring-border" />
                </button>
                {alEliminar && (
                  <button
                    type="button"
                    aria-label={`Eliminar la etiqueta ${e}`}
                    title="Eliminar etiqueta"
                    aria-expanded={borrando === e}
                    onClick={() => {
                      setPintando(null);
                      setBorrando((b) => (b === e ? null : e));
                    }}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive ${anilloFoco}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                    </svg>
                  </button>
                )}
              </span>
              {alEliminar && borrando === e && (
                <span role="group" aria-label={`Eliminar ${e}`} className="mx-1 mb-1 flex flex-col gap-1.5 rounded-md bg-destructive-soft px-2 py-1.5 text-xs text-destructive">
                  Se quita de todos los registros que la tienen y deja de ofrecerse.
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setBorrando(null);
                        alEliminar(e);
                      }}
                      className={`rounded-md bg-destructive px-2 py-0.5 font-medium text-white hover:opacity-90 ${anilloFoco}`}
                    >
                      Eliminar
                    </button>
                    <button type="button" onClick={() => setBorrando(null)} className={`rounded-md px-2 py-0.5 text-foreground hover:bg-muted ${anilloFoco}`}>
                      Cancelar
                    </button>
                  </span>
                </span>
              )}
              {pintando === e && (
                <span role="group" aria-label={`Colores para ${e}`} className="flex flex-wrap gap-1.5 px-2 pt-1 pb-2">
                  {COLORES_ETIQUETA.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Color ${color}`}
                      aria-pressed={colores[e] === color}
                      onClick={() => {
                        alColor(e, color);
                        setPintando(null);
                      }}
                      style={{ backgroundColor: color }}
                      className={`h-5 w-5 rounded-full ${colores[e] === color ? "ring-2 ring-foreground ring-offset-1 ring-offset-card" : ""} ${anilloFoco}`}
                    />
                  ))}
                </span>
              )}
            </li>
          );
        })}
        {opciones.length === 0 && !puedeCrear && <li className="px-2 py-1.5 text-xs text-muted-foreground">Sin etiquetas.</li>}
      </ul>
    </PanelCelda>
  );
}
