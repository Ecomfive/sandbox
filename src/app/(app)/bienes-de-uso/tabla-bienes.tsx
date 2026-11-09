"use client";

import { useState } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CalendarioIcon, EstadoIcon, GastoIcon, InventarioIcon, TiendaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { claseCifra } from "@/components/af4/estilos-af4";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero, entero, SIN_DATO } from "@/lib/af4/formato";
import { CrearBienPanel } from "./crear-bien-panel";
import { DEF_BIENES, type FilaBien } from "./def-bienes";
import { FichaBien } from "./ficha-bien";

const NOMBRE: NombreFilas = { singular: "bien", plural: "bienes" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  tipo: InventarioIcon,
  tienda: TiendaIcon,
  descripcion: InventarioIcon,
  alta: CalendarioIcon,
  importe: GastoIcon,
  acumulada: GastoIcon,
  neto: GastoIcon,
  mesesRestantes: CalendarioIcon,
};

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

const PUNTO: Record<FilaBien["estado"], string> = { "En uso": "bg-success", Depreciado: "bg-muted-foreground", "De baja": "bg-destructive" };

const derecha = `text-right whitespace-nowrap ${claseCifra}`;
const COLUMNAS: ColumnaTabla<FilaBien>[] = [
  { id: "descripcion", label: "Bien", ocultable: false, clase: "max-w-md truncate font-medium", render: (b) => b.descripcion },
  { id: "tipo", label: "Tipo", ocultable: true, clase: "whitespace-nowrap", render: (b) => b.tipo },
  { id: "tienda", label: "Tienda", ocultable: true, clase: "text-muted-foreground whitespace-nowrap", render: (b) => b.tienda },
  { id: "alta", label: "Alta", ocultable: true, clase: "whitespace-nowrap", render: (b) => mesCorto(`${b.alta}-01`) },
  { id: "importe", label: "Valor de origen", ocultable: false, clase: derecha, render: (b) => usd(b.importe), total: (fs) => usd(fs.reduce((a, b) => a + b.importe, 0)) },
  { id: "cuota", label: "Cuota mensual", ocultable: true, clase: `${derecha} text-muted-foreground`, render: (b) => usd(b.cuota) },
  { id: "acumulada", label: "Dep. acumulada", ocultable: true, clase: derecha, render: (b) => usd(b.acumulada), total: (fs) => usd(fs.reduce((a, b) => a + b.acumulada, 0)) },
  { id: "neto", label: "Valor neto", ocultable: false, clase: derecha, render: (b) => usd(b.neto), total: (fs) => usd(fs.reduce((a, b) => a + b.neto, 0)) },
  { id: "mesesRestantes", label: "Meses restantes", ocultable: true, clase: derecha, render: (b) => (b.estado === "En uso" ? entero(b.mesesRestantes) : SIN_DATO) },
  {
    id: "estado",
    label: "Estado",
    ocultable: true,
    render: (b) => (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PUNTO[b.estado]}`} />
        {b.estado}
      </span>
    ),
  },
];

/** Los bienes de uso con la barra de herramientas común y «Agregar». Toda la fila abre la ficha del bien. */
export function TablaBienes({ filas, tiendas, puedeEscribir }: { filas: FilaBien[]; tiendas: Opcion[]; puedeEscribir: boolean }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  return (
    <>
      <TablaDatos
        def={DEF_BIENES}
        filas={filas}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(b) => b.id}
        formatearTotal={usd}
        anchoMinimo="60rem"
        accionPrincipal={puedeEscribir ? <CrearBienPanel tiendas={tiendas} /> : undefined}
        abrirFila={{ etiqueta: (b) => `Abrir la ficha de ${b.descripcion.slice(0, 60)}`, alAbrir: (b) => setAbierto(b.id) }}
        ariaLabel="Bienes de uso"
        vacio="Todavía no hay bienes de uso. Agrégalos o importa la hoja «Bienes de Uso» del Excel."
      />
      <FichaBien bien={filas.find((f) => f.id === abierto)} tiendas={tiendas} puedeEscribir={puedeEscribir} alCerrar={() => setAbierto(null)} />
    </>
  );
}
