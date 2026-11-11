"use client";

import type { ReactNode } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import type { FilaEntrega } from "@/lib/deliverys/cargar";
import { ETIQUETA_CATEGORIA, ETIQUETA_ESTADO, ETIQUETA_METODO } from "@/lib/deliverys/liquidacion";
import { fechaCorta } from "@/lib/af4/fecha";
import { CalendarioIcon, EnvioIcon, EstadoIcon, EtiquetaIcon, GastoIcon, PedidoIcon, PersonaIcon, TiendaIcon, WalletIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { dinero2, entero } from "@/lib/af4/formato";


const NOMBRE: NombreFilas = { singular: "línea", plural: "líneas" };
const sinCategoria = "Sin tarifa";

/** Las entregas de la semana: se agrupan por repartidor, estado, tienda o tarifa y por grupo se suma lo que se paga. */
const DEF_ENTREGAS: DefTabla<FilaEntrega> = {
  clave: "deliverys-entregas",
  campos: [
    { id: "repartidor", etiqueta: "Repartidor", tipo: "seleccion", valores: (f) => [f.repartidor], agrupable: true },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [ETIQUETA_ESTADO[f.estado]], agrupable: true },
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (f) => [f.tienda], agrupable: true },
    { id: "categoria", etiqueta: "Tarifa", tipo: "seleccion", valores: (f) => [f.categoria ? ETIQUETA_CATEGORIA[f.categoria] : sinCategoria], agrupable: true },
    { id: "zona", etiqueta: "Zona", tipo: "seleccion", valores: (f) => [f.zona ?? "—"], agrupable: true },
    { id: "dia", etiqueta: "Día", tipo: "seleccion", valores: (f) => [f.fecha], agrupable: true, formatearValor: fechaCorta },
    { id: "origen", etiqueta: "Origen", tipo: "seleccion", valores: (f) => [f.origen === "manual" ? "Cargada a mano" : "Hoja de deliverys"], agrupable: true },
    { id: "orden", etiqueta: "Orden", tipo: "texto", valor: (f) => f.orden ?? "" },
    { id: "cantidad", etiqueta: "Cantidad", tipo: "numero", valor: (f) => f.cantidad },
    { id: "monto", etiqueta: "Se paga", tipo: "numero", valor: (f) => f.monto },
    { id: "cobrado", etiqueta: "Cobrado", tipo: "numero", valor: (f) => f.cobrado },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (f) => f.fecha },
  ],
  total: (f) => f.monto,
  vistaInicial: { agrupar: "repartidor" },
};

const ICONOS: Record<string, IconoComp> = {
  repartidor: PersonaIcon,
  estado: EstadoIcon,
  tienda: TiendaIcon,
  categoria: EtiquetaIcon,
  zona: EnvioIcon,
  dia: CalendarioIcon,
  origen: EstadoIcon,
  orden: PedidoIcon,
  cantidad: EnvioIcon,
  monto: GastoIcon,
  cobrado: WalletIcon,
  fecha: CalendarioIcon,
};

const COLUMNAS: ColumnaTabla<FilaEntrega, null>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, clase: "whitespace-nowrap tabular-nums", render: (f) => fechaCorta(f.fecha) },
  { id: "repartidor", label: "Repartidor", ocultable: true, clase: "whitespace-nowrap", render: (f) => (f.zona ? `${f.repartidor} · ${f.zona}` : f.repartidor) },
  { id: "tienda", label: "Tienda", ocultable: true, clase: "whitespace-nowrap", render: (f) => (f.pagoAparte ? `${f.tienda} · aparte` : f.tienda) },
  {
    id: "estado",
    label: "Estado",
    ocultable: true,
    clase: "whitespace-nowrap",
    render: (f) => (
      <span className="inline-flex items-center gap-1.5">
        {f.estado !== "entregado" && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${f.estado === "fallido" ? "bg-warning" : "bg-muted-foreground"}`} />}
        {ETIQUETA_ESTADO[f.estado]}
      </span>
    ),
  },
  { id: "categoria", label: "Tarifa", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => (f.categoria ? `${ETIQUETA_CATEGORIA[f.categoria]}${f.categoria === "propina" ? "" : ` · ${dinero2(f.tarifa)}`}` : sinCategoria) },
  { id: "orden", label: "Orden", ocultable: true, clase: "whitespace-nowrap tabular-nums text-muted-foreground", render: (f) => f.orden ?? "—" },
  {
    id: "cantidad",
    label: "Cantidad",
    ocultable: true,
    clase: "text-right tabular-nums",
    render: (f) => (f.categoria === "propina" ? "—" : f.cantidad),
    total: (filas) => entero(filas.reduce((a, x) => a + (x.categoria === "propina" ? 0 : x.cantidad), 0)),
  },
  {
    id: "monto",
    label: "Se paga",
    ocultable: false,
    clase: "text-right tabular-nums whitespace-nowrap",
    render: (f) => (f.monto ? dinero2(f.monto) : "—"),
    total: (filas) => dinero2(filas.reduce((a, x) => a + x.monto, 0)),
  },
  {
    id: "cobrado",
    label: "Cobrado",
    ocultable: true,
    clase: "text-right tabular-nums whitespace-nowrap text-muted-foreground",
    render: (f) => (f.cobrado === null ? "—" : `${dinero2(f.cobrado)}${f.metodo ? ` · ${ETIQUETA_METODO[f.metodo]}` : ""}`),
    total: (filas) => dinero2(filas.reduce((a, x) => a + (x.cobrado ?? 0), 0)),
  },
];

export function TablaEntregas({ filas, agregar }: { filas: FilaEntrega[]; agregar?: ReactNode }) {
  return (
    <TablaDatos
      def={DEF_ENTREGAS}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      formatearTotal={(v) => dinero2(v)}
      accionPrincipal={agregar}
      ariaLabel="Entregas de la semana"
      vacio="No hay entregas en esta semana."
    />
  );
}
