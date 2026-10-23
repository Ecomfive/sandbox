// Portal del proveedor › «Registro de pagos»: lo que la tabla necesita además de las cuotas (unidades, la llegada que anotó el proveedor
// y los pagos que anotó él). Solo servidor. Sin la migración 0141 la tabla sale igual, sin lo anotado.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { TipoCuota } from "./cuotas";
import type { PedidoPortal } from "./datos";
import { hoyPanama } from "./fechas";
import type { EstadoPagos } from "./pagos-servidor";
import { filasRegistro, type DatosRegistro, type FilaRegistro, type PagoAnotado } from "./registro-pagos";

export async function cargarRegistro(supabase: SupabaseClient, proveedorId: string, pedidos: PedidoPortal[], estado: EstadoPagos): Promise<FilaRegistro[]> {
  const historialIds = estado.envios.filter((e) => !e.pedidoId).map((e) => e.clave.slice(2));
  const [llegadas, anotados, historial] = await Promise.all([
    traerTodasConError<{ id: string; llegada_proveedor: string | null }>((d, h) =>
      supabase.from("proveedor_pedidos").select("id, llegada_proveedor").eq("proveedor_id", proveedorId).not("llegada_proveedor", "is", null).order("id").range(d, h),
    ),
    traerTodasConError<{ id: string; pedido_id: string; cuota: TipoCuota; monto: number; fecha: string }>((d, h) =>
      supabase.from("proveedor_pagos").select("id, pedido_id, cuota, monto, fecha").eq("proveedor_id", proveedorId).eq("origen", "proveedor").order("id").range(d, h),
    ),
    traerTodasConError<{ id: string; unidades: number | null }>((d, h) => supabase.from("proveedor_historial").select("id, unidades").eq("proveedor_id", proveedorId).order("id").range(d, h)),
  ]);
  const unidades: DatosRegistro["unidades"] = Object.fromEntries(pedidos.map((p) => [p.id, p.unidades]));
  const conHistorial = new Set(historialIds);
  for (const h of historial.data ?? []) if (conHistorial.has(h.id)) unidades[`h:${h.id}`] = h.unidades === null ? null : Number(h.unidades);
  const porPedido: Record<string, PagoAnotado[]> = {};
  for (const a of anotados.error ? [] : (anotados.data ?? [])) (porPedido[a.pedido_id] ??= []).push({ id: a.id, cuota: a.cuota, monto: Number(a.monto), fecha: a.fecha });
  return filasRegistro(
    estado.envios,
    {
      unidades,
      llegadaProveedor: Object.fromEntries((llegadas.error ? [] : (llegadas.data ?? [])).map((l) => [l.id, l.llegada_proveedor as string])),
      anotados: porPedido,
    },
    hoyPanama(),
  );
}
