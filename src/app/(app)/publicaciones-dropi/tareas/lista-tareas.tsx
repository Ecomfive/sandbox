"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { SinFotoIcon } from "@/lib/nav-icons";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { ESTADOS_TAREA_MANUAL, estadoTarea, ordenarTareas, type EstadoTarea, type TareaVista } from "@/lib/publicaciones/tareas";
import type { PublicacionDeTarea } from "../tareas-datos";
import { LineaTarea } from "../tareas-piezas";

const pestana = (activa: boolean) =>
  `inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium ${activa ? "bg-foreground text-background" : "border border-border-control bg-card hover:bg-muted"} ${anilloFoco}`;

/** La publicación de una tarea: foto, PUB-0000 y nombre; abre su ficha. */
function Publicacion({ p }: { p: PublicacionDeTarea | undefined }) {
  if (!p) return <span className="h-10 w-10 shrink-0 rounded-md bg-muted" />;
  return (
    <Link href={`/publicaciones-dropi?abrir=${p.id}`} className={`flex w-full shrink-0 items-center gap-2 rounded-md sm:w-56 ${anilloFoco}`}>
      {p.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.fotoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" loading="lazy" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          <SinFotoIcon className="h-4 w-4" />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground tabular-nums">
          {numeroPublicacion(p.numero)}
          {p.dropiId ? ` · ID ${p.dropiId}` : ""}
        </span>
        <span className="truncate text-sm font-medium hover:underline">{p.nombre}</span>
      </span>
    </Link>
  );
}

/**
 * La pestaña «Tareas»: las pendientes agrupadas (atrasadas, para hoy, próximas y sin fecha) y las hechas de los últimos 30 días. «Mis tareas» son las
 * que le tocan a la persona; un administrador puede pasar a «De todos» y elegir a una persona.
 */
export function ListaTareas({
  tareas: iniciales,
  publicaciones,
  hoy,
  todas,
  puedeVerTodas,
  puedeEscribir,
  faltaMigracion,
}: {
  tareas: TareaVista[];
  publicaciones: Record<string, PublicacionDeTarea>;
  hoy: string;
  todas: boolean;
  puedeVerTodas: boolean;
  puedeEscribir: boolean;
  faltaMigracion: boolean;
}) {
  const [tareas, setTareas] = useState(iniciales);
  const [verHechas, setVerHechas] = useState(false);
  const [persona, setPersona] = useState("");
  const personas = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tareas) if (t.responsableId && !t.hechaEn) m.set(t.responsableId, t.responsableNombre ?? "Sin nombre");
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [tareas]);
  const visibles = ordenarTareas(
    tareas.filter((t) => !persona || t.responsableId === persona),
    hoy,
  );
  const pendientes = visibles.filter((t) => !t.hechaEn);
  const hechas = visibles.filter((t) => t.hechaEn);
  const grupos = ESTADOS_TAREA_MANUAL.filter((e) => e.valor !== "hecha")
    .map((e) => ({ ...e, tareas: pendientes.filter((t) => estadoTarea(t, hoy) === e.valor) }))
    .filter((g) => g.tareas.length > 0);
  const cambiar = (t: TareaVista) => setTareas((ts) => ts.map((x) => (x.id === t.id ? t : x)));
  const color: Partial<Record<EstadoTarea, string>> = { atrasada: "bg-destructive", hoy: "bg-warning" };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {puedeVerTodas && (
          <nav aria-label="De quién son las tareas" className="flex gap-2">
            <Link href="/publicaciones-dropi/tareas" aria-current={!todas ? "page" : undefined} className={pestana(!todas)}>
              Mis tareas
            </Link>
            <Link href="/publicaciones-dropi/tareas?ver=todas" aria-current={todas ? "page" : undefined} className={pestana(todas)}>
              De todos
            </Link>
          </nav>
        )}
        {todas && personas.length > 1 && (
          <select aria-label="Filtrar por persona" value={persona} onChange={(e) => setPersona(e.target.value)} className={`${fieldClass} w-auto`}>
            <option value="">Todas las personas</option>
            {personas.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        )}
        <span className="text-sm text-muted-foreground tabular-nums">
          {pendientes.length} {pendientes.length === 1 ? "pendiente" : "pendientes"}
        </span>
      </div>

      {faltaMigracion && (
        <p role="alert" className="m-0 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          Falta correr en Supabase la migración 0175: solo se ven las tareas de las recomendaciones.
        </p>
      )}

      {grupos.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {todas ? "Nadie tiene tareas pendientes." : "No tienes tareas pendientes."} Se agregan desde la ficha de una publicación, en el bloque «Tareas».
        </div>
      ) : (
        grupos.map((g) => (
          <section key={g.valor} aria-labelledby={`grupo-${g.valor}`} className="rounded-lg border border-border bg-card">
            <h2 id={`grupo-${g.valor}`} className="m-0 flex items-center gap-2 rounded-t-lg border-b border-border bg-muted px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {color[g.valor] && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${color[g.valor]}`} />}
              {g.etiqueta} · {g.tareas.length}
            </h2>
            <ul className="m-0 flex list-none flex-col divide-y divide-border px-4 py-0">
              {g.tareas.map((t) => (
                <LineaTarea key={`${t.origen}-${t.id}`} t={t} hoy={hoy} puedeEscribir={puedeEscribir} mostrarResponsable={todas} antes={<Publicacion p={publicaciones[t.publicacionId]} />} alResolver={cambiar} />
              ))}
            </ul>
          </section>
        ))
      )}

      {hechas.length > 0 && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setVerHechas((v) => !v)} aria-expanded={verHechas} className={`self-start text-sm text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`}>
            {verHechas ? "Ocultar las hechas" : `Ver las ${hechas.length} hechas de los últimos 30 días`}
          </button>
          {verHechas && (
            <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card px-4 py-0">
              {hechas.map((t) => (
                <LineaTarea key={`${t.origen}-${t.id}`} t={t} hoy={hoy} puedeEscribir={false} mostrarResponsable={todas} antes={<Publicacion p={publicaciones[t.publicacionId]} />} alResolver={cambiar} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
