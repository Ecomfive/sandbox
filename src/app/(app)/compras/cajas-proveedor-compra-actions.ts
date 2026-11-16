"use server";

import { requireModulo } from "@/lib/auth";
import { direccionesDeEtiquetas, type EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoACompras } from "./acceso-compras";

export interface CajasProveedorCompra {
  proveedor: string;
  cajas: number | null;
  etiquetas: EtiquetaPedido[];
}

/**
 * Las cajas («Cartons») y la etiqueta de las cajas que anotó el proveedor al marcar el envío (16 nov 2026, pedido de Hernán), para la ficha de una compra. Solo lectura. Null si la
 * compra no es de un proveedor con portal o todavía no anotó nada; sin la migración 0299 tampoco sale.
 */
export async function obtenerCajasProveedorCompra(compraId: string): Promise<CajasProveedorCompra | null> {
  const usuario = await requireModulo("compras");
  if (!esUuid(compraId)) return null;
  // Solo de una compra que la persona puede ver (su país y su alcance).
  if (await sinAccesoACompras([compraId], usuario)) return null;
  const supabase = createServiceClient();
  const { data: p, error } = await supabase.from("proveedor_pedidos").select("visible, cajas, etiquetas_rutas, proveedores(nombre)").eq("compra_id", compraId).maybeSingle();
  if (error || !p || !p.visible) return null;
  const rutas = ((p.etiquetas_rutas as string[] | null) ?? []).map(String);
  if (p.cajas == null && rutas.length === 0) return null;
  const prov = p.proveedores as unknown as { nombre: string } | null;
  return { proveedor: prov?.nombre ?? "Proveedor", cajas: p.cajas == null ? null : Number(p.cajas), etiquetas: await direccionesDeEtiquetas(supabase, rutas) };
}
