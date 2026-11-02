"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Ventana } from "@/components/ui/ventana";
import { TareasIcon } from "@/lib/nav-icons";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { ordenarTareas, pendiente, type TareaVista } from "@/lib/publicaciones/tareas";
import { BotonIconoFila } from "./boton-icono-fila";
import type { FilaPublicacion } from "./def-publicaciones";
import { FichaTarea } from "./ficha-tarea";
import { obtenerTareasPublicacion } from "./tareas-actions";
import type { PublicacionDeTarea } from "./tareas-datos";
import { botonClaro, FilaTarea, FormularioTarea, hoyPanama } from "./tareas-piezas";

const deFila = (p: FilaPublicacion): PublicacionDeTarea => ({ id: p.id, numero: p.numero, nombre: p.nombre, fotoUrl: p.fotoUrl, dropiId: p.dropiId || null });

/**
 * Las tareas de un producto (una publicación), como una lista de ClickUp: las pendientes con su estado, a quién le toca, para cuándo y su prioridad,
 * cada una abre su ficha; «+ Agregar tarea» crea una ya asociada a este producto. Las hechas y las archivadas se pliegan.
 */
function ListaTareasProducto({ publicacion, puedeEscribir, agregarAlAbrir = false }: { publicacion: PublicacionDeTarea; puedeEscribir: boolean; agregarAlAbrir?: boolean }) {
  const [tareas, setTareas] = useState<TareaVista[] | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [conEstados, setConEstados] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(agregarAlAbrir && puedeEscribir);
  const [verCerradas, setVerCerradas] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const hoy = hoyPanama();

  useEffect(() => {
    let vigente = true;
    obtenerTareasPublicacion(publicacion.id)
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) return setError(r.error);
        setTareas(r.tareas);
        setDisponible(r.disponible);
        setConEstados(r.conEstados);
      })
      .catch(() => vigente && setError("No se pudieron cargar las tareas."));
    return () => {
      vigente = false;
    };
  }, [publicacion.id]);

  if (!disponible) return <p className="m-0 text-sm text-muted-foreground">Falta correr en Supabase la migración 0175 para las tareas.</p>;
  const ordenadas = ordenarTareas(tareas ?? []);
  const pendientes = ordenadas.filter(pendiente);
  const cerradas = ordenadas.filter((t) => !pendiente(t));
  // Si la tarea pasa a otro producto, sale de esta lista.
  const cambiar = (t: TareaVista) => setTareas((ts) => (ts ?? []).flatMap((x) => (x.id !== t.id ? [x] : t.publicacionId === publicacion.id ? [t] : [])));
  const fila = (t: TareaVista) => (
    <li key={t.id}>
      <FilaTarea t={t} hoy={hoy} conProducto={false} conEstados={conEstados} puedeEscribir={puedeEscribir} alAbrir={() => setAbierta(t.id)} alCambiar={cambiar} />
    </li>
  );
  const abiertaT = ordenadas.find((t) => t.id === abierta);
  const lista = verCerradas ? [...pendientes, ...cerradas] : pendientes;
  const i = lista.findIndex((t) => t.id === abierta);

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
      {tareas === null && !error && <p className="m-0 text-sm text-muted-foreground">Cargando…</p>}
      {tareas !== null && pendientes.length === 0 && !agregando && <p className="m-0 text-sm text-muted-foreground">Sin tareas pendientes.</p>}
      {pendientes.length > 0 && <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-lg border border-border p-0">{pendientes.map(fila)}</ul>}
      {agregando ? (
        <FormularioTarea
          publicacion={publicacion}
          alCancelar={() => setAgregando(false)}
          alCrear={(t) => {
            setTareas((ts) => [t, ...(ts ?? [])]);
            setAgregando(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {puedeEscribir && (
            <button type="button" onClick={() => setAgregando(true)} className={botonClaro}>
              + Agregar tarea
            </button>
          )}
          <Link href="/publicaciones-dropi/tareas" className={`text-sm font-medium text-primario underline-offset-2 hover:underline ${anilloFoco}`}>
            Ver todas las tareas
          </Link>
        </div>
      )}
      {cerradas.length > 0 && (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => setVerCerradas((v) => !v)} aria-expanded={verCerradas} className={`self-start text-sm text-muted-foreground underline-offset-2 hover:underline ${anilloFoco}`}>
            {verCerradas ? "Ocultar las hechas y archivadas" : `Ver ${cerradas.length} ${cerradas.length === 1 ? "hecha o archivada" : "hechas o archivadas"}`}
          </button>
          {verCerradas && <ul className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-lg border border-border p-0">{cerradas.map(fila)}</ul>}
        </div>
      )}
      <FichaTarea
        t={abiertaT}
        publicacion={publicacion}
        hoy={hoy}
        conEstados={conEstados}
        puedeEscribir={puedeEscribir}
        alCambiar={cambiar}
        alCerrar={() => setAbierta(null)}
        anterior={i > 0 ? () => setAbierta(lista[i - 1].id) : undefined}
        siguiente={i >= 0 && i < lista.length - 1 ? () => setAbierta(lista[i + 1].id) : undefined}
      />
    </div>
  );
}

/** El bloque «Tareas» de la ficha de una publicación (pedido de Alcides, 28 oct 2026). */
export function TareasPublicacion({ p, puedeEscribir }: { p: FilaPublicacion; puedeEscribir: boolean }) {
  return (
    <div className="border-b border-border px-5 py-5">
      <Seccion icono={TareasIcon} titulo="Tareas">
        <ListaTareasProducto publicacion={deFila(p)} puedeEscribir={puedeEscribir} />
      </Seccion>
    </div>
  );
}

/**
 * El botón de tareas de la fila (29 oct 2026, pedido de Alcides): abre las tareas de ese producto y, si no tiene ninguna, el formulario para agregar
 * una ya asociada a él. En azul si tiene tareas pendientes; en rojo si alguna ya pasó su fecha.
 */
export function BotonTareasFila({ f }: { f: FilaPublicacion }) {
  const [abierto, setAbierto] = useState(false);
  const { total, atrasadas } = f.tareasPendientes;
  const texto = total ? `Tareas: ${total} ${total === 1 ? "pendiente" : "pendientes"}${atrasadas ? `, ${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}` : ""}` : "Agregar tarea";
  return (
    <>
      <BotonIconoFila texto={texto} motivo={null} icono={TareasIcon} nombre={f.nombre} onClick={() => setAbierto(true)} activo={atrasadas ? "rojo" : total ? "azul" : undefined} />
      <Ventana abierto={abierto} alCerrar={() => setAbierto(false)} lado="derecha" ancho="lg" titulo={`Tareas · ${numeroPublicacion(f.numero)}`}>
        {abierto && (
          <div className="flex flex-col gap-4 px-5 py-5">
            <p className="m-0 text-sm font-medium">{f.nombre}</p>
            <ListaTareasProducto publicacion={deFila(f)} puedeEscribir agregarAlAbrir={total === 0} />
          </div>
        )}
      </Ventana>
    </>
  );
}
