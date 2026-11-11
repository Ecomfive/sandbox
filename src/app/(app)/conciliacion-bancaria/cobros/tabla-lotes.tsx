"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, entero } from "@/lib/af4/formato";
import { CalendarioIcon, ConciliarIcon, EstadoIcon, ExtractoIcon, GastoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { FilaLote } from "@/lib/conciliacion/cargar";

const NOMBRE: NombreFilas = { singular: "lote", plural: "lotes" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  lote: ExtractoIcon,
  tiendas: TiendaIcon,
  bruto: GastoIcon,
  depositado: GastoIcon,
  comision: GastoIcon,
  fecha: CalendarioIcon,
  deposito: ConciliarIcon,
};

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

const PUNTO: Record<FilaLote["estado"], string> = { Depositado: "bg-success", Parcial: "bg-warning", "Sin depositar": "bg-destructive" };

const DEF: DefTabla<FilaLote> = {
  clave: "conciliacion-cobros",
  campos: [
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (l) => [l.estado], agrupable: true },
    { id: "tiendas", etiqueta: "Tiendas", tipo: "seleccion", valores: (l) => (l.tiendas ? l.tiendas.split(", ") : ["—"]), agrupable: true },
    { id: "lote", etiqueta: "Lote", tipo: "texto", valor: (l) => l.lote },
    { id: "bruto", etiqueta: "Cobrado", tipo: "numero", valor: (l) => l.bruto },
    { id: "depositado", etiqueta: "Depositado", tipo: "numero", valor: (l) => l.depositado },
    { id: "comision", etiqueta: "Comisión", tipo: "numero", valor: (l) => l.comision },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (l) => l.fecha },
    { id: "deposito", etiqueta: "Depósito", tipo: "texto", valor: (l) => l.deposito },
  ],
  total: (l) => l.bruto,
};

const suma = (filas: FilaLote[], campo: "bruto" | "depositado" | "comision") => usd(filas.reduce((a, l) => a + l[campo], 0));

const COLUMNAS: ColumnaTabla<FilaLote, null>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, clase: "whitespace-nowrap", render: (l) => fechaCorta(l.fecha) },
  { id: "lote", label: "Lote", ocultable: false, clase: "whitespace-nowrap", render: (l) => (l.fuente === "servientrega" ? l.lote : `Día ${fechaCorta(l.lote)}`) },
  {
    id: "cobros",
    label: "Cobros",
    ocultable: true,
    clase: "text-right tabular-nums",
    render: (l) => (
      <>
        {entero(l.cobros)}
        {l.anuladas > 0 && <span className="text-muted-foreground"> (+{entero(l.anuladas)} anuladas)</span>}
      </>
    ),
  },
  { id: "tiendas", label: "Tiendas", ocultable: true, clase: "text-muted-foreground", render: (l) => l.tiendas || "—" },
  { id: "bruto", label: "Cobrado", ocultable: false, clase: "text-right tabular-nums whitespace-nowrap", render: (l) => usd(l.bruto), total: (f) => suma(f, "bruto") },
  { id: "comision", label: "Comisión", ocultable: true, clase: "text-right tabular-nums whitespace-nowrap", render: (l) => dinero(l.comision, "USD", { decimales: 2, vacioSiCero: true }), total: (f) => suma(f, "comision") },
  { id: "depositado", label: "Depositado", ocultable: false, clase: "text-right tabular-nums whitespace-nowrap", render: (l) => usd(l.depositado), total: (f) => suma(f, "depositado") },
  {
    id: "estado",
    label: "Estado",
    ocultable: false,
    render: (l) => (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PUNTO[l.estado]}`} />
        {l.estado}
      </span>
    ),
  },
  { id: "deposito", label: "Depósito", ocultable: true, clase: "text-muted-foreground whitespace-nowrap", render: (l) => l.deposito },
];

/** Los lotes de una fuente de cobro: lo cobrado, lo depositado y en qué línea del banco llegó. */
export function TablaLotes({ filas }: { filas: FilaLote[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(l) => l.id}
      formatearTotal={usd}
      ariaLabel="Lotes de cobro"
      vacio="No hay cobros de esta fuente."
    />
  );
}
