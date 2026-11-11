"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { claseCifra } from "@/components/af4/estilos-af4";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, entero, porcentaje, SIN_DATO } from "@/lib/af4/formato";
import { CalendarioIcon, GastoIcon, ProductoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { FilaCostoProducto } from "@/lib/finanzas/cargar-costos";

/** Un costo unitario: dos decimales y hasta cuatro si hacen falta. */
export const usd4 = (v: number) => dinero(v, "USD", { decimales: 2, decimalesMax: 4 });

const DEF: DefTabla<FilaCostoProducto> = {
  clave: "costos-productos",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => f.producto },
    { id: "linea", etiqueta: "Línea", tipo: "seleccion", valores: (f) => [f.linea], agrupable: true },
    { id: "proveedor", etiqueta: "Proveedor", tipo: "seleccion", valores: (f) => [f.proveedor ?? "—"], agrupable: true },
    { id: "costo", etiqueta: "Costo vigente", tipo: "numero", valor: (f) => f.costoVigente },
    { id: "lotes", etiqueta: "Lotes", tipo: "numero", valor: (f) => f.lotes },
    { id: "variacion", etiqueta: "Último vs. promedio %", tipo: "numero", valor: (f) => (f.variacion === null ? 0 : Math.round(f.variacion * 10) / 10) },
    { id: "llegada", etiqueta: "Última llegada", tipo: "fecha", valor: (f) => f.llegada ?? "" },
  ],
};
const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = { producto: ProductoIcon, linea: TiendaIcon, proveedor: TiendaIcon, costo: GastoIcon, lotes: ProductoIcon, variacion: GastoIcon, llegada: CalendarioIcon };

const COLUMNAS: ColumnaTabla<FilaCostoProducto, null>[] = [
  { id: "producto", label: "Producto", ocultable: false, clase: "max-w-md", render: (f) => <span className="line-clamp-2">{f.producto}</span> },
  { id: "linea", label: "Línea", ocultable: true, clase: "text-muted-foreground whitespace-nowrap", render: (f) => f.linea },
  { id: "costo", label: "Costo vigente", ocultable: false, clase: `text-right whitespace-nowrap font-medium ${claseCifra}`, render: (f) => usd4(f.costoVigente) },
  {
    id: "rango",
    label: "Promedio · rango",
    ocultable: true,
    clase: `text-right whitespace-nowrap text-muted-foreground ${claseCifra}`,
    render: (f) => (f.lotes > 1 ? `${f.costoPromedio === null ? SIN_DATO : usd4(f.costoPromedio)} · ${usd4(f.minimo)}–${usd4(f.maximo)}` : SIN_DATO),
  },
  {
    id: "variacion",
    label: "Último vs. promedio",
    ocultable: true,
    clase: `text-right whitespace-nowrap ${claseCifra}`,
    render: (f) =>
      f.variacion === null || f.lotes < 2 ? (
        SIN_DATO
      ) : (
        <span className="inline-flex items-center gap-1.5">
          {Math.abs(f.variacion) >= 10 && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${f.variacion > 0 ? "bg-warning" : "bg-success"}`} />}
          {porcentaje(f.variacion, { conSigno: true })}
        </span>
      ),
  },
  { id: "lotes", label: "Lotes", ocultable: true, clase: `text-right ${claseCifra}`, render: (f) => entero(f.lotes) },
  { id: "llegada", label: "Última llegada", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => (f.llegada ? fechaCorta(f.llegada) : (f.mes ?? SIN_DATO)) },
  { id: "proveedor", label: "Proveedor", ocultable: true, clase: "text-muted-foreground", render: (f) => f.proveedor ?? SIN_DATO },
];

export function TablaCostos({ filas }: { filas: FilaCostoProducto[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.clave}
      ariaLabel="Costo vigente por producto"
      vacio="Todavía no hay costos. Cárgalos desde «Importar Excel»."
    />
  );
}
