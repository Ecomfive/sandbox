"use client";

import { useState } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge } from "@/components/ui/badge";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero2 } from "@/lib/af4/formato";
import { CalendarioIcon, EnvioIcon, EstadoIcon, ExtractoIcon, GastoIcon, PedidoIcon, ProductoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { FilaOrden } from "@/lib/ventas/cargar";
import { ESTADOS_ENTREGA } from "@/lib/ventas/matriz";
import { ETIQUETA_ESTADO, ETIQUETA_METODO } from "@/lib/ventas/resumen";
import { TONO_ESTADO } from "./estado-tono";
import { FichaOrden } from "./ficha-orden";

const metodo = (f: FilaOrden) => (f.metodo ? ETIQUETA_METODO[f.metodo] : "—");

const DEF: DefTabla<FilaOrden> = {
  clave: "ventas-tiendas-ordenes",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => ESTADOS_ENTREGA.map((e) => ({ valor: e, etiqueta: ETIQUETA_ESTADO[e] })),
      agrupable: true,
      ordenGrupos: ESTADOS_ENTREGA,
    },
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (f) => [f.tienda], agrupable: true },
    { id: "metodo", etiqueta: "Método de pago", tipo: "seleccion", valores: (f) => [metodo(f)], agrupable: true },
    { id: "transportista", etiqueta: "Transportista", tipo: "seleccion", valores: (f) => [f.transportista ?? "—"], agrupable: true },
    { id: "facturado", etiqueta: "Facturada", tipo: "seleccion", valores: (f) => [f.facturado ? "Sí" : "No"] },
    { id: "numero", etiqueta: "Orden", tipo: "texto", valor: (f) => f.numero },
    { id: "productos", etiqueta: "Productos", tipo: "texto", valor: (f) => f.productos },
    { id: "guia", etiqueta: "Guía", tipo: "texto", valor: (f) => f.guia ?? "" },
    { id: "total", etiqueta: "Total", tipo: "numero", valor: (f) => f.total },
    { id: "envio", etiqueta: "Costo de envío", tipo: "numero", valor: (f) => f.costoEnvio },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (f) => f.fecha },
    { id: "fechaEnvio", etiqueta: "Fecha de envío", tipo: "fecha", valor: (f) => f.fechaEnvio },
  ],
  total: (f) => f.total,
};
const NOMBRE: NombreFilas = { singular: "orden", plural: "órdenes" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  tienda: TiendaIcon,
  metodo: GastoIcon,
  transportista: EnvioIcon,
  facturado: ExtractoIcon,
  numero: PedidoIcon,
  productos: ProductoIcon,
  guia: EnvioIcon,
  total: GastoIcon,
  envio: EnvioIcon,
  fecha: CalendarioIcon,
  fechaEnvio: CalendarioIcon,
};

const suma = (filas: FilaOrden[], f: (o: FilaOrden) => number) => dinero2(filas.reduce((a, o) => a + f(o), 0));

const COLUMNAS: ColumnaTabla<FilaOrden, null>[] = [
  { id: "numero", label: "Orden", ocultable: false, clase: "whitespace-nowrap font-medium tabular-nums", render: (f) => f.numero },
  { id: "fecha", label: "Fecha", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => fechaCorta(f.fecha) },
  { id: "tienda", label: "Tienda", ocultable: true, clase: "whitespace-nowrap", render: (f) => f.tienda },
  { id: "estado", label: "Estado", ocultable: false, render: (f) => <Badge tone={TONO_ESTADO[f.estado]}>{ETIQUETA_ESTADO[f.estado]}</Badge> },
  { id: "productos", label: "Productos", ocultable: true, clase: "max-w-md", render: (f) => <span className="line-clamp-1">{f.productos}</span> },
  { id: "metodo", label: "Método de pago", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: metodo },
  { id: "transportista", label: "Transportista", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => f.transportista ?? "—" },
  { id: "guia", label: "Guía", ocultable: true, oculta: true, clase: "whitespace-nowrap tabular-nums text-muted-foreground", render: (f) => f.guia ?? "—" },
  { id: "fechaEnvio", label: "Envío", ocultable: true, oculta: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => (f.fechaEnvio ? fechaCorta(f.fechaEnvio) : "—") },
  { id: "envio", label: "Costo de envío", ocultable: true, clase: "text-right tabular-nums whitespace-nowrap text-muted-foreground", render: (f) => dinero2(f.costoEnvio), total: (fs) => suma(fs, (o) => o.costoEnvio) },
  { id: "total", label: "Total", ocultable: false, clase: "text-right tabular-nums whitespace-nowrap", render: (f) => dinero2(f.total), total: (fs) => suma(fs, (o) => o.total) },
];

/** Las órdenes de un mes. Toda la fila abre su ficha. Sin datos de la persona: ni en la tabla ni en la descarga. */
export function TablaOrdenes({ filas }: { filas: FilaOrden[] }) {
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  return (
    <>
      <TablaDatos
        def={DEF}
        filas={filas}
        columnas={COLUMNAS}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        formatearTotal={dinero2}
        abrirFila={{
          etiqueta: (f) => `Abrir la orden ${f.numero} de ${f.tienda}`,
          alAbrir: (f, orden) => setAbierta({ id: f.id, orden }),
        }}
        ariaLabel="Órdenes del mes"
        vacio="No hay órdenes con estos filtros."
      />
      {abierta && (
        <FichaOrden
          id={abierta.id}
          orden={abierta.orden}
          irA={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
          alCerrar={() => setAbierta(null)}
        />
      )}
    </>
  );
}
