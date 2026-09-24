"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, EstadoIcon, InventarioIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearUbicacionPanel } from "./crear-ubicacion-panel";
import { DEF_UBICACIONES, ETIQUETA_PROPIEDAD, ETIQUETA_TAMANO, TONO_PROPIEDAD, type FilaUbicacion, type Propiedad, type Tamano } from "./def-ubicaciones";
import { FichaUbicacion } from "./ficha-ubicacion";

const NOMBRE: NombreFilas = { singular: "ubicación", plural: "ubicaciones" };
const ICONOS: Record<string, IconoComp> = { bodega: InventarioIcon, propiedad: EstadoIcon, tamano: InventarioIcon, estado: EstadoIcon, codigo: InventarioIcon, creado: CalendarioIcon };

const COLUMNAS: ColumnaTabla<FilaUbicacion>[] = [
  { id: "codigo", label: "Código", ocultable: false, clase: "font-medium", render: (u) => u.codigo },
  { id: "bodega", label: "Bodega", ocultable: true, render: (u) => u.bodega },
  { id: "propiedad", label: "Propiedad", ocultable: true, render: (u) => <Badge tone={TONO_PROPIEDAD[u.propiedad as Propiedad] ?? "neutral"}>{ETIQUETA_PROPIEDAD[u.propiedad as Propiedad] ?? u.propiedad}</Badge> },
  { id: "tamano", label: "Tamaño", ocultable: true, clase: "text-muted-foreground", render: (u) => (u.tamano ? (ETIQUETA_TAMANO[u.tamano as Tamano] ?? u.tamano) : "—") },
  { id: "barras", label: "Código de barras", ocultable: true, clase: "text-muted-foreground tabular-nums", render: (u) => u.codigoBarras || "—" },
  { id: "estado", label: "Estado", ocultable: true, render: (u) => <Badge tone={u.activa ? "success" : "warning"}>{u.activa ? "Activa" : "Inactiva"}</Badge> },
];

/** Lista de ubicaciones de las bodegas del país con la barra de herramientas común y «Agregar». Toda la fila abre su ficha. */
export function TablaUbicaciones({
  ubicaciones,
  bodegas,
  codigoPais,
  puedeEscribir,
}: {
  ubicaciones: FilaUbicacion[];
  bodegas: { id: string; nombre: string }[];
  codigoPais: string;
  puedeEscribir: boolean;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <>
      <TablaDatos
        def={DEF_UBICACIONES}
        filas={ubicaciones}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(u) => u.id}
        anchoMinimo="46rem"
        accionPrincipal={puedeEscribir ? <CrearUbicacionPanel bodegas={bodegas} /> : undefined}
        abrirFila={{ etiqueta: (u) => `Abrir la ficha de la ubicación ${u.codigo} de ${u.bodega}`, alAbrir: (u) => setAbierta(u.id) }}
        ariaLabel="Ubicaciones"
        vacio="Todavía no hay ubicaciones. Usa «Agregar» para crear la primera."
      />
      <FichaUbicacion ubicacion={ubicaciones.find((u) => u.id === abierta)} codigoPais={codigoPais} puedeEscribir={puedeEscribir} alCerrar={() => setAbierta(null)} />
    </>
  );
}
