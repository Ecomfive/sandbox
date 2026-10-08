"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { textoLegibleSobre } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { EtiquetaIcon } from "@/lib/nav-icons";
import type { FilaCompra } from "./def-compras";
import type { GuardarCelda } from "./celda-editable";
import { claseCampoPanel, PanelCelda } from "./panel-celda";

// Colores de las etiquetas (como en ClickUp): cada nombre toma siempre el mismo, así una etiqueta se ve igual en todas las
// compras. Fondo suave y texto del mismo tono, legible en claro y en oscuro.
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
  if (color)
    return (
      <span style={{ backgroundColor: color, color: textoLegibleSobre(color) }} className="inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[0.68rem] font-medium tracking-wide whitespace-nowrap uppercase">
        {nombre}
      </span>
    );
  const c = colorEtiqueta(nombre);
  return (
    <span style={{ backgroundColor: c.fondo, color: c.texto }} className="inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[0.68rem] font-medium tracking-wide whitespace-nowrap uppercase">
      {nombre}
    </span>
  );
}

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Las etiquetas de una compra junto a su nombre, como en ClickUp: pastillas de color y, al pasar por la fila, un ícono que
 * abre el selector («Buscar o añadir etiquetas…»): pulsar una la pone o la quita; escribir una nueva y Enter la crea. Se
 * guarda al instante (igual que una celda) y queda en la Actividad. Sin permiso de escritura, solo se ven.
 */
export function EtiquetasCompra({
  compra,
  todas,
  colores,
  puedeEscribir,
  guardar,
  cambiarColor,
  sinPastillas = false,
}: {
  compra: FilaCompra;
  todas: string[];
  /** El color elegido de cada etiqueta (por su nombre). */
  colores: Record<string, string>;
  puedeEscribir: boolean;
  guardar: GuardarCelda;
  cambiarColor: (nombre: string, color: string) => void;
  /** Solo el botón: las pastillas ya se ven en otro lado (junto al nombre de la compra, dentro de su botón). */
  sinPastillas?: boolean;
}) {
  // La etiqueta cuya paleta de colores está abierta en el selector.
  const [pintando, setPintando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const boton = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const puestas = compra.etiquetas;

  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);

  const q = normal(busqueda);
  const opciones = useMemo(() => {
    const lista = [...new Set([...todas, ...puestas])].sort((a, b) => a.localeCompare(b, "es"));
    return q ? lista.filter((e) => normal(e).includes(q)) : lista;
  }, [todas, puestas, q]);
  const nueva = busqueda.trim().replace(/\s+/g, " ").slice(0, 40);
  const puedeCrear = !!nueva && ![...todas, ...puestas].some((e) => normal(e) === normal(nueva));

  function alternar(e: string) {
    guardar(compra, "etiquetas", puestas.includes(e) ? puestas.filter((x) => x !== e) : [...puestas, e]);
  }
  function crear() {
    if (!puedeCrear) return;
    setPintando(null);
    guardar(compra, "etiquetas", [...puestas, nueva]);
    setBusqueda("");
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {!sinPastillas &&
        puestas.map((e) => (
          <PastillaEtiqueta key={e} nombre={e} color={colores[e]} />
        ))}
      {puedeEscribir && (
        <button
          ref={boton}
          type="button"
          aria-label={`Etiquetas de ${compra.nombre}`}
          title="Etiquetas"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          onClick={(ev) => {
            ev.stopPropagation();
            setAbierto((v) => !v);
          }}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground hover:text-foreground ${
            abierto ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          } ${anilloFoco}`}
        >
          <EtiquetaIcon className="h-3 w-3" />
        </button>
      )}
      {abierto && (
          <PanelCelda
            ancla={boton}
            etiqueta="Etiquetas de la compra"
            ancho={280}
            alCerrar={(m) => {
              setAbierto(false);
              if (m === "escape") boton.current?.focus();
            }}
          >
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
                    </span>
                    {pintando === e && (
                      <span role="group" aria-label={`Colores para ${e}`} className="flex flex-wrap gap-1.5 px-2 pt-1 pb-2">
                        {COLORES_ETIQUETA.map((color) => (
                          <button
                            key={color}
                            type="button"
                            aria-label={`Color ${color}`}
                            aria-pressed={colores[e] === color}
                            onClick={() => {
                              cambiarColor(e, color);
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
        )}
    </span>
  );
}
