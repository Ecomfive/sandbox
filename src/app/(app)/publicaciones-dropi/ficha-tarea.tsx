"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { ArchivarIcon, ChevronRightIcon } from "@/lib/nav-icons";
import { MAX_NOTA_TAREA, MAX_TITULO_TAREA, type TareaVista } from "@/lib/publicaciones/tareas";
import type { PublicacionDeTarea } from "./tareas-datos";
import { BuscadorPublicacion, botonClaro, ChipPublicacion, MenuEstado, MenuFecha, MenuPrioridad, MenuResponsable, useCambiarTarea } from "./tareas-piezas";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

function Propiedad({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 py-1">
      <span className="text-sm text-muted-foreground">{etiqueta}</span>
      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  );
}

/**
 * La ficha de una tarea, como la vista de una tarea de ClickUp: el estado, qué hay que hacer, sus datos (a quién le toca, para cuándo, prioridad y el
 * producto al que va asociada) y la descripción. Todo se guarda al momento; «Archivar» la saca de la lista sin borrarla. Una tarea de una recomendación
 * solo se da por hecha (lo demás se ve en Recomendaciones).
 */
export function FichaTarea({
  t,
  publicacion,
  hoy,
  conEstados,
  puedeEscribir,
  alCambiar,
  alCerrar,
  anterior,
  siguiente,
}: {
  t: TareaVista | undefined;
  publicacion: PublicacionDeTarea | null | undefined;
  hoy: string;
  conEstados: boolean;
  puedeEscribir: boolean;
  alCambiar: (t: TareaVista, p?: PublicacionDeTarea) => void;
  alCerrar: () => void;
  anterior?: () => void;
  siguiente?: () => void;
}) {
  const flecha = `inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 ${anilloFoco}`;
  return (
    <Ventana
      abierto={!!t}
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo="Tarea"
      navegacion={
        <>
          <button type="button" onClick={anterior} disabled={!anterior} aria-label="Tarea anterior" className={flecha}>
            <ChevronRightIcon aria-hidden="true" className="h-4 w-4 rotate-180" />
          </button>
          <button type="button" onClick={siguiente} disabled={!siguiente} aria-label="Tarea siguiente" className={flecha}>
            <ChevronRightIcon aria-hidden="true" className="h-4 w-4" />
          </button>
        </>
      }
    >
      {t && <ContenidoFichaTarea key={t.id} t={t} publicacion={publicacion} hoy={hoy} conEstados={conEstados} puedeEscribir={puedeEscribir} alCambiar={alCambiar} />}
    </Ventana>
  );
}

function ContenidoFichaTarea({
  t,
  publicacion,
  hoy,
  conEstados,
  puedeEscribir,
  alCambiar,
}: {
  t: TareaVista;
  publicacion: PublicacionDeTarea | null | undefined;
  hoy: string;
  conEstados: boolean;
  puedeEscribir: boolean;
  alCambiar: (t: TareaVista, p?: PublicacionDeTarea) => void;
}) {
  const { cambiar, ocupado } = useCambiarTarea(alCambiar);
  const manual = t.origen === "manual";
  const editable = puedeEscribir && manual;
  const [titulo, setTitulo] = useState(t.titulo);
  const [nota, setNota] = useState(t.nota ?? "");
  const [cambiandoProducto, setCambiandoProducto] = useState(false);

  const guardarTitulo = () => {
    const limpio = titulo.replace(/\s+/g, " ").trim();
    if (!limpio) return setTitulo(t.titulo);
    if (limpio !== t.titulo) cambiar(t, { titulo: limpio });
  };
  const guardarNota = () => {
    const limpia = nota.trim() || null;
    if (limpia !== t.nota) cambiar(t, { nota: limpia });
  };

  return (
    // Lo que se escribe aquí no es de la ficha de la publicación que puede haber detrás en el árbol de React (un portal sube sus eventos por él).
    <div className="flex flex-col gap-5 px-5 py-5" onChange={(e) => e.stopPropagation()} onInput={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2">
        <MenuEstado pildora t={t} puedeEscribir={puedeEscribir} conEstados={conEstados} alElegir={(estado) => cambiar(t, { estado })} />
        {t.archivadaEn && <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Archivada</span>}
        {!manual && <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">De una recomendación</span>}
      </div>

      {editable ? (
        <textarea
          aria-label="Qué hay que hacer"
          rows={1}
          maxLength={MAX_TITULO_TAREA}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={guardarTitulo}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === "Escape") setTitulo(t.titulo);
          }}
          className={`field-sizing-content w-full resize-none rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xl font-semibold hover:border-border-control focus:border-border-control ${anilloFoco}`}
        />
      ) : (
        <h3 className={`m-0 text-xl font-semibold ${t.estado === "hecha" ? "text-muted-foreground line-through" : ""}`}>{t.titulo}</h3>
      )}

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border px-3 py-1">
        <Propiedad etiqueta="Le toca a">
          <MenuResponsable conTexto t={t} puedeEscribir={puedeEscribir} alElegir={(responsableId) => cambiar(t, { responsableId })} />
        </Propiedad>
        <Propiedad etiqueta="Para cuándo">
          {t.estado === "hecha" ? <span className="text-sm text-muted-foreground">Hecha</span> : <MenuFecha t={t} hoy={hoy} puedeEscribir={puedeEscribir} alElegir={(plazo) => cambiar(t, { plazo })} />}
        </Propiedad>
        {conEstados && (
          <Propiedad etiqueta="Prioridad">
            <MenuPrioridad conTexto t={t} puedeEscribir={puedeEscribir} alElegir={(prioridad) => cambiar(t, { prioridad })} />
          </Propiedad>
        )}
        <Propiedad etiqueta="Producto">
          <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
            {cambiandoProducto ? (
              <BuscadorPublicacion
                enfocar
                elegida={null}
                alElegir={(p) => {
                  if (!p) return;
                  setCambiandoProducto(false);
                  if (p.id !== t.publicacionId) cambiar(t, { publicacionId: p.id }, p);
                }}
              />
            ) : (
              <div className="flex min-w-0 items-center justify-between gap-2">
                {publicacion ? (
                  <Link href={`/publicaciones-dropi?abrir=${publicacion.id}`} className={`min-w-0 rounded-md hover:underline ${anilloFoco}`}>
                    <ChipPublicacion p={publicacion} />
                  </Link>
                ) : (
                  <ChipPublicacion p={null} />
                )}
                {editable && (
                  <button type="button" onClick={() => setCambiandoProducto(true)} className={`shrink-0 rounded px-2 py-1 text-xs font-medium text-primario hover:bg-muted ${anilloFoco}`}>
                    Cambiar
                  </button>
                )}
              </div>
            )}
            {cambiandoProducto && (
              <button type="button" onClick={() => setCambiandoProducto(false)} className={`self-start rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted ${anilloFoco}`}>
                Cancelar
              </button>
            )}
          </div>
        </Propiedad>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Descripción</span>
        {editable ? (
          <textarea
            aria-label="Descripción de la tarea"
            rows={4}
            maxLength={MAX_NOTA_TAREA}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onBlur={guardarNota}
            placeholder="Ej: Contar las que quedan en el estante B"
            className={`${fieldClass} w-full`}
          />
        ) : (
          <p className="m-0 text-sm whitespace-pre-wrap text-muted-foreground">{t.nota || "Sin descripción."}</p>
        )}
        {t.hechaNota && <p className="m-0 text-sm text-muted-foreground">Al hacerla: «{t.hechaNota}»</p>}
      </div>

      <dl className="m-0 flex flex-col gap-1 text-xs text-muted-foreground">
        <div>
          <dt className="inline">Creada </dt>
          <dd className="inline">
            {t.creadoPorNombre ? `por ${t.creadoPorNombre} ` : ""}el {fechaHora(t.creadoEn)}
          </dd>
        </div>
        {t.hechaEn && (
          <div>
            <dt className="inline">Hecha </dt>
            <dd className="inline">
              {t.hechaPor ? `por ${t.hechaPor} ` : ""}el {fechaHora(t.hechaEn)}
            </dd>
          </div>
        )}
        {t.archivadaEn && (
          <div>
            <dt className="inline">Archivada </dt>
            <dd className="inline">el {fechaHora(t.archivadaEn)}</dd>
          </div>
        )}
      </dl>

      {editable && conEstados && (
        <div>
          <button type="button" disabled={ocupado} onClick={() => cambiar(t, { archivar: !t.archivadaEn })} className={`${botonClaro} gap-2`}>
            <ArchivarIcon aria-hidden="true" className="h-4 w-4" />
            {t.archivadaEn ? "Sacar de Archivadas" : "Archivar tarea"}
          </button>
        </div>
      )}
    </div>
  );
}
