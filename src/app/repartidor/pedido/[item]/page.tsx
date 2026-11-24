import { notFound } from "next/navigation";
import { FichaPedidoRepartidor } from "@/components/repartidor/ficha-pedido";
import { cargarRuta } from "@/lib/despacho/datos-repartidor";
import { rangoDespacho } from "@/lib/despacho/datos";
import { fechasRapidas, nombreRepartidor } from "@/lib/despacho/panel-repartidor";
import { requireRepartidor } from "@/lib/despacho/sesion-repartidor";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Panel del repartidor › ficha del pedido (pantalla 2 del prototipo aprobado), con «Entregado», «Pospuesto» y «Fallido». Solo un pedido de su ruta. */
export default async function PaginaPedidoRepartidor({ params }: { params: Promise<{ item: string }> }) {
  const cuenta = await requireRepartidor();
  const { item } = await params;
  if (!/^([0-9]{1,20}|S[0-9a-f]{32})$/.test(item)) notFound();
  const supabase = createServiceClient();
  const { data: fila } = await supabase.from("mon_despachos").select("courier, fecha_despacho, clase, archivado_en").eq("item_id", item).maybeSingle();
  if (!fila || fila.clase !== "ciudad" || fila.archivado_en || !fila.fecha_despacho || nombreRepartidor(fila.courier as string | null) !== nombreRepartidor(cuenta.courier)) notFound();
  const ruta = await cargarRuta(supabase, cuenta, fila.fecha_despacho as string);
  const pedido = ruta.pedidos.find((p) => p.itemId === item);
  if (!pedido) notFound();
  return <FichaPedidoRepartidor pedido={pedido} fechas={fechasRapidas(rangoDespacho(1).hoy)} />;
}
