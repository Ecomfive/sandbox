import Link from "next/link";
import { Pastilla } from "@/components/panel/piezas-panel";
import { Pagina } from "@/components/ui/pagina";
import { formatearFecha } from "@/lib/formato";
import type { OrdenFinanzas, OrdenTienda } from "@/lib/tienda/orden-detalle";
import { estadoDesdeFinanzas, zonaDeEtiquetas } from "@/lib/tienda/ordenes-finanzas";
import { ESTADOS_PEDIDO } from "@/lib/tienda/resumen";
import { FichaOrdenTienda } from "./ficha-orden";

export type { ClienteOrdenFinanzas, LineaOrdenFinanzas, OrdenFinanzas } from "@/lib/tienda/orden-detalle";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Panama" });

/** El estado de la orden (como se muestra en Pedidos). */
export const estadoDeOrden = (o: OrdenFinanzas) => ESTADOS_PEDIDO.find((e) => e.id === estadoDesdeFinanzas(o.estado_entrega, o.etiquetas))!;

/** La línea de debajo del número (como en la app de Jorge): tienda, cuándo llegó, la zona y cuánto tardó en llegar de Shopify. */
export function subtituloOrden(o: OrdenFinanzas, tienda: string): string {
  const deShopify = o.origen === "shopify";
  const tardo = deShopify && o.creado_origen && o.creado_en ? Math.round((Date.parse(o.creado_en) - Date.parse(o.creado_origen)) / 1000) : null;
  return [
    tienda,
    `Llegó ${formatearFecha(o.fecha)}${o.creado_origen ? ` ${hora(o.creado_origen)}` : ""}`,
    zonaDeEtiquetas(o.etiquetas),
    tardo !== null && tardo >= 0 && tardo < 600 ? `de Shopify en ${tardo} s` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** La página de una orden de tienda (se llega por enlace directo); la lista abre la misma ficha en una ventana. */
export function DetalleOrdenFinanzas({ orden, codigoPais, puedeEscribir }: { orden: OrdenTienda; codigoPais: string; puedeEscribir: boolean }) {
  const estado = estadoDeOrden(orden.o);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <Link href="/tienda-pedidos" className="text-sm font-medium text-primario">
        ← Volver a Pedidos
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-xl font-semibold tracking-tight">{orden.o.numero ?? "Pedido"}</h1>
        <Pastilla tono={estado.tono}>{estado.etiqueta}</Pastilla>
        <span className="text-sm text-muted-foreground">{subtituloOrden(orden.o, orden.tienda)}</span>
      </div>
      {/* Alto fijo: la ficha se desplaza por dentro y el chat de la derecha queda quieto. */}
      <div className="flex h-[calc(100vh-11rem)] min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <FichaOrdenTienda orden={orden} codigoPais={codigoPais} puedeEscribir={puedeEscribir} />
      </div>
    </Pagina>
  );
}
