"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { anilloFoco } from "@/components/ui/field";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { cuandoTarea, ESTADOS_TAREA, etiquetaPrioridad, responsablesDe, vencimiento, type EstadoTarea, type TareaVista } from "@/lib/publicaciones/tareas";
import { BanderaIcon, CirculoEstado, InicialesVarias, MenuEstado, useCambiarTarea } from "../tareas-piezas";
import type { PublicacionDeTarea } from "../tareas-datos";

type TareaConProducto = TareaVista & { producto: PublicacionDeTarea | null };

/**
 * La vista de tablero de las tareas (8 nov 2026, pedido de Alcides, como en ClickUp): una columna por estado y cada tarea una tarjeta que se arrastra a otra
 * columna para cambiar su estado (o, con el teclado, con el círculo de estado de la tarjeta). A «Estancada» no se arrastra: llega sola a los 3 días de vencida.
 * Una tarea de una recomendación solo pasa de Por hacer a Hecha. Pulsar el título abre la ficha.
 */
export function TableroTareas({
  tareas,
  hoy,
  conEstados,
  puedeEscribir,
  alCambiar,
  alAbrir,
}: {
  tareas: TareaConProducto[];
  hoy: string;
  conEstados: boolean;
  puedeEscribir: boolean;
  alCambiar: (t: TareaVista, p?: PublicacionDeTarea) => void;
  alAbrir: (id: string, orden: string[]) => void;
}) {
  const { cambiar } = useCambiarTarea(alCambiar);
  const { mostrarToast } = useToast();
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<EstadoTarea | null>(null);
  const vivas = tareas.filter((t) => !t.archivadaEn);
  const orden = ESTADOS_TAREA.flatMap((e) => vivas.filter((t) => t.estado === e.valor).map((t) => t.id));

  const soltar = (destino: EstadoTarea) => {
    const t = vivas.find((x) => x.id === arrastrando);
    setArrastrando(null);
    setSobre(null);
    if (!t || t.estado === destino) return;
    if (destino === "estancada") return mostrarToast("«Estancada» no se elige: la tarea llega sola a los 3 días de vencida.", "destructive");
    if (t.origen === "recomendacion" && destino !== "hecha") return mostrarToast("Una tarea de una recomendación solo pasa a Hecha.", "destructive");
    if (!conEstados && destino !== "hecha" && destino !== "por_hacer") return mostrarToast("Falta correr la migración 0178 para los demás estados.", "destructive");
    cambiar(t, { estado: destino });
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2" role="list" aria-label="Tablero de tareas por estado">
      {ESTADOS_TAREA.map((e) => {
        const columna = vivas.filter((t) => t.estado === e.valor);
        const resaltada = sobre === e.valor && arrastrando !== null && e.valor !== "estancada";
        return (
          <section
            key={e.valor}
            role="listitem"
            aria-label={`${e.etiqueta}: ${columna.length} ${columna.length === 1 ? "tarea" : "tareas"}`}
            onDragOver={(ev) => {
              if (!arrastrando || !puedeEscribir) return;
              ev.preventDefault();
              if (sobre !== e.valor) setSobre(e.valor);
            }}
            onDragLeave={() => sobre === e.valor && setSobre(null)}
            onDrop={(ev) => {
              ev.preventDefault();
              soltar(e.valor);
            }}
            className={`flex w-72 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-2 ${resaltada ? "border-primario ring-2 ring-primario/30" : "border-border"}`}
          >
            <h3 className="m-0 flex items-center gap-2 px-1.5 py-1 text-xs font-semibold tracking-wide uppercase">
              <CirculoEstado estado={e.valor} />
              {e.etiqueta}
              <span className="font-normal text-muted-foreground tabular-nums">{columna.length}</span>
            </h3>
            {columna.length === 0 && <p className="m-0 px-1.5 py-3 text-center text-xs text-muted-foreground">{e.valor === "estancada" ? "Ninguna estancada" : "Sin tareas"}</p>}
            {columna.map((t) => {
              const v = vencimiento(t, hoy);
              const color = v === "atrasada" ? "text-destructive font-medium" : v === "hoy" ? "text-warning font-medium" : "text-muted-foreground";
              return (
                <article
                  key={`${t.origen}-${t.id}`}
                  draggable={puedeEscribir}
                  onDragStart={(ev) => {
                    ev.dataTransfer.effectAllowed = "move";
                    ev.dataTransfer.setData("text/plain", t.id);
                    setArrastrando(t.id);
                  }}
                  onDragEnd={() => {
                    setArrastrando(null);
                    setSobre(null);
                  }}
                  className={`flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5 shadow-sm transition-opacity motion-reduce:transition-none ${arrastrando === t.id ? "opacity-40" : ""}`}
                >
                  <div className="flex items-start gap-1.5">
                    <MenuEstado t={t} puedeEscribir={puedeEscribir} conEstados={conEstados} alElegir={(estado) => cambiar(t, { estado })} />
                    <button
                      type="button"
                      onClick={() => alAbrir(t.id, orden)}
                      className={`min-w-0 flex-1 rounded-md py-1 text-left text-sm font-medium hover:underline ${t.estado === "hecha" ? "text-muted-foreground line-through" : ""} ${anilloFoco}`}
                    >
                      {t.titulo}
                    </button>
                  </div>
                  {t.producto && (
                    <span className="truncate text-xs text-muted-foreground">
                      {numeroPublicacion(t.producto.numero)} · {t.producto.nombre}
                    </span>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <InicialesVarias personas={responsablesDe(t)} />
                    <span className="flex items-center gap-2 text-xs tabular-nums">
                      {t.prioridad && (
                        <span role="img" aria-label={`Prioridad ${etiquetaPrioridad(t.prioridad).toLowerCase()}`}>
                          <BanderaIcon prioridad={t.prioridad} className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <span className={color}>{cuandoTarea(t.plazo, hoy)}</span>
                    </span>
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
