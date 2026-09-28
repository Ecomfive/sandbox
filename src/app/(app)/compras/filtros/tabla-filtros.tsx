"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearMoneda } from "@/lib/formato";
import { EstadoIcon, FiltroIcon, GastoIcon, PersonaIcon, PrioridadIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearFiltroPanel } from "./crear-filtro-panel";
import {
  DEF_FILTROS,
  etiquetaEstado,
  etiquetaEstadoRegistro,
  etiquetaPrioridad,
  etiquetaTipoEnvio,
  tonoEstado,
  tonoEstadoRegistro,
  tonoPrioridad,
  type FilaFiltro,
} from "./def-filtros";
import { FichaFiltro } from "./ficha-filtro";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  estadoRegistro: EstadoIcon,
  estado: EstadoIcon,
  tipoEnvio: FiltroIcon,
  prioridad: PrioridadIcon,
  asignado: PersonaIcon,
  qtyProducto: FiltroIcon,
  precioTotal: GastoIcon,
  precioUnitario: GastoIcon,
  comentarios: EstadoIcon,
};

const COLUMNAS: ColumnaTabla<FilaFiltro, string>[] = [
  { id: "nombre", label: "Nombre", ocultable: false, clase: "font-medium", render: (f) => f.nombre },
  { id: "estadoRegistro", label: "Estado del Registro", ocultable: true, render: (f) => <Badge tone={tonoEstadoRegistro(f.estadoRegistro)}>{etiquetaEstadoRegistro(f.estadoRegistro)}</Badge> },
  { id: "estado", label: "Estado", ocultable: true, render: (f) => <Badge tone={tonoEstado(f.estado)}>{etiquetaEstado(f.estado)}</Badge> },
  { id: "tipoEnvio", label: "Tipo de Envío", ocultable: true, clase: "text-muted-foreground", render: (f) => etiquetaTipoEnvio(f.tipoEnvio) || "—" },
  { id: "qtyProducto", label: "QTY Producto", ocultable: true, clase: "tabular-nums", render: (f) => f.qtyProducto ?? "—" },
  { id: "precioTotal", label: "Precio Total", ocultable: true, clase: "tabular-nums", render: (f, codigoPais) => (f.precioTotal !== null ? formatearMoneda(f.precioTotal, codigoPais) : "—") },
  { id: "precioUnitario", label: "Precio Unitario", ocultable: true, clase: "tabular-nums", render: (f, codigoPais) => (f.precioUnitario !== null ? formatearMoneda(f.precioUnitario, codigoPais) : "—") },
  { id: "prioridad", label: "Prioridad", ocultable: true, render: (f) => <Badge tone={tonoPrioridad(f.prioridad)}>{etiquetaPrioridad(f.prioridad)}</Badge> },
  { id: "asignado", label: "Persona asignada", ocultable: true, clase: "text-muted-foreground", render: (f) => f.asignadoNombre || "—" },
];

/** Tabla de Filtros (Sistema WMS › Compras › Filtros): el embudo de cotización de productos candidatos,
 * calcado de la lista de ClickUp «Productos y Filtro PA», con la barra de herramientas común. */
export function TablaFiltros({
  filtros,
  codigoPais,
  paisId,
  puedeEscribir,
}: {
  filtros: FilaFiltro[];
  codigoPais: string;
  paisId: string;
  puedeEscribir: boolean;
}) {
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  const filtro = abierta ? filtros.find((f) => f.id === abierta.id) : undefined;

  return (
    <>
      <TablaDatos
        def={DEF_FILTROS}
        filas={filtros}
        columnas={COLUMNAS}
        contexto={codigoPais}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        formatearTotal={(total) => formatearMoneda(total, codigoPais)}
        anchoMinimo="56rem"
        abrirFila={{
          etiqueta: (f) => `Abrir la ficha del producto ${f.nombre}`,
          alAbrir: (f, orden) => setAbierta({ id: f.id, orden }),
        }}
        accionPrincipal={puedeEscribir ? <CrearFiltroPanel paisId={paisId} /> : undefined}
        ariaLabel="Tabla de productos y filtros"
        vacio="Todavía no hay productos registrados."
      />
      <FichaFiltro
        filtro={filtro}
        orden={abierta?.orden ?? []}
        paisId={paisId}
        codigoPais={codigoPais}
        puedeEscribir={puedeEscribir}
        alIr={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}
