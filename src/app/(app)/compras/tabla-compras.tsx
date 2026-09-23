"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { CalendarioIcon, ComprasIcon, EstadoIcon, GastoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearCompraPanel } from "./crear-compra-panel";
import { DEF_COMPRAS, etiquetaEstado, etiquetaEtapa, tonoEstado, valorUnitario, type FilaCompra } from "./def-compras";
import { FichaCompra } from "./ficha-compra";

const NOMBRE: NombreFilas = { singular: "compra", plural: "compras" };
const ICONOS: Record<string, IconoComp> = {
  etapa: EstadoIcon,
  estado: EstadoIcon,
  proveedor: ProductoIcon,
  tienda: ComprasIcon,
  cliente: ProductoIcon,
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
  trackId: EstadoIcon,
  orden: EstadoIcon,
  inconveniente: EstadoIcon,
  planificacion: EstadoIcon,
  notas: EstadoIcon,
  asignado: ProductoIcon,
};

const toneEtapa = (etapa: string): "success" | "destructive" | "neutral" =>
  etapa === "completado" ? "success" : etapa === "descartado" ? "destructive" : "neutral";

const COLUMNAS: ColumnaTabla<FilaCompra, string>[] = [
  { id: "nombre", label: "Nombre", ocultable: false, clase: "font-medium", render: (c) => c.nombre },
  { id: "etapa", label: "Etapa", ocultable: true, render: (c) => <Badge tone={toneEtapa(c.etapa)}>{etiquetaEtapa(c.etapa)}</Badge> },
  { id: "estado", label: "Estado", ocultable: true, render: (c) => <Badge tone={tonoEstado(c.estado)}>{etiquetaEstado(c.estado)}</Badge> },
  { id: "proveedor", label: "Proveedor", ocultable: true, clase: "text-muted-foreground", render: (c) => c.proveedor || "—" },
  { id: "tienda", label: "Tienda", ocultable: true, clase: "text-muted-foreground", render: (c) => c.tienda || "—" },
  { id: "qtyTotal", label: "QTY Total", ocultable: true, clase: "tabular-nums", render: (c) => c.qtyTotal ?? "—" },
  { id: "montoTotal", label: "Monto Total", ocultable: true, clase: "tabular-nums", render: (c, codigoPais) => (c.montoTotal !== null ? formatearMoneda(c.montoTotal, codigoPais) : "—") },
  {
    id: "valorUnitario",
    label: "Valor Unitario",
    ocultable: true,
    clase: "tabular-nums",
    render: (c, codigoPais) => {
      const valor = valorUnitario(c);
      return valor !== null ? formatearMoneda(valor, codigoPais) : "—";
    },
  },
  { id: "fechaLimite", label: "Fecha límite", ocultable: true, render: (c) => (c.fechaLimite ? formatearFecha(c.fechaLimite) : "—") },
  { id: "fechaLlegada", label: "Fecha de llegada", ocultable: true, render: (c) => (c.fechaLlegada ? formatearFecha(c.fechaLlegada) : "—") },
];

/** Tabla de compras (Sistema WMS › Compras) con la barra de herramientas común: agrupar por etapa, filtros,
 * columnas, cerrados (completado/descartado) y «Agregar». Toda la fila se puede pulsar: abre la ficha. */
export function TablaCompras({
  compras,
  codigoPais,
  paisId,
  puedeEscribir,
}: {
  compras: FilaCompra[];
  codigoPais: string;
  paisId: string;
  puedeEscribir: boolean;
}) {
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  const compra = abierta ? compras.find((c) => c.id === abierta.id) : undefined;

  return (
    <>
      <TablaDatos
        def={DEF_COMPRAS}
        filas={compras}
        columnas={COLUMNAS}
        contexto={codigoPais}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(c) => c.id}
        formatearTotal={(total) => formatearMoneda(total, codigoPais)}
        anchoMinimo="56rem"
        abrirFila={{
          etiqueta: (c) => `Abrir la ficha de la compra ${c.nombre}`,
          alAbrir: (c, orden) => setAbierta({ id: c.id, orden }),
        }}
        accionPrincipal={puedeEscribir ? <CrearCompraPanel paisId={paisId} /> : undefined}
        ariaLabel="Tabla de compras"
        vacio="Todavía no hay compras registradas."
      />
      <FichaCompra
        compra={compra}
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
