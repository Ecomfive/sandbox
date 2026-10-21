"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, EstadoIcon, InventarioIcon, MargenIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import { ESTADOS, ESTADOS_PUBLICACION, ESTADOS_REPOSICION, ESTADOS_VENTA, MARGEN_BAJO, TIPOS, UBICACIONES, opcion, type OpcionPublicacion } from "@/lib/publicaciones/publicacion";
import type { NombreFilas } from "@/lib/tabla/pie";
import { SIN_VALOR } from "@/lib/tabla/motor";
import { CrearPublicacionPanel } from "./crear-publicacion-panel";
import { DEF_PUBLICACIONES, type FilaPublicacion } from "./def-publicaciones";
import { FichaPublicacion, type Persona } from "./ficha-publicacion";

const NOMBRE: NombreFilas = { singular: "publicación", plural: "publicaciones" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  revision: CalendarioIcon,
  venta: MargenIcon,
  ubicacion: InventarioIcon,
  reposicion: InventarioIcon,
  tipo: EstadoIcon,
  publicacion: EstadoIcon,
  privatizado: PersonaIcon,
  responsable: PersonaIcon,
  competencia: EstadoIcon,
  nombre: ProductoIcon,
  precio: MargenIcon,
  margen: MargenIcon,
  ultimaRevision: CalendarioIcon,
  proximaRevision: CalendarioIcon,
  fechaPublicacion: CalendarioIcon,
};

const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const fechaCorta = (f: string | null) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short" }) : "—");
const pastilla = (lista: OpcionPublicacion[], v: string | null) => {
  const o = opcion(lista, v);
  return o ? <Badge color={o.color}>{o.etiqueta}</Badge> : <span className="text-muted-foreground">—</span>;
};
const Punto = ({ clase, texto }: { clase: string; texto: string }) => (
  <span role="img" aria-label={texto} className={`inline-block h-2 w-2 shrink-0 rounded-full ${clase}`} />
);

const COLUMNAS: ColumnaTabla<FilaPublicacion>[] = [
  {
    id: "nombre",
    label: "Producto",
    ocultable: false,
    render: (f) => (
      <span className="flex min-w-[16rem] items-center gap-2.5">
        {f.fotoUrl ? <img src={f.fotoUrl} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" /> : <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-md border border-dashed border-border-control" />}
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{f.nombre}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{f.dropiId ? `ID ${f.dropiId}` : "Sin ID de Dropi"}</span>
        </span>
      </span>
    ),
  },
  { id: "estado", label: "Estado", ocultable: true, render: (f) => pastilla(ESTADOS, f.estado) },
  { id: "venta", label: "Venta", ocultable: true, render: (f) => pastilla(ESTADOS_VENTA, f.estadoVenta) },
  { id: "precio", label: "Precio", ocultable: true, clase: "text-right tabular-nums", render: (f) => usd(f.precioVenta) },
  { id: "costo", label: "Costo", ocultable: true, clase: "text-right tabular-nums text-muted-foreground", render: (f) => usd(f.costoMercancia) },
  { id: "fulfillment", label: "Fulfillment", ocultable: true, clase: "text-right tabular-nums text-muted-foreground", render: (f) => usd(f.fulfillment) },
  { id: "utilidad", label: "Utilidad", ocultable: true, clase: "text-right tabular-nums", render: (f) => usd(f.utilidad), descripcion: "Precio de venta menos costo mercancía y fulfillment." },
  {
    id: "margen",
    label: "Margen",
    ocultable: true,
    clase: "text-right tabular-nums",
    descripcion: "Utilidad sobre el precio de venta. Punto rojo: menos de 30 %.",
    render: (f) =>
      f.margen === null ? (
        "—"
      ) : (
        <span className="inline-flex items-center justify-end gap-1.5">
          {f.margen < MARGEN_BAJO && <Punto clase="bg-destructive" texto="Margen bajo" />}
          {Math.round(f.margen * 100)} %
        </span>
      ),
  },
  {
    id: "tipo",
    label: "Tipo",
    ocultable: true,
    render: (f) =>
      f.tipo === "privado" ? (
        <span className="flex flex-col gap-0.5">
          {pastilla(TIPOS, f.tipo)}
          {f.privatizadoA && <span className="text-xs text-muted-foreground">{f.privatizadoA}</span>}
        </span>
      ) : (
        pastilla(TIPOS, f.tipo)
      ),
  },
  { id: "ubicacion", label: "Dónde está", ocultable: true, render: (f) => pastilla(UBICACIONES, f.ubicacion) },
  { id: "reposicion", label: "Reposición", ocultable: true, render: (f) => pastilla(ESTADOS_REPOSICION, f.estadoReposicion) },
  { id: "ultimaRevision", label: "Última revisión", ocultable: true, clase: "tabular-nums whitespace-nowrap", render: (f) => fechaCorta(f.ultimaRevision) },
  {
    id: "proximaRevision",
    label: "Próxima revisión",
    ocultable: true,
    clase: "tabular-nums whitespace-nowrap",
    descripcion: "28 días después de la última revisión. Punto ámbar: ya pasó.",
    render: (f) => (
      <span className="inline-flex items-center gap-1.5">
        {f.revisionVencida && <Punto clase="bg-warning" texto="Revisión vencida" />}
        {fechaCorta(f.proximaRevision)}
      </span>
    ),
  },
  { id: "responsable", label: "Responsable", ocultable: true, clase: "text-muted-foreground whitespace-nowrap", render: (f) => f.responsableNombre ?? "—" },
  { id: "competencia", label: "Competencia", ocultable: true, oculta: true, render: (f) => (f.competencia === null ? "—" : f.competencia ? "Sí" : "No") },
  { id: "publicacion", label: "En Dropi", ocultable: true, oculta: true, render: (f) => pastilla(ESTADOS_PUBLICACION, f.estadoPublicacion) },
  { id: "costeReal", label: "Coste real", ocultable: true, oculta: true, clase: "text-right tabular-nums", render: (f) => usd(f.costeReal), descripcion: "Lo que costó la última compra." },
  { id: "fechaPublicacion", label: "Publicado", ocultable: true, oculta: true, clase: "tabular-nums whitespace-nowrap", render: (f) => fechaCorta(f.fechaPublicacion) },
  { id: "cambioPrecio", label: "Último cambio de precio", ocultable: true, oculta: true, clase: "tabular-nums whitespace-nowrap", render: (f) => fechaCorta(f.ultimoCambioPrecio) },
];

const COLOR_GRUPO: Record<string, OpcionPublicacion[]> = { estado: ESTADOS, venta: ESTADOS_VENTA, ubicacion: UBICACIONES, reposicion: ESTADOS_REPOSICION, tipo: TIPOS, publicacion: ESTADOS_PUBLICACION };

/** La lista de publicaciones del país con la barra de herramientas común y «Agregar». Toda la fila abre la ficha. */
export function TablaPublicaciones({
  publicaciones,
  personas,
  paisId,
  codigoPais,
  puedeEscribir,
}: {
  publicaciones: FilaPublicacion[];
  personas: Persona[];
  paisId: string;
  codigoPais: string;
  puedeEscribir: boolean;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [orden, setOrden] = useState<string[]>([]);
  const i = abierta ? orden.indexOf(abierta) : -1;
  return (
    <>
      <TablaDatos
        def={DEF_PUBLICACIONES}
        filas={publicaciones}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        etiquetaGrupo={(campo, grupo) => {
          const o = COLOR_GRUPO[campo] && grupo.clave !== SIN_VALOR ? opcion(COLOR_GRUPO[campo], grupo.clave) : null;
          return o ? <Badge color={o.color}>{o.etiqueta}</Badge> : <span className="font-semibold">{grupo.etiqueta}</span>;
        }}
        anchoMinimo="80rem"
        fijarEncabezado
        accionPrincipal={puedeEscribir ? <CrearPublicacionPanel paisId={paisId} personas={personas} /> : undefined}
        abrirFila={{
          etiqueta: (f) => `Abrir la ficha de ${f.nombre}`,
          alAbrir: (f, ids) => {
            setOrden(ids);
            setAbierta(f.id);
          },
        }}
        ariaLabel="Publicaciones en Dropi"
        vacio="Todavía no hay publicaciones en este país."
      />
      <FichaPublicacion
        publicacion={publicaciones.find((p) => p.id === abierta)}
        personas={personas}
        codigoPais={codigoPais}
        puedeEscribir={puedeEscribir}
        anterior={i > 0 ? () => setAbierta(orden[i - 1]) : undefined}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierta(orden[i + 1]) : undefined}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}
