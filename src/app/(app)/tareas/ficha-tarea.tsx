"use client";

import { useState } from "react";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha } from "@/lib/formato";
import { ESTADOS_TAREA, etiquetaEstado, etiquetaPrioridad, MAX_DESCRIPCION, MAX_TITULO, numeroTarea, PRIORIDADES_TAREA, type CambioTarea } from "@/lib/tareas/tareas";
import { obtenerHistorialTarea } from "./actions";
import type { PersonaTarea, TareaVista } from "./datos";
import { Bandera, CirculoEstado, fechaCorta, Iniciales, MenuFecha, MenuOpciones, opcionesEstado, opcionesPrioridad } from "./piezas";

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-3">
      <dt className="w-32 shrink-0 text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0 min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/**
 * La ficha de una tarea (panel a la derecha): título y descripción que se guardan al salir del campo, y cada dato con su menú, como en
 * ClickUp. Al final, su actividad. «Archivar» la saca de la lista sin borrarla.
 */
export function FichaTarea({
  t,
  personas,
  modulos,
  puedeAsignarOtros,
  miId,
  version,
  alCambiar,
  alCerrar,
}: {
  t: TareaVista;
  personas: PersonaTarea[];
  modulos: { clave: string; etiqueta: string }[];
  puedeAsignarOtros: boolean;
  miId: string;
  version: number;
  alCambiar: (t: TareaVista, cambio: CambioTarea) => void;
  alCerrar: () => void;
}) {
  const [titulo, setTitulo] = useState(t.titulo);
  const [descripcion, setDescripcion] = useState(t.descripcion ?? "");
  const cambiar = (c: CambioTarea) => alCambiar(t, c);
  const personasMenu = puedeAsignarOtros ? personas : personas.filter((p) => p.id === miId || p.id === t.responsableId);
  const etiquetaModulo = modulos.find((m) => m.clave === t.modulo)?.etiqueta ?? null;
  const archivada = t.estado === "archivado";

  return (
    <Ventana abierto alCerrar={alCerrar} lado="derecha" ancho="lg" titulo={<span className="text-sm font-medium text-muted-foreground tabular-nums">{numeroTarea(t.numero)}</span>}>
      <div className="flex flex-col gap-5 p-5">
        <label className="flex flex-col gap-1">
          <span className="sr-only">Título</span>
          <input
            value={titulo}
            maxLength={MAX_TITULO}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => titulo.trim() && titulo.trim() !== t.titulo && cambiar({ titulo: titulo.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            className={`w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-xl font-semibold tracking-tight hover:border-border-control focus:border-foreground focus:outline-none ${anilloFoco}`}
          />
        </label>

        <dl className="m-0 flex flex-col gap-1">
          <Dato etiqueta="Estado">
            <MenuOpciones
              etiqueta="Estado de la tarea"
              ayuda="Cambiar estado"
              opciones={opcionesEstado(ESTADOS_TAREA)}
              valor={t.estado}
              alElegir={(v) => cambiar({ estado: v as CambioTarea["estado"] })}
              puedeEscribir
              className="rounded-full border border-border-control px-2.5 py-1 text-xs font-semibold uppercase hover:bg-muted"
            >
              <CirculoEstado estado={t.estado} className="h-3 w-3" />
              {etiquetaEstado(t.estado)}
            </MenuOpciones>
          </Dato>
          <Dato etiqueta="Asignada a">
            <MenuOpciones
              etiqueta="Persona asignada"
              ayuda="Asignar tarea"
              opciones={[{ valor: "", etiqueta: "Sin asignar", icono: <Iniciales nombre={null} className="h-6 w-6 text-[10px]" /> }, ...personasMenu.map((p) => ({ valor: p.id, etiqueta: p.nombre, icono: <Iniciales nombre={p.nombre} className="h-6 w-6 text-[10px]" /> }))]}
              valor={t.responsableId ?? ""}
              alElegir={(v) => cambiar({ responsableId: v || null })}
              puedeEscribir
              className="px-1 py-0.5 hover:bg-muted"
            >
              <Iniciales nombre={t.responsableNombre} className="h-6 w-6 text-[10px]" />
              <span>{t.responsableNombre ?? "Sin asignar"}</span>
            </MenuOpciones>
          </Dato>
          <Dato etiqueta="Fecha de inicio">
            <MenuFecha etiqueta="Fecha de inicio" valor={t.fechaInicio} alElegir={(v) => cambiar({ fechaInicio: v })} puedeEscribir className="px-1 py-0.5 hover:bg-muted">
              {t.fechaInicio ? fechaCorta(t.fechaInicio) : <span className="text-muted-foreground">Sin fecha</span>}
            </MenuFecha>
          </Dato>
          <Dato etiqueta="Fecha límite">
            <MenuFecha etiqueta="Fecha límite" valor={t.fechaLimite} alElegir={(v) => cambiar({ fechaLimite: v })} puedeEscribir className="px-1 py-0.5 hover:bg-muted">
              {t.fechaLimite ? fechaCorta(t.fechaLimite) : <span className="text-muted-foreground">Sin fecha</span>}
            </MenuFecha>
          </Dato>
          <Dato etiqueta="Prioridad">
            <MenuOpciones
              etiqueta="Prioridad"
              ayuda="Cambiar prioridad"
              opciones={opcionesPrioridad(PRIORIDADES_TAREA)}
              valor={t.prioridad ?? ""}
              alElegir={(v) => cambiar({ prioridad: (v || null) as CambioTarea["prioridad"] })}
              puedeEscribir
              className="px-1 py-0.5 hover:bg-muted"
            >
              <Bandera prioridad={t.prioridad} />
              <span>{etiquetaPrioridad(t.prioridad)}</span>
            </MenuOpciones>
          </Dato>
          <Dato etiqueta="Módulo">
            <MenuOpciones
              etiqueta="Módulo del sistema"
              ayuda="Cambiar módulo"
              opciones={[{ valor: "", etiqueta: "Ninguno" }, ...modulos.map((m) => ({ valor: m.clave, etiqueta: m.etiqueta }))]}
              valor={t.modulo ?? ""}
              alElegir={(v) => cambiar({ modulo: v || null })}
              puedeEscribir
              className="px-1 py-0.5 hover:bg-muted"
            >
              {etiquetaModulo ?? <span className="text-muted-foreground">Ninguno</span>}
            </MenuOpciones>
          </Dato>
          <Dato etiqueta="Creada">
            <span className="text-muted-foreground">
              {formatearFecha(t.creadoEn.slice(0, 10))}
              {t.creadoPorNombre ? ` · ${t.creadoPorNombre}` : ""}
            </span>
          </Dato>
        </dl>

        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Descripción</span>
          <textarea
            value={descripcion}
            rows={6}
            maxLength={MAX_DESCRIPCION}
            onChange={(e) => setDescripcion(e.target.value)}
            onBlur={() => descripcion.trim() !== (t.descripcion ?? "") && cambiar({ descripcion: descripcion.trim() || null })}
            placeholder="Ej: qué hay que hacer y cómo se sabe que está listo"
            className={`${fieldClass} resize-y leading-relaxed`}
          />
        </label>

        <div>
          <button
            type="button"
            onClick={() => cambiar({ estado: archivada ? "pendiente" : "archivado" })}
            className={`inline-flex min-h-9 items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted ${anilloFoco}`}
          >
            {archivada ? "Sacar de archivadas" : "Archivar tarea"}
          </button>
        </div>
      </div>
      <HistorialGenerico id={t.id} codigoPais="PA" version={version} obtener={obtenerHistorialTarea} />
    </Ventana>
  );
}
