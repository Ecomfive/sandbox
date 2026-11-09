"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClass, fieldClassSm, labelClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ETIQUETA_ESTADO_TAREA, type ColorTarea, type EstadoTarea, type ResultadoAuto } from "@/lib/finanzas/cierre";
import type { Atraso } from "@/lib/finanzas/cierre-control";
import { marcarTarea } from "../actions";
import { asignarTarea } from "../control-actions";
import { PuntoTarea } from "../estado";

export interface TareaVista {
  clave: string;
  titulo: string;
  href: string;
  resultado: ResultadoAuto;
  detalle: string;
  estado: EstadoTarea;
  aMano: boolean;
  comentario: string | null;
  color: ColorTarea;
  /** «Marcado por X el …», ya armado en el servidor. */
  marca: string | null;
  /** Semáforo de atraso contra su fecha límite (la propia o la fecha objetivo del mes). */
  atraso: Atraso;
  plazo: string;
  /** «7 oct» y si es la del mes o una propia. */
  vence: string;
  fechaLimite: string | null;
  responsableId: string | null;
  responsable: string | null;
  /** No se marca a mano (las variaciones). */
  sinMarca: boolean;
}

const CLASE_ATRASO: Record<Atraso, string> = { resuelta: "", en_plazo: "", por_vencer: "bg-warning", vencida: "bg-destructive" };

function FormularioAsignar({
  periodo,
  tarea,
  personas,
  alTerminar,
}: {
  periodo: string;
  tarea: TareaVista;
  personas: { id: string; nombre: string }[];
  alTerminar: () => void;
}) {
  const [responsable, setResponsable] = useState(tarea.responsableId ?? "");
  const [fecha, setFecha] = useState(tarea.fechaLimite ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await asignarTarea(periodo, tarea.clave, responsable, fecha);
      if (r.error) {
        setError(r.error);
        return;
      }
      mostrarToast(`${tarea.titulo}: guardado`);
      alTerminar();
      router.refresh();
    });
  }

  return (
    <form onSubmit={guardar} className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1">
          <span className={labelClassSm}>Responsable</span>
          <select value={responsable} onChange={(e) => setResponsable(e.target.value)} data-enfocar className={fieldClassSm}>
            <option value="">Sin responsable</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Fecha límite</span>
          <input type="date" value={fecha} min={periodo} onChange={(e) => setFecha(e.target.value)} className={fieldClassSm} />
        </label>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-destructive">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          {error}
        </p>
      )}
      <span className="flex justify-end gap-2">
        <button type="button" onClick={alTerminar} disabled={enviando} className={`rounded-md border border-border px-3 py-1 hover:bg-muted ${anilloFoco}`}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando} className={`rounded-md bg-foreground px-3 py-1 font-medium text-background disabled:opacity-50 ${anilloFoco}`}>
          {enviando ? "Guardando..." : "Guardar"}
        </button>
      </span>
    </form>
  );
}

const OPCIONES: EstadoTarea[] = ["hecho", "no_aplica", "pendiente"];
const ETIQUETA_OPCION: Record<EstadoTarea, string> = { hecho: "Hecho", no_aplica: "No aplica", pendiente: "Quitar la marca" };

function FormularioMarca({ periodo, tarea, alTerminar }: { periodo: string; tarea: TareaVista; alTerminar: () => void }) {
  const [estado, setEstado] = useState<EstadoTarea>(tarea.aMano ? tarea.estado : tarea.resultado === "ok" ? "hecho" : "no_aplica");
  const [comentario, setComentario] = useState(tarea.aMano ? (tarea.comentario ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();
  const pideComentario = estado === "no_aplica" || (estado === "hecho" && tarea.resultado !== "ok");
  const opciones = OPCIONES.filter((o) => o !== "pendiente" || tarea.aMano);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await marcarTarea(periodo, tarea.clave, estado, comentario);
      if (r.error) {
        setError(r.error);
        return;
      }
      mostrarToast(estado === "pendiente" ? "Marca quitada" : `${tarea.titulo}: ${ETIQUETA_ESTADO_TAREA[estado].toLowerCase()}`);
      alTerminar();
      router.refresh();
    });
  }

  return (
    <form onSubmit={guardar} className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-sm">
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">Marca de «{tarea.titulo}»</legend>
        {opciones.map((o) => (
          <label key={o} className="inline-flex items-center gap-1.5">
            <input type="radio" name={`marca-${tarea.clave}`} value={o} checked={estado === o} onChange={() => setEstado(o)} />
            {ETIQUETA_OPCION[o]}
          </label>
        ))}
      </fieldset>
      {estado !== "pendiente" && (
        <label className="flex flex-col gap-1">
          <span className={labelClass}>Comentario{pideComentario ? " *" : ""}</span>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={1000}
            rows={2}
            required={pideComentario}
            data-enfocar
            placeholder="Ej: ese mes no hubo repartos propios"
            className={fieldClass}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-destructive">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
          {error}
        </p>
      )}
      <span className="flex justify-end gap-2">
        <button type="button" onClick={alTerminar} disabled={enviando} className={`rounded-md border border-border px-3 py-1 hover:bg-muted ${anilloFoco}`}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando || (pideComentario && !comentario.trim())}
          aria-busy={enviando}
          className={`rounded-md bg-foreground px-3 py-1 font-medium text-background disabled:opacity-50 ${anilloFoco}`}
        >
          {enviando ? "Guardando..." : "Guardar"}
        </button>
      </span>
    </form>
  );
}

/** El checklist del mes: cada tarea con su punto, lo que vio el sistema, el enlace para resolverla y la marca a mano. */
export function ChecklistCierre({
  periodo,
  tareas,
  editable,
  personas,
}: {
  periodo: string;
  tareas: TareaVista[];
  editable: boolean;
  personas: { id: string; nombre: string }[];
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [asignando, setAsignando] = useState<string | null>(null);
  return (
    <ul className="m-0 list-none divide-y divide-border p-0">
      {tareas.map((t) => (
        <li key={t.clave} className="flex flex-col px-4 py-3">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <span className="mt-1.5">
              <PuntoTarea color={t.color} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-medium">{t.titulo}</p>
              <p className="m-0 text-xs text-muted-foreground">{t.detalle}</p>
              <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {t.atraso !== "resuelta" && (
                  <span className="inline-flex items-center gap-1.5 text-foreground">
                    {CLASE_ATRASO[t.atraso] && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${CLASE_ATRASO[t.atraso]}`} />}
                    {t.plazo}
                  </span>
                )}
                <span>Vence {t.vence}</span>
                <span>· {t.responsable ?? "Sin responsable"}</span>
              </p>
              {t.aMano && (
                <p className="m-0 mt-1 text-xs">
                  <span className="font-medium">{ETIQUETA_ESTADO_TAREA[t.estado]} a mano</span>
                  {t.marca ? <span className="text-muted-foreground"> · {t.marca}</span> : null}
                  {t.comentario ? <span className="text-muted-foreground"> · «{t.comentario}»</span> : null}
                </p>
              )}
            </div>
            <span className="flex shrink-0 gap-2">
              {t.color !== "verde" && (
                <Link href={t.href} className={`inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[13px] hover:bg-muted ${anilloFoco}`}>
                  Resolver
                  <span className="sr-only">: {t.titulo}</span>
                </Link>
              )}
              {editable && (
                <button
                  type="button"
                  aria-expanded={asignando === t.clave}
                  onClick={() => {
                    setAbierta(null);
                    setAsignando(asignando === t.clave ? null : t.clave);
                  }}
                  className={`inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[13px] hover:bg-muted ${anilloFoco}`}
                >
                  Asignar
                  <span className="sr-only">: {t.titulo}</span>
                </button>
              )}
              {editable && !t.sinMarca && (
                <button
                  type="button"
                  aria-expanded={abierta === t.clave}
                  onClick={() => {
                    setAsignando(null);
                    setAbierta(abierta === t.clave ? null : t.clave);
                  }}
                  className={`inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[13px] hover:bg-muted ${anilloFoco}`}
                >
                  Marcar
                  <span className="sr-only">: {t.titulo}</span>
                </button>
              )}
            </span>
          </div>
          {editable && abierta === t.clave && <FormularioMarca periodo={periodo} tarea={t} alTerminar={() => setAbierta(null)} />}
          {editable && asignando === t.clave && <FormularioAsignar periodo={periodo} tarea={t} personas={personas} alTerminar={() => setAsignando(null)} />}
        </li>
      ))}
    </ul>
  );
}
