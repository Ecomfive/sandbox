"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { almacen } from "@/components/tabla/almacen";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { atrasada, cerrada, ESTADOS_TAREA, etiquetaEstado, numeroTarea, PRIORIDADES_TAREA, type CambioTarea, type EstadoTarea } from "@/lib/tareas/tareas";
import { actualizarTarea } from "./actions";
import type { PersonaTarea, TareaVista } from "./datos";
import { FichaTarea } from "./ficha-tarea";
import { NuevaTarea } from "./nueva-tarea";
import { Bandera, CirculoEstado, fechaCorta, hoyPanama, Iniciales, MenuFecha, MenuOpciones, opcionesEstado, opcionesPrioridad } from "./piezas";

type Vista = "lista" | "tablero";
type Agrupar = "estado" | "persona";
const VISTA = almacen("tareas-equipo-vista-v1", "local");
const AGRUPAR = almacen("tareas-equipo-agrupar-v1", "local");
const ORDEN_PRIORIDAD: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 };

/** Del más urgente al menos: prioridad, después fecha límite (sin fecha al final) y el número. */
function ordenar(a: TareaVista, b: TareaVista) {
  return (ORDEN_PRIORIDAD[a.prioridad ?? ""] ?? 4) - (ORDEN_PRIORIDAD[b.prioridad ?? ""] ?? 4) || (a.fechaLimite ?? "9999").localeCompare(b.fechaLimite ?? "9999") || b.numero - a.numero;
}

const limpio = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Equipo › Tareas: el tablero de tareas del equipo, como «Lideres Empresas» de ClickUp. Lista agrupada por estado o por persona, o tablero con
 * una columna por estado (se arrastra una tarjeta para cambiarla de estado). Cada dato se cambia en su sitio y se ve al instante; si el servidor
 * lo rechaza, vuelve como estaba. Un administrador ve las de todos («De todos») y las asigna; cada persona ve las suyas.
 */
export function TableroTareas({
  tareas: iniciales,
  personas,
  modulos,
  miId,
  admin,
}: {
  tareas: TareaVista[];
  personas: PersonaTarea[];
  modulos: { clave: string; etiqueta: string }[];
  miId: string;
  admin: boolean;
}) {
  const { mostrarToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const parametros = useSearchParams();
  const [, empezar] = useTransition();
  // Lo cambiado aquí manda sobre lo que trajo el servidor hasta que la página vuelva a cargar.
  const [cambios, setCambios] = useState<Map<string, TareaVista>>(new Map());
  const [version, setVersion] = useState(0);
  const vista = (useSyncExternalStore(VISTA.suscribir, VISTA.leer, () => "") || "lista") as Vista;
  const agrupar = (useSyncExternalStore(AGRUPAR.suscribir, AGRUPAR.leer, () => "") || (admin ? "persona" : "estado")) as Agrupar;
  const [deTodos, setDeTodos] = useState(admin);
  const [busqueda, setBusqueda] = useState("");
  const [persona, setPersona] = useState("");
  const [verArchivadas, setVerArchivadas] = useState(false);
  const [abiertaId, setAbiertaId] = useState<string | null>(() => parametros.get("abrir"));
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const hoy = hoyPanama();

  // `?abrir=<id>` (el aviso «Para ti») abre la ficha; el parámetro se quita de la dirección.
  useEffect(() => {
    if (parametros.get("abrir")) router.replace(pathname, { scroll: false });
    // Solo al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todas = useMemo(() => iniciales.map((t) => cambios.get(t.id) ?? t), [iniciales, cambios]);
  const visibles = useMemo(() => {
    const q = limpio(busqueda.trim());
    return todas
      .filter((t) => (verArchivadas ? t.estado === "archivado" : t.estado !== "archivado"))
      .filter((t) => !admin || deTodos || t.responsableId === miId || t.creadoPor === miId)
      .filter((t) => !persona || (persona === "sin" ? !t.responsableId : t.responsableId === persona))
      .filter((t) => !q || limpio(`${t.titulo} ${t.descripcion ?? ""} ${numeroTarea(t.numero)}`).includes(q))
      .sort(ordenar);
  }, [todas, busqueda, verArchivadas, admin, deTodos, persona, miId]);
  const abierta = abiertaId ? (todas.find((t) => t.id === abiertaId) ?? null) : null;
  const pendientes = todas.filter((t) => !cerrada(t.estado) && (t.responsableId === miId || (!t.responsableId && t.creadoPor === miId))).length;
  const atrasadas = visibles.filter((t) => atrasada(t, hoy)).length;

  function cambiar(t: TareaVista, cambio: CambioTarea) {
    const nombre = cambio.responsableId === undefined ? t.responsableNombre : (personas.find((p) => p.id === cambio.responsableId)?.nombre ?? null);
    const local: TareaVista = { ...t, ...cambio, responsableNombre: nombre } as TareaVista;
    setCambios((m) => new Map(m).set(t.id, local));
    empezar(async () => {
      const r = await actualizarTarea(t.id, cambio).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if ("error" in r) {
        setCambios((m) => new Map(m).set(t.id, t));
        mostrarToast(r.error, "destructive");
        return;
      }
      setCambios((m) => new Map(m).set(t.id, r.tarea));
      setVersion((v) => v + 1);
    });
  }

  const grupos: { clave: string; titulo: string; icono: React.ReactNode; tareas: TareaVista[] }[] =
    agrupar === "persona" && vista === "lista"
      ? [
          ...personas.map((p) => ({ clave: p.id, titulo: p.nombre, icono: <Iniciales nombre={p.nombre} className="h-5 w-5 text-[9px]" />, tareas: visibles.filter((t) => t.responsableId === p.id) })),
          { clave: "sin", titulo: "Sin asignar", icono: <Iniciales nombre={null} className="h-5 w-5 text-[9px]" />, tareas: visibles.filter((t) => !t.responsableId) },
        ].filter((g) => g.tareas.length > 0)
      : ESTADOS_TAREA.filter((e) => (verArchivadas ? e.valor === "archivado" : e.valor !== "archivado"))
          .map((e) => ({ clave: e.valor, titulo: e.etiqueta, icono: <CirculoEstado estado={e.valor} />, tareas: visibles.filter((t) => t.estado === e.valor) }))
          .filter((g) => vista === "tablero" || g.tareas.length > 0);

  const personasMenu = admin ? personas : personas.filter((p) => p.id === miId);
  const opcionesPersona = [{ valor: "", etiqueta: "Sin asignar", icono: <Iniciales nombre={null} className="h-6 w-6 text-[10px]" /> }, ...personasMenu.map((p) => ({ valor: p.id, etiqueta: p.nombre, icono: <Iniciales nombre={p.nombre} className="h-6 w-6 text-[10px]" /> }))];
  const etiquetaModulo = (m: string | null) => (m ? (modulos.find((x) => x.clave === m)?.etiqueta ?? m) : null);

  const celdaEstado = (t: TareaVista) => (
    <MenuOpciones etiqueta={`Estado de ${t.titulo}`} ayuda="Cambiar estado" opciones={opcionesEstado(ESTADOS_TAREA)} valor={t.estado} alElegir={(v) => cambiar(t, { estado: v as EstadoTarea })} puedeEscribir className="p-1 hover:bg-muted">
      <CirculoEstado estado={t.estado} />
    </MenuOpciones>
  );
  const celdaPersona = (t: TareaVista) => (
    <MenuOpciones etiqueta={`Persona asignada a ${t.titulo}`} ayuda={t.responsableNombre ?? "Asignar tarea"} opciones={opcionesPersona} valor={t.responsableId ?? ""} alElegir={(v) => cambiar(t, { responsableId: v || null })} puedeEscribir className="p-0.5 hover:bg-muted">
      <Iniciales nombre={t.responsableNombre} />
    </MenuOpciones>
  );
  const celdaFecha = (t: TareaVista) => (
    <MenuFecha etiqueta="Fecha límite" valor={t.fechaLimite} alElegir={(v) => cambiar(t, { fechaLimite: v })} puedeEscribir className={`px-1.5 py-1 text-xs tabular-nums hover:bg-muted ${atrasada(t, hoy) ? "font-semibold text-destructive" : t.fechaLimite === hoy ? "font-semibold text-warning" : "text-muted-foreground"}`}>
      {t.fechaLimite ? fechaCorta(t.fechaLimite) : <span aria-hidden="true">—</span>}
    </MenuFecha>
  );
  const celdaPrioridad = (t: TareaVista) => (
    <MenuOpciones etiqueta={`Prioridad de ${t.titulo}`} ayuda="Cambiar prioridad" opciones={opcionesPrioridad(PRIORIDADES_TAREA)} valor={t.prioridad ?? ""} alElegir={(v) => cambiar(t, { prioridad: (v || null) as CambioTarea["prioridad"] })} puedeEscribir className="p-1 hover:bg-muted">
      <Bandera prioridad={t.prioridad} />
    </MenuOpciones>
  );

  const claseSegmento = (activo: boolean) => `min-h-9 rounded-md px-3 text-sm font-medium ${anilloFoco} ${activo ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Vista" className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <button type="button" aria-pressed={vista === "lista"} onClick={() => VISTA.guardar("lista")} className={claseSegmento(vista === "lista")}>
            Lista
          </button>
          <button type="button" aria-pressed={vista === "tablero"} onClick={() => VISTA.guardar("tablero")} className={claseSegmento(vista === "tablero")}>
            Tablero
          </button>
        </div>
        {admin && (
          <div role="group" aria-label="De quién" className="inline-flex rounded-lg border border-border bg-card p-0.5">
            <button type="button" aria-pressed={!deTodos} onClick={() => setDeTodos(false)} className={claseSegmento(!deTodos)}>
              Mías
            </button>
            <button type="button" aria-pressed={deTodos} onClick={() => setDeTodos(true)} className={claseSegmento(deTodos)}>
              De todos
            </button>
          </div>
        )}
        {vista === "lista" && (
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Agrupar
            <select value={agrupar} onChange={(e) => AGRUPAR.guardar(e.target.value)} className={`${fieldClass} py-1.5`}>
              <option value="estado">Por estado</option>
              <option value="persona">Por persona</option>
            </select>
          </label>
        )}
        {admin && deTodos && (
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Persona
            <select value={persona} onChange={(e) => setPersona(e.target.value)} className={`${fieldClass} py-1.5`}>
              <option value="">Todas</option>
              <option value="sin">Sin asignar</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="min-w-0 flex-[1_1_12rem]">
          <span className="sr-only">Buscar tareas</span>
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar tareas" className={`${fieldClass} w-full py-1.5`} />
        </label>
        <button type="button" aria-pressed={verArchivadas} onClick={() => setVerArchivadas((v) => !v)} className={`min-h-9 rounded-md border px-3 text-sm font-medium ${anilloFoco} ${verArchivadas ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"}`}>
          Archivadas
        </button>
        <NuevaTarea personas={personas} miId={miId} admin={admin} modulos={modulos} />
      </div>

      <p className="m-0 text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {visibles.length} {visibles.length === 1 ? "tarea" : "tareas"}
        {atrasadas > 0 && <span className="font-semibold text-destructive"> · {atrasadas} {atrasadas === 1 ? "atrasada" : "atrasadas"}</span>}
        {` · ${pendientes} ${pendientes === 1 ? "pendiente tuya" : "pendientes tuyas"}`}
      </p>

      {vista === "lista" ? (
        grupos.length === 0 ? (
          <p className="m-0 rounded-xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{busqueda || persona ? "Ninguna tarea coincide." : verArchivadas ? "No hay tareas archivadas." : "No hay tareas. Crea la primera con «Agregar tarea»."}</p>
        ) : (
          grupos.map((g) => (
            <section key={g.clave} aria-labelledby={`grupo-${g.clave}`} className="overflow-hidden rounded-xl border border-border bg-card">
              <h2 id={`grupo-${g.clave}`} className="m-0 flex items-center gap-2 border-b border-border bg-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide">
                {g.icono}
                {g.titulo}
                <span className="font-normal text-muted-foreground tabular-nums">{g.tareas.length}</span>
              </h2>
              <ul className="m-0 list-none divide-y divide-border p-0">
                {g.tareas.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:flex-nowrap">
                    {celdaEstado(t)}
                    <button type="button" onClick={() => setAbiertaId(t.id)} className={`flex min-w-0 flex-1 items-baseline gap-2 rounded text-left ${anilloFoco}`}>
                      <span className="truncate text-sm font-medium hover:underline">{t.titulo}</span>
                      {etiquetaModulo(t.modulo) && <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground md:inline">{etiquetaModulo(t.modulo)}</span>}
                    </button>
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {agrupar === "persona" && <span className="hidden text-[11px] text-muted-foreground sm:inline">{etiquetaEstado(t.estado)}</span>}
                      {celdaPersona(t)}
                      <span className="w-16 text-right">{celdaFecha(t)}</span>
                      {celdaPrioridad(t)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2" role="list" aria-label="Tablero de tareas por estado">
          {grupos.map((g) => (
            <section
              key={g.clave}
              role="listitem"
              aria-labelledby={`col-${g.clave}`}
              onDragOver={(e) => arrastrando && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const t = todas.find((x) => x.id === arrastrando);
                setArrastrando(null);
                if (t && t.estado !== g.clave) cambiar(t, { estado: g.clave as EstadoTarea });
              }}
              className={`flex w-72 shrink-0 flex-col gap-2 rounded-xl border bg-muted p-2 ${arrastrando ? "border-dashed border-border-control" : "border-border"}`}
            >
              <h2 id={`col-${g.clave}`} className="m-0 flex items-center gap-2 px-1.5 py-1 text-xs font-semibold uppercase tracking-wide">
                {g.icono}
                {g.titulo}
                <span className="font-normal text-muted-foreground tabular-nums">{g.tareas.length}</span>
              </h2>
              {g.tareas.map((t) => (
                <article
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    setArrastrando(t.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setArrastrando(null)}
                  className={`flex cursor-grab flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm active:cursor-grabbing ${arrastrando === t.id ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {celdaEstado(t)}
                    <button type="button" onClick={() => setAbiertaId(t.id)} className={`min-w-0 flex-1 rounded text-left text-sm font-medium leading-snug hover:underline ${anilloFoco}`}>
                      {t.titulo}
                    </button>
                  </div>
                  {etiquetaModulo(t.modulo) && <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{etiquetaModulo(t.modulo)}</span>}
                  <div className="flex items-center gap-1">
                    {celdaPersona(t)}
                    {celdaFecha(t)}
                    <span className="ml-auto">{celdaPrioridad(t)}</span>
                  </div>
                </article>
              ))}
              {g.tareas.length === 0 && <p className="m-0 px-1.5 py-3 text-xs text-muted-foreground">Sin tareas</p>}
            </section>
          ))}
        </div>
      )}

      {abierta && (
        <FichaTarea
          key={abierta.id}
          t={abierta}
          personas={personas}
          modulos={modulos}
          puedeAsignarOtros={admin}
          miId={miId}
          version={version}
          alCambiar={cambiar}
          alCerrar={() => setAbiertaId(null)}
        />
      )}
    </div>
  );
}
