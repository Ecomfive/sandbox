"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ListaDatos } from "@/components/tabla/lista-datos";
import type { IconoComp } from "@/components/tabla/botones-vista";
import type { NombreFilas } from "@/lib/tabla/pie";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { CalendarioIcon, EstadoIcon, PersonaIcon, ProductoIcon, TareasIcon } from "@/lib/nav-icons";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { ESTADOS_TAREA, PRIORIDADES, VENCIMIENTOS, etiquetaEstado, ordenarTareas, pendiente, vencimiento, type TareaVista, type Vencimiento } from "@/lib/publicaciones/tareas";
import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";
import { FichaTarea } from "../ficha-tarea";
import type { PublicacionDeTarea } from "../tareas-datos";
import { BanderaIcon, CirculoEstado, COLUMNAS_TAREA, FilaTarea, FormularioTarea } from "../tareas-piezas";

/** Una tarea de la lista con lo que se calcula para filtrar: cómo va su fecha y su producto. */
export interface FilaTareaLista extends TareaVista {
  vence: Vencimiento | null;
  producto: PublicacionDeTarea | null;
}

const NOMBRE: NombreFilas = { singular: "tarea", plural: "tareas" };
const BanderaCampo: IconoComp = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M5 21V4M5 4h11l-2.5 4.5L16 13H5" />
  </svg>
);
const ICONOS: Record<string, IconoComp> = { estado: EstadoIcon, responsable: PersonaIcon, prioridad: BanderaCampo, vence: CalendarioIcon, plazo: CalendarioIcon, producto: ProductoIcon, origen: TareasIcon, archivo: TareasIcon };

const DEF_TAREAS: DefTabla<FilaTareaLista> = {
  clave: "tareas-dropi",
  campos: [
    { id: "nombre", etiqueta: "Tarea", tipo: "texto", valor: (t) => `${t.titulo} ${t.nota ?? ""}` },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (t) => [t.estado],
      opciones: () => ESTADOS_TAREA.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ESTADOS_TAREA.map((e) => e.valor),
      colorValor: (v) => ESTADOS_TAREA.find((e) => e.valor === v)?.color,
    },
    { id: "responsable", etiqueta: "Le toca a", tipo: "seleccion", valores: (t) => [t.responsableNombre ?? SIN_VALOR], etiquetaSinValor: "Sin asignar", agrupable: true },
    {
      id: "prioridad",
      etiqueta: "Prioridad",
      tipo: "seleccion",
      valores: (t) => [t.prioridad ?? SIN_VALOR],
      opciones: () => [...PRIORIDADES.map((p) => ({ valor: p.valor, etiqueta: p.etiqueta })), { valor: SIN_VALOR, etiqueta: "Sin prioridad" }],
      agrupable: true,
      ordenGrupos: [...PRIORIDADES.map((p) => p.valor), SIN_VALOR],
      colorValor: (v) => PRIORIDADES.find((p) => p.valor === v)?.color,
    },
    {
      id: "vence",
      etiqueta: "Vencimiento",
      tipo: "seleccion",
      valores: (t) => [t.vence ?? "hecha"],
      opciones: () => [...VENCIMIENTOS.map((v) => ({ valor: v.valor, etiqueta: v.etiqueta })), { valor: "hecha", etiqueta: "Hecha" }],
      agrupable: true,
      ordenGrupos: [...VENCIMIENTOS.map((v) => v.valor), "hecha"],
    },
    { id: "plazo", etiqueta: "Para cuándo", tipo: "fecha", valor: (t) => t.plazo },
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (t) => (t.producto ? `${numeroPublicacion(t.producto.numero)} ${t.producto.nombre} ${t.producto.dropiId ?? ""}` : "") },
    {
      id: "origen",
      etiqueta: "Origen",
      tipo: "seleccion",
      valores: (t) => [t.origen],
      opciones: () => [
        { valor: "manual", etiqueta: "Escrita a mano" },
        { valor: "recomendacion", etiqueta: "De una recomendación" },
      ],
      agrupable: true,
    },
    {
      id: "archivo",
      etiqueta: "Archivo",
      tipo: "seleccion",
      valores: (t) => [t.archivadaEn ? "archivada" : "activa"],
      opciones: () => [
        { valor: "activa", etiqueta: "Activa" },
        { valor: "archivada", etiqueta: "Archivada" },
      ],
    },
  ],
  cerrados: { etiqueta: "Archivadas", esCerrado: (t) => !!t.archivadaEn, campoEstado: "archivo", valoresCerrados: ["archivada"], ocultosPorDefecto: true, exclusivo: true },
  csvAntes: [
    { etiqueta: "Tarea", valor: (t) => t.titulo },
    { etiqueta: "Producto", valor: (t) => (t.producto ? `${numeroPublicacion(t.producto.numero)} · ${t.producto.nombre}` : "") },
  ],
  vistaInicial: { agrupar: "estado" },
};

const pestana = (activa: boolean) =>
  `inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium ${activa ? "bg-foreground text-background" : "border border-border-control bg-card hover:bg-muted"} ${anilloFoco}`;

function Encabezado() {
  return (
    <div className={`hidden items-center gap-x-3 px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid ${COLUMNAS_TAREA}`}>
      <span />
      <span>Tarea</span>
      <span>Producto</span>
      <span className="text-center">Quién</span>
      <span className="pl-1.5">Para cuándo</span>
      <span className="text-center">
        <span className="sr-only">Prioridad</span>
        <BanderaIcon prioridad={null} className="mx-auto h-3.5 w-3.5" />
      </span>
    </div>
  );
}

/**
 * La pestaña «Tareas» (29 oct 2026, al estilo de ClickUp, pedido de Alcides): las tareas agrupadas por estado (Por hacer, En curso, En revisión, Hecha),
 * cada fila con su estado, producto, quién, para cuándo y prioridad que se cambian ahí mismo, y su ficha a la derecha. «Archivadas» muestra las que se
 * archivaron. «Mis tareas» son las que le tocan a la persona; un administrador puede pasar a «De todos».
 */
export function ListaTareas({
  tareas: iniciales,
  publicaciones: pubsIniciales,
  hoy,
  todas,
  puedeVerTodas,
  puedeEscribir,
  faltaMigracion,
  conEstados,
}: {
  tareas: TareaVista[];
  publicaciones: Record<string, PublicacionDeTarea>;
  hoy: string;
  todas: boolean;
  puedeVerTodas: boolean;
  puedeEscribir: boolean;
  faltaMigracion: boolean;
  conEstados: boolean;
}) {
  const [tareas, setTareas] = useState(iniciales);
  const [publicaciones, setPublicaciones] = useState(pubsIniciales);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [orden, setOrden] = useState<string[]>([]);
  const [agregando, setAgregando] = useState(false);

  const filas = useMemo<FilaTareaLista[]>(() => ordenarTareas(tareas).map((t) => ({ ...t, vence: vencimiento(t, hoy), producto: publicaciones[t.publicacionId] ?? null })), [tareas, publicaciones, hoy]);
  const pendientes = filas.filter(pendiente).length;
  const cambiar = (t: TareaVista, p?: PublicacionDeTarea) => {
    setTareas((ts) => ts.map((x) => (x.id === t.id ? t : x)));
    if (p) setPublicaciones((ps) => ({ ...ps, [p.id]: p }));
  };
  const abiertaT = filas.find((t) => t.id === abierta);
  const i = orden.indexOf(abierta ?? "");

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
        <span className="text-sm text-muted-foreground tabular-nums">
          {pendientes} {pendientes === 1 ? "pendiente" : "pendientes"}
        </span>
      </div>

      {(faltaMigracion || !conEstados) && (
        <p role="alert" className="m-0 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />
          {faltaMigracion
            ? "Falta correr en Supabase la migración 0175: solo se ven las tareas de las recomendaciones."
            : "Falta correr en Supabase la migración 0178: por ahora solo Por hacer y Hecha, sin prioridad ni archivar."}
        </p>
      )}

      <ListaDatos
        def={DEF_TAREAS}
        filas={filas}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(t) => `${t.origen}-${t.id}`}
        variante="filas"
        encabezado={<Encabezado />}
        renderFila={(t, enOrden) => (
          <FilaTarea
            t={t}
            hoy={hoy}
            publicacion={t.producto}
            conEstados={conEstados}
            puedeEscribir={puedeEscribir}
            alCambiar={cambiar}
            alAbrir={() => {
              setOrden(enOrden.map((x) => x.id));
              setAbierta(t.id);
            }}
          />
        )}
        etiquetaGrupo={(campo, grupo) =>
          campo === "estado" ? (
            <span className="inline-flex items-center gap-2 font-semibold">
              <CirculoEstado estado={grupo.clave as TareaVista["estado"]} />
              {etiquetaEstado(grupo.clave)}
            </span>
          ) : campo === "prioridad" ? (
            <span className="inline-flex items-center gap-2 font-semibold">
              <BanderaIcon prioridad={grupo.clave === SIN_VALOR ? null : (grupo.clave as TareaVista["prioridad"])} />
              {grupo.etiqueta}
            </span>
          ) : (
            <span className="font-semibold">{grupo.etiqueta}</span>
          )
        }
        accionPrincipal={puedeEscribir && !faltaMigracion ? <BotonAgregar etiqueta="Agregar tarea" onClick={() => setAgregando(true)} /> : undefined}
        vacio={todas ? "Nadie tiene tareas. Se agregan con «Agregar tarea» o con el botón de tareas de cada producto." : "No tienes tareas. Se agregan con «Agregar tarea» o con el botón de tareas de cada producto."}
      />

      <Ventana abierto={agregando} alCerrar={() => setAgregando(false)} lado="derecha" ancho="lg" titulo="Nueva tarea">
        {agregando && (
          <div className="px-5 py-5">
            <FormularioTarea
              alCancelar={() => setAgregando(false)}
              alCrear={(t, p) => {
                setTareas((ts) => [t, ...ts]);
                setPublicaciones((ps) => ({ ...ps, [p.id]: p }));
                setAgregando(false);
              }}
            />
          </div>
        )}
      </Ventana>

      <FichaTarea
        t={abiertaT}
        publicacion={abiertaT?.producto}
        hoy={hoy}
        conEstados={conEstados}
        puedeEscribir={puedeEscribir}
        alCambiar={cambiar}
        alCerrar={() => setAbierta(null)}
        anterior={i > 0 ? () => setAbierta(orden[i - 1]) : undefined}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierta(orden[i + 1]) : undefined}
      />
    </div>
  );
}
