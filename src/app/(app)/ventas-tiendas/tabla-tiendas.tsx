"use client";

import { useRouter } from "next/navigation";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { EnvioIcon, GastoIcon, PedidoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { sumar, type Totales } from "@/lib/ventas/resumen";
import { dinero, dinero2, entero, fraccion } from "@/lib/af4/formato";
import { COBERTURA_MINIMA } from "./formato";

export interface FilaTienda extends Totales {
  id: string;
  tienda: string;
}

const DEF: DefTabla<FilaTienda> = {
  clave: "ventas-tiendas-por-tienda",
  campos: [
    { id: "tienda", etiqueta: "Tienda", tipo: "texto", valor: (f) => f.tienda },
    { id: "ordenes", etiqueta: "Órdenes", tipo: "numero", valor: (f) => f.ordenes },
    { id: "entregadas", etiqueta: "Entregadas", tipo: "numero", valor: (f) => f.entregadas },
    { id: "ventas", etiqueta: "Ventas entregadas", tipo: "numero", valor: (f) => f.ventas_entregadas },
    { id: "margen", etiqueta: "Margen bruto", tipo: "numero", valor: (f) => f.margen_bruto },
  ],
};
const NOMBRE: NombreFilas = { singular: "tienda", plural: "tiendas" };
const ICONOS: Record<string, IconoComp> = { tienda: TiendaIcon, ordenes: PedidoIcon, entregadas: EnvioIcon, ventas: GastoIcon, margen: GastoIcon };

/** El total de una columna recalculado sobre las filas que se ven (las tasas no se suman ni se promedian). */
const tot = (f: (t: Totales) => string) => (filas: FilaTienda[]) => f(sumar(filas.map((x) => ({ ...x, periodo: "", unidad_id: x.id }))));

const COLUMNAS: ColumnaTabla<FilaTienda, null>[] = [
  { id: "tienda", label: "Tienda", ocultable: false, clase: "whitespace-nowrap font-medium", render: (f) => f.tienda },
  { id: "ordenes", label: "Órdenes", ocultable: false, clase: "text-right tabular-nums", render: (f) => entero(f.ordenes), total: tot((t) => entero(t.ordenes)) },
  { id: "enviadas", label: "Enviadas", ocultable: true, clase: "text-right tabular-nums", render: (f) => entero(f.enviadas), total: tot((t) => entero(t.enviadas)) },
  { id: "entregadas", label: "Entregadas", ocultable: false, clase: "text-right tabular-nums", render: (f) => entero(f.entregadas), total: tot((t) => entero(t.entregadas)) },
  { id: "devueltas", label: "Devueltas", ocultable: true, clase: "text-right tabular-nums", render: (f) => entero(f.devueltas), total: tot((t) => entero(t.devueltas)) },
  {
    id: "canceladas",
    label: "Canceladas",
    ocultable: true,
    clase: "text-right tabular-nums text-muted-foreground",
    render: (f) => entero(f.canceladas + f.no_gestionadas),
    total: tot((t) => entero(t.canceladas + t.no_gestionadas)),
  },
  { id: "tasa", label: "Tasa de entrega", ocultable: true, clase: "text-right tabular-nums", render: (f) => fraccion(f.tasa_entrega), total: tot((t) => fraccion(t.tasa_entrega)) },
  { id: "ventas", label: "Ventas entregadas", ocultable: false, clase: "text-right tabular-nums whitespace-nowrap", render: (f) => dinero(f.ventas_entregadas), total: tot((t) => dinero(t.ventas_entregadas)) },
  { id: "ticket", label: "Ticket", ocultable: true, clase: "text-right tabular-nums whitespace-nowrap", render: (f) => dinero2(f.ticket_promedio), total: tot((t) => dinero2(t.ticket_promedio)) },
  { id: "costo", label: "Costo mercancía", ocultable: true, clase: "text-right tabular-nums whitespace-nowrap text-muted-foreground", render: (f) => dinero(f.costo_mercancia), total: tot((t) => dinero(t.costo_mercancia)) },
  { id: "envio", label: "Envío", ocultable: true, clase: "text-right tabular-nums whitespace-nowrap text-muted-foreground", render: (f) => dinero(f.costo_envio), total: tot((t) => dinero(t.costo_envio)) },
  {
    id: "margen",
    label: "Margen bruto",
    ocultable: false,
    clase: "text-right tabular-nums whitespace-nowrap",
    render: (f) => (
      <span className="inline-flex items-center justify-end gap-1.5">
        {f.cobertura_costo !== null && f.cobertura_costo < COBERTURA_MINIMA && (
          <>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
            <span className="sr-only">Costo incompleto: </span>
          </>
        )}
        {dinero(f.margen_bruto)}
      </span>
    ),
    total: tot((t) => dinero(t.margen_bruto)),
  },
  { id: "cobertura", label: "Con costo", ocultable: true, clase: "text-right tabular-nums text-muted-foreground", render: (f) => fraccion(f.cobertura_costo), total: tot((t) => fraccion(t.cobertura_costo)) },
];

/** Una fila por tienda del mes; pulsarla abre sus órdenes del mes. */
export function TablaTiendas({ filas, mes }: { filas: FilaTienda[]; mes: string }) {
  const router = useRouter();
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      abrirFila={{
        etiqueta: (f) => `Ver las órdenes de ${f.tienda}`,
        alAbrir: (f) => router.push(`/ventas-tiendas/ordenes?mes=${mes}&tienda=${f.id}`),
      }}
      ariaLabel="Ventas por tienda del mes"
      vacio="No hay órdenes en este mes."
    />
  );
}
