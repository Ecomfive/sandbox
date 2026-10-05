"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { AdjuntoIcon, CalendarioIcon, ComprasIcon, EstadoIcon, EtiquetaIcon, GastoIcon, PersonaIcon, PrioridadIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearCompraPanel } from "./crear-compra-panel";
import { SelectorVista } from "./selector-vista";
import {
  colorEstado,
  colorEtapa,
  conEmoji,
  DEF_COMPRAS,
  diasDeCompra,
  etiquetaEstado,
  etiquetaEtapa,
  etiquetaVia,
  MONEDA_COMPRAS,
  prioridadDe,
  valorUnitario,
  type FilaCompra,
} from "./def-compras";
import { FichaCompra } from "./ficha-compra";

const NOMBRE: NombreFilas = { singular: "compra", plural: "compras" };
const ICONOS: Record<string, IconoComp> = {
  pais: ComprasIcon,
  etapa: EstadoIcon,
  estado: EstadoIcon,
  proveedor: ProductoIcon,
  tienda: ComprasIcon,
  cliente: PersonaIcon,
  viaEnvio: ComprasIcon,
  prioridad: PrioridadIcon,
  etiquetas: EtiquetaIcon,
  planificacionMes: CalendarioIcon,
  codigo: EtiquetaIcon,
  qtyTotal: ProductoIcon,
  montoTotal: GastoIcon,
  valorUnitario: GastoIcon,
  primerPago: GastoIcon,
  segundoPago: GastoIcon,
  pagadoAProveedor: GastoIcon,
  pagoPendiente: GastoIcon,
  cobradoCliente: GastoIcon,
  pendienteCliente: GastoIcon,
  fechaLimite: CalendarioIcon,
  fechaLlegada: CalendarioIcon,
  fechaPago1: CalendarioIcon,
  fechaPago2: CalendarioIcon,
  fechaEnvio: CalendarioIcon,
  creado: CalendarioIcon,
  cerrado: CalendarioIcon,
  dias: CalendarioIcon,
  trackId: EstadoIcon,
  orden: EstadoIcon,
  inconveniente: EstadoIcon,
  notas: EstadoIcon,
  asignado: PersonaIcon,
  factura: EstadoIcon,
  financiamiento: GastoIcon,
};

const usd = (v: number | null) => (v !== null ? formatearMoneda(v, MONEDA_COMPRAS) : "—");
const fecha = (v: string | null) => (v ? formatearFecha(v) : "—");
const siNo = (v: boolean) => (v ? "Sí" : <span className="text-muted-foreground">No</span>);
const lista = (v: string[], f: (x: string) => string = (x) => x) => (v.length ? v.map(f).join(", ") : "—");

/** Una columna con el emoji de su campo delante del nombre, como en ClickUp. */
function col(id: string, nombre: string, resto: Omit<ColumnaTabla<FilaCompra>, "id" | "label">): ColumnaTabla<FilaCompra> {
  return { id, label: conEmoji(id, nombre), ...resto };
}

const COLUMNAS: ColumnaTabla<FilaCompra>[] = [
  col("foto", "Foto", {
    ocultable: true,
    render: (c) =>
      c.fotoUrl ? (
        <TarjetaEmergente
          clase="rounded-lg border border-border bg-card p-1.5 shadow-lg"
          contenido={
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.fotoUrl} alt="" className="max-h-72 max-w-72 rounded-md object-contain" />
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.fotoUrl} alt="" className="h-8 w-8 rounded-md border border-border object-cover" />
        </TarjetaEmergente>
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
          <AdjuntoIcon className="h-3.5 w-3.5" />
        </div>
      ),
  }),
  { id: "nombre", label: "Nombre", ocultable: false, clase: "font-medium", render: (c) => c.nombre },
  col("codigo", "Código", { ocultable: true, clase: "text-muted-foreground tabular-nums whitespace-nowrap", render: (c) => c.codigo ?? "—" }),
  col("pais", "País", { ocultable: true, clase: "text-muted-foreground", render: (c) => c.paisCodigo ?? (c.paisesDestino.length ? `→ ${c.paisesDestino.join(", ")}` : "—") }),
  col("etapa", "Etapa", { ocultable: true, render: (c) => <Badge color={colorEtapa(c.etapa)}>{etiquetaEtapa(c.etapa)}</Badge> }),
  col("estado", "Estado", { ocultable: true, render: (c) => <Badge color={colorEstado(c.estado)}>{etiquetaEstado(c.estado)}</Badge> }),
  col("prioridad", "Prioridad", {
    ocultable: true,
    render: (c) => {
      const p = prioridadDe(c.prioridad);
      return p ? <Badge color={p.color}>{p.etiqueta}</Badge> : "—";
    },
  }),
  col("proveedor", "Proveedor", { ocultable: true, clase: "text-muted-foreground", render: (c) => c.proveedor || "—" }),
  col("tienda", "Tienda", { ocultable: true, clase: "text-muted-foreground", render: (c) => c.tienda || "—" }),
  col("cliente", "Cliente", { ocultable: true, clase: "text-muted-foreground", render: (c) => c.cliente || "—" }),
  col("viaEnvio", "Vía de envío", { ocultable: true, clase: "whitespace-nowrap", render: (c) => lista(c.viaEnvio, etiquetaVia) }),
  col("etiquetas", "Etiquetas", { ocultable: true, clase: "text-muted-foreground", render: (c) => lista(c.etiquetas) }),
  col("asignado", "Responsable", { ocultable: true, clase: "text-muted-foreground", render: (c) => c.asignadoNombre || "—" }),
  col("planificacion", "Planificación", { ocultable: true, clase: "text-muted-foreground", render: (c) => c.planificacion || "—" }),
  col("qtyTotal", "QTY Total", { ocultable: true, clase: "tabular-nums", render: (c) => c.qtyTotal ?? "—" }),
  col("montoTotal", "Monto Total", { ocultable: true, clase: "tabular-nums", render: (c) => usd(c.montoTotal) }),
  col("valorUnitario", "Valor Unitario", { ocultable: true, clase: "tabular-nums", render: (c) => usd(valorUnitario(c)) }),
  col("primerPago", "Primer Pago", { ocultable: true, clase: "tabular-nums", render: (c) => usd(c.primerPago) }),
  col("segundoPago", "Segundo Pago", { ocultable: true, clase: "tabular-nums", render: (c) => usd(c.segundoPago) }),
  col("pagadoAProveedor", "Pagado a Proveedor", { ocultable: true, clase: "tabular-nums", render: (c) => usd(c.pagadoAProveedor) }),
  col("pagoPendiente", "Pago Pendiente", { ocultable: true, clase: "tabular-nums", render: (c) => usd(c.pagoPendiente) }),
  col("cobradoCliente", "Cobrado Cliente", { ocultable: true, clase: "tabular-nums", render: (c) => usd(c.cobradoCliente) }),
  col("pendienteCliente", "Pendiente Cliente", { ocultable: true, clase: "tabular-nums", render: (c) => usd(c.pendienteCliente) }),
  col("pagoCliente", "Pago Cliente", { ocultable: true, render: (c) => c.pagoCliente || "—" }),
  col("cuentaReceptora", "Cuenta receptora", { ocultable: true, clase: "text-muted-foreground", render: (c) => c.cuentaReceptora || "—" }),
  col("factura", "Factura", { ocultable: true, render: (c) => siNo(c.factura) }),
  col("financiamiento", "Financiamiento", { ocultable: true, render: (c) => siNo(c.financiamiento) }),
  col("revisadoAA", "Revisado AA", { ocultable: true, render: (c) => siNo(c.revisadoAA) }),
  col("fechaPago1", "Fecha de Pago (1)", { ocultable: true, clase: "whitespace-nowrap", render: (c) => fecha(c.fechaPago1) }),
  col("fechaPago2", "Fecha de Pago (2)", { ocultable: true, clase: "whitespace-nowrap", render: (c) => fecha(c.fechaPago2) }),
  col("fechaEnvio", "Fecha de Envío", { ocultable: true, clase: "whitespace-nowrap", render: (c) => fecha(c.fechaEnvio) }),
  col("fechaLlegada", "Fecha de llegada", { ocultable: true, clase: "whitespace-nowrap", render: (c) => fecha(c.fechaLlegada) }),
  col("fechaLimite", "Fecha límite", { ocultable: true, clase: "whitespace-nowrap", render: (c) => fecha(c.fechaLimite) }),
  col("trackId", "Track ID", { ocultable: true, clase: "text-muted-foreground", render: (c) => c.trackId || "—" }),
  col("orden", "Orden", { ocultable: true, clase: "text-muted-foreground tabular-nums", render: (c) => c.orden || "—" }),
  col("inconveniente", "Inconveniente", { ocultable: true, render: (c) => c.inconveniente || "—" }),
  col("creado", "Creada", { ocultable: true, clase: "whitespace-nowrap", render: (c) => fecha(c.creadoEn) }),
  col("cerrado", "Cerrada", { ocultable: true, clase: "whitespace-nowrap", render: (c) => fecha(c.cerradoEn) }),
  col("dias", "Días", { ocultable: true, clase: "tabular-nums", render: (c) => diasDeCompra(c) }),
];

/**
 * El tablero de Compras con la barra de herramientas común (agrupar por etapa, país, vía de envío…, filtros, columnas,
 * cerrados y «Agregar») y el selector de qué compras ver. Cada columna lleva el emoji de su campo, como en ClickUp. Toda la
 * fila abre la ficha.
 */
export function TablaCompras({
  compras,
  vista,
  paises,
  puedeEscribir,
  puedeAgregarPais,
}: {
  compras: FilaCompra[];
  vista: string;
  paises: { id: string; codigo: string; nombre: string }[];
  puedeEscribir: boolean;
  /** Puede modificar Configuración: ve «＋ País» junto al selector. */
  puedeAgregarPais: boolean;
}) {
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  const compra = abierta ? compras.find((c) => c.id === abierta.id) : undefined;

  return (
    <>
      <TablaDatos
        def={DEF_COMPRAS}
        filas={compras}
        columnas={COLUMNAS}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(c) => c.id}
        formatearTotal={(total) => formatearMoneda(total, MONEDA_COMPRAS)}
        anchoMinimo="72rem"
        abrirFila={{
          etiqueta: (c) => `Abrir la ficha de la compra ${c.nombre}`,
          alAbrir: (c, orden) => setAbierta({ id: c.id, orden }),
        }}
        accionPrincipal={
          <div className="flex items-center gap-2">
            <SelectorVista vista={vista} paises={paises} puedeAgregarPais={puedeAgregarPais} />
            {puedeEscribir && <CrearCompraPanel vista={vista} paises={paises} />}
          </div>
        }
        ariaLabel="Tablero de compras"
        vacio={vista === "importacion" ? "Todavía no hay compras de Importadora." : "Todavía no hay compras registradas."}
      />
      <FichaCompra
        compra={compra}
        orden={abierta?.orden ?? []}
        paises={paises}
        puedeEscribir={puedeEscribir}
        alIr={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}
