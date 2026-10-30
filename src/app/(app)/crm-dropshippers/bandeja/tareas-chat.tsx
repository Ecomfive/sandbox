"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PanelEnSitio, useEnSitio } from "@/components/ui/en-sitio";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { TareasIcon } from "@/lib/nav-icons";
import { completarTarea, crearTareaChat, tareasDelChat, type TareaVista } from "../tareas/actions";
import { FilaTarea } from "../tareas/panel-tareas";
import { ItemFila } from "../botones-ficha";

/**
 * «Tarea» en la fila de botones de la ficha del chat (29 oct 2026): qué hay que hacer con este cliente y para cuándo («Llamarlo para
 * ofrecerle la semilla de calabaza», 23 dic). Queda a cargo de quien lleva el chat (si nadie, de quien la crea) y sale en el panel de tareas.
 */
export function BotonNuevaTarea({
  conversacionId,
  nombre,
  clase,
  alCreada,
  alAviso,
  boton,
}: {
  conversacionId: string;
  nombre: string;
  clase: string;
  alCreada: () => void;
  alAviso: (texto: string, error?: boolean) => void;
  /** Otro botón para abrirla (el de la barra de acciones del chat). */
  boton?: (abrir: () => void) => ReactNode;
}) {
  const [abiertaLocal, setAbiertaLocal] = useState(false);
  // Dentro de la ficha se abre en el mismo lugar, debajo de los botones (así se puede copiar del chat); fuera, en su ventana.
  const sitio = useEnSitio();
  const idPanel = useId();
  const enLugar = !!sitio;
  const abierta = enLugar ? sitio.activo === idPanel : abiertaLocal;
  const setAbierta = (valor: boolean) => {
    if (enLugar) {
      if (valor) sitio.abrir(idPanel);
      else sitio.cerrar(idPanel);
    } else setAbiertaLocal(valor);
  };
  const [titulo, setTitulo] = useState("");
  const [vence, setVence] = useState("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const cerrar = () => {
    setAbierta(false);
    setError(null);
  };
  const guardar = () =>
    empezar(async () => {
      if (!titulo.trim()) return setError("Escribe qué hay que hacer.");
      const r = await crearTareaChat(conversacionId, { titulo, vence: vence || null, detalle: detalle || null }).catch(() => ({ error: "No se pudo crear la tarea." }));
      if ("error" in r) return setError(r.error);
      setTitulo("");
      setVence("");
      setDetalle("");
      cerrar();
      alAviso("Tarea creada. Sale en Tareas y te avisa la campana el día que toca.");
      alCreada();
    });

  const encabezado = `Nueva tarea con ${nombre}`;
  const formulario = (
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
        >
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Qué hay que hacer
            <input
              data-enfocar
              value={titulo}
              maxLength={200}
              onChange={(e) => {
                setTitulo(e.target.value);
                setError(null);
              }}
              placeholder="Ofrecerle la semilla de calabaza que llegó"
              aria-invalid={!!error && !titulo.trim()}
              className={`${fieldClass} w-full font-normal`}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Para cuándo (opcional)
            <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className={`${fieldClass} w-full font-normal sm:w-48`} />
            <span className="text-xs font-normal text-muted-foreground">Ese día le llega el aviso en la campana a quien lleva el chat.</span>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            Detalle (opcional)
            <textarea value={detalle} maxLength={2000} rows={3} onChange={(e) => setDetalle(e.target.value)} className={`${fieldClass} w-full font-normal`} />
          </label>
          {error && (
            <p role="alert" className="m-0 text-[13px] text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cerrar} className={`rounded-md border border-border px-3 py-1.5 text-[13px] hover:bg-muted ${anilloFoco}`}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className={`rounded-md bg-primario px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}>
              {guardando ? "Creando…" : "Crear tarea"}
            </button>
          </div>
        </form>
  );

  return (
    <>
      {boton ? (
        boton(() => setAbierta(true))
      ) : (
        <ItemFila id="tarea">
          <button type="button" onClick={() => setAbierta(true)} className={clase}>
            <TareasIcon className="h-4 w-4" />
            Tarea
          </button>
        </ItemFila>
      )}
      {enLugar ? (
        abierta && sitio.destino && createPortal(<PanelEnSitio titulo={encabezado} alCerrar={cerrar}>{formulario}</PanelEnSitio>, sitio.destino)
      ) : (
        <Ventana abierto={abierta} alCerrar={cerrar} titulo={encabezado}>
          {formulario}
        </Ventana>
      )}
    </>
  );
}

/** Las tareas abiertas del chat (y de su dropshipper), en la pestaña «Resumen» de la ficha. `version` sube cuando se crea una. */
export function TareasDelChat({ conversacionId, version, alAviso }: { conversacionId: string; version: number; alAviso: (texto: string, error?: boolean) => void }) {
  const [tareas, setTareas] = useState<TareaVista[] | "error" | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vigente = true;
    tareasDelChat(conversacionId)
      .then((r) => vigente && setTareas("error" in r ? "error" : r.tareas))
      .catch(() => vigente && setTareas("error"));
    return () => {
      vigente = false;
    };
  }, [conversacionId, version, vuelta]);

  const cambiar = async (t: TareaVista, hecha: boolean) => {
    const r = await completarTarea(t.id, hecha).catch(() => ({ error: "No se pudo actualizar la tarea." }));
    if ("error" in r) return alAviso(r.error, true);
    alAviso(hecha ? "Tarea hecha." : "Tarea abierta de nuevo.");
    setVuelta((v) => v + 1);
  };

  return (
    <section className="flex flex-col gap-1 border-b-8 border-[var(--wa-panel)] px-5 py-4">
      <h3 className="m-0 flex items-center justify-between text-[13px] font-normal text-[var(--wa-sec)]">
        Tareas
        <Link href="/crm-dropshippers/tareas" className={`text-[12.5px] text-[var(--wa-acento)] hover:underline ${anilloFoco}`}>
          Ver todas
        </Link>
      </h3>
      {tareas === null ? (
        <span className="text-[13px] text-[var(--wa-sec)]">Cargando…</span>
      ) : tareas === "error" ? (
        <span className="text-[13px] text-destructive">No se pudieron cargar las tareas.</span>
      ) : tareas.length === 0 ? (
        <span className="text-[13px] text-[var(--wa-sec)]">Sin tareas pendientes. Crea una con «Tarea» o con «Avisarme cuando llegue» en un producto.</span>
      ) : (
        <ul className="m-0 list-none p-0">
          {tareas.map((t) => (
            <FilaTarea key={t.id} t={t} compacta alCambiar={(x, hecha) => void cambiar(x, hecha)} />
          ))}
        </ul>
      )}
    </section>
  );
}
