"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CheckIcon } from "@/lib/nav-icons";
import { ordenarTareas, type TareaVista } from "@/lib/publicaciones/tareas";
import type { FilaPublicacion } from "./def-publicaciones";
import { obtenerTareasPublicacion } from "./tareas-actions";
import { FormularioTarea, hoyPanama, LineaTarea } from "./tareas-piezas";

/**
 * Las tareas escritas a mano de una publicación (pedido de Alcides, 28 oct 2026): «Agregar tarea» (qué, para cuándo y a quién le toca) y cada una con
 * «Resolver». Las pendientes primero; las hechas se pliegan. Todas, de cualquier persona, se ven también en la pestaña «Tareas».
 */
export function TareasPublicacion({ p, puedeEscribir }: { p: FilaPublicacion; puedeEscribir: boolean }) {
  const [tareas, setTareas] = useState<TareaVista[] | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [verHechas, setVerHechas] = useState(false);
  const hoy = hoyPanama();

  useEffect(() => {
    let vigente = true;
    obtenerTareasPublicacion(p.id)
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) return setError(r.error);
        setTareas(r.tareas);
        setDisponible(r.disponible);
      })
      .catch(() => vigente && setError("No se pudieron cargar las tareas."));
    return () => {
      vigente = false;
    };
  }, [p.id]);

  if (!disponible) return null;
  const ordenadas = ordenarTareas(tareas ?? [], hoy);
  const pendientes = ordenadas.filter((t) => !t.hechaEn);
  const hechas = ordenadas.filter((t) => t.hechaEn);
  const cambiar = (t: TareaVista) => setTareas((ts) => (ts ?? []).map((x) => (x.id === t.id ? t : x)));

  return (
    <div className="border-b border-border px-5 py-5">
      <Seccion icono={CheckIcon} titulo="Tareas">
        <div className="flex flex-col gap-3">
          {error && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {error}
            </p>
          )}
          {tareas === null && !error && <p className="m-0 text-sm text-muted-foreground">Cargando…</p>}
          {tareas !== null && pendientes.length === 0 && !agregando && <p className="m-0 text-sm text-muted-foreground">Sin tareas pendientes.</p>}
          {pendientes.length > 0 && (
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {pendientes.map((t) => (
                <LineaTarea key={t.id} t={t} hoy={hoy} puedeEscribir={puedeEscribir} alResolver={cambiar} />
              ))}
            </ul>
          )}
          {agregando ? (
            <FormularioTarea
              publicacionId={p.id}
              alCancelar={() => setAgregando(false)}
              alCrear={(t) => {
                setTareas((ts) => [t, ...(ts ?? [])]);
                setAgregando(false);
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {puedeEscribir && (
                <button type="button" onClick={() => setAgregando(true)} className={`inline-flex min-h-9 items-center rounded-md border border-border-control bg-card px-3 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
                  + Agregar tarea
                </button>
              )}
              <Link href="/publicaciones-dropi/tareas" className={`text-sm font-medium text-primario underline-offset-2 hover:underline ${anilloFoco}`}>
                Ver todas las tareas
              </Link>
            </div>
          )}
          {hechas.length > 0 && (
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => setVerHechas((v) => !v)} aria-expanded={verHechas} className={`self-start text-sm text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`}>
                {verHechas ? "Ocultar las hechas" : `Ver ${hechas.length} ${hechas.length === 1 ? "hecha" : "hechas"}`}
              </button>
              {verHechas && (
                <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                  {hechas.map((t) => (
                    <LineaTarea key={t.id} t={t} hoy={hoy} puedeEscribir={false} alResolver={cambiar} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Seccion>
    </div>
  );
}
