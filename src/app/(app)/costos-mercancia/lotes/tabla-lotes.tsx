"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { claseCifra } from "@/components/af4/estilos-af4";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, entero, SIN_DATO } from "@/lib/af4/formato";
import { CalendarioIcon, GastoIcon, ProductoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { usd4 } from "../formato";

export interface FilaLote {
  id: string;
  producto: string;
  clave: string;
  linea: string;
  hoja: string;
  llegada: string | null;
  mes: string | null;
  proveedor: string | null;
  cantidad: number | null;
  unitario: number;
  extras: number;
  total: number;
}

const DEF: DefTabla<FilaLote> = {
  clave: "costos-lotes",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "seleccion", valores: (f) => [f.producto], agrupable: true },
    { id: "linea", etiqueta: "Línea", tipo: "seleccion", valores: (f) => [f.linea], agrupable: true },
    { id: "proveedor", etiqueta: "Proveedor", tipo: "seleccion", valores: (f) => [f.proveedor ?? "—"], agrupable: true },
    { id: "mes", etiqueta: "Mes de llegada", tipo: "seleccion", valores: (f) => [f.mes ?? "—"], agrupable: true },
    { id: "total", etiqueta: "Costo real unitario", tipo: "numero", valor: (f) => f.total },
    { id: "llegada", etiqueta: "Llegada", tipo: "fecha", valor: (f) => f.llegada ?? "" },
  ],
  total: (f) => (f.cantidad ?? 0) * f.total,
};
const NOMBRE: NombreFilas = { singular: "lote", plural: "lotes" };
const ICONOS: Record<string, IconoComp> = { producto: ProductoIcon, linea: TiendaIcon, proveedor: TiendaIcon, mes: CalendarioIcon, total: GastoIcon, llegada: CalendarioIcon };

const COLUMNAS: ColumnaTabla<FilaLote, null>[] = [
  { id: "llegada", label: "Llegada", ocultable: false, clase: `whitespace-nowrap ${claseCifra}`, render: (f) => (f.llegada ? fechaCorta(f.llegada) : (f.mes ?? SIN_DATO)) },
  { id: "producto", label: "Producto", ocultable: false, clase: "max-w-md", render: (f) => <span className="line-clamp-2">{f.producto}</span> },
  { id: "proveedor", label: "Proveedor", ocultable: true, clase: "text-muted-foreground", render: (f) => f.proveedor ?? SIN_DATO },
  { id: "cantidad", label: "Cantidad", ocultable: true, clase: `text-right ${claseCifra}`, render: (f) => (f.cantidad === null ? SIN_DATO : entero(f.cantidad)) },
  { id: "unitario", label: "Costo", ocultable: true, clase: `text-right text-muted-foreground ${claseCifra}`, render: (f) => usd4(f.unitario) },
  { id: "extras", label: "Comisiones, impuesto, envío y financiamiento", ocultable: true, clase: `text-right text-muted-foreground ${claseCifra}`, render: (f) => usd4(f.extras) },
  { id: "total", label: "Costo real", ocultable: false, clase: `text-right font-medium ${claseCifra}`, render: (f) => usd4(f.total) },
];

export function TablaLotes({ filas }: { filas: FilaLote[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      formatearTotal={(v) => dinero(v)}
      ariaLabel="Lotes de mercancía"
      vacio="Todavía no hay lotes. Cárgalos desde «Importar Excel»."
    />
  );
}
