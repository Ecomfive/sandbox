"use server";

import { requireModulo } from "@/lib/auth";
import { puedeVerPais } from "@/lib/paises-permitidos";
import type { LineaHistorial } from "@/lib/proveedor/historial";
import { cargarHistorialPedido } from "@/lib/proveedor/historial-datos";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { campoOculto, restriccionesDe } from "../permisos-compras";

/** Lo que trae un monto: no se muestra a quien no ve los montos de Compras. */
const CON_MONTO = new Set<LineaHistorial["tipo"]>(["cotizacion", "monto", "cantidad", "pagos"]);

/**
 * Tablero de Shen Zhen: el historial de un pedido, con el nombre de quien hizo cada cambio. Basta poder abrir Compras; solo pedidos de
 * los países que la persona ve. Devuelve el error como valor.
 */
export async function historialPedidoEcomfive(pedidoId: string): Promise<{ lineas: LineaHistorial[]; traducciones: Record<string, string> } | { error: string }> {
  const usuario = await requireModulo("compras");
  if (!esUuid(pedidoId)) return { error: "Pedido no válido." };
  const supabase = createServiceClient();
  const { data: proveedor } = await supabase.from("proveedores").select("id").eq("activo", true).order("creado_en").limit(1).maybeSingle();
  if (!proveedor) return { error: "No hay proveedor activo." };
  const r = await cargarHistorialPedido(supabase, proveedor.id as string, pedidoId, true);
  if ("error" in r) return r;
  if (!puedeVerPais(usuario.paisesPermitidos, r.paisCodigo)) return { error: "Ese pedido ya no está en el portal." };
  const sinMontos = campoOculto(restriccionesDe(usuario.afinado.compras), "monto");
  return { lineas: sinMontos ? r.lineas.filter((l) => !CON_MONTO.has(l.tipo)) : r.lineas, traducciones: {} };
}
