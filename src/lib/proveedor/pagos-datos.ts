// Portal del proveedor: la lectura de los pagos (migración 0127): lo pagado por pedido, el historial de las hojas de Chin y los avisos
// de pago. Solo servidor, con el cliente de servicio; quien llama ya comprobó el acceso.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { TipoCuota } from "./cuotas";
import type { DatosPagos, HistorialSuelto, PagosDe } from "./resumen-pagos";

export interface AvisoPago {
  id: string;
  fecha: string;
  monto: number;
  referencia: string | null;
  estado: "avisado" | "confirmado";
  avisadoPor: string | null;
  confirmadoEn: string | null;
  nota: string | null;
  comprobanteRuta: string | null;
  cuotas: { pedidoId: string; cuota: TipoCuota; monto: number; producto: string }[];
}

type Fila = Record<string, unknown>;

export async function cargarPagosProveedor(supabase: SupabaseClient, proveedorId: string): Promise<{ datos: DatosPagos; avisos: AvisoPago[] } | { error: string }> {
  const [pagos, historial, avisos] = await Promise.all([
    traerTodasConError<Fila>((d, h) => supabase.from("proveedor_pagos").select("pedido_id, historial_id, cuota, monto, fecha").eq("proveedor_id", proveedorId).order("id").range(d, h)),
    traerTodasConError<Fila>((d, h) => supabase.from("proveedor_historial").select("id, pedido_id, producto, pais_codigo, monto_total, anticipo_monto, fecha_envio, fecha_llegada").eq("proveedor_id", proveedorId).order("id").range(d, h)),
    supabase
      .from("proveedor_avisos_pago")
      .select("id, fecha, monto, referencia, estado, avisado_por_nombre, confirmado_en, nota, comprobante_ruta, proveedor_aviso_cuotas(pedido_id, cuota, monto, proveedor_pedidos(producto))")
      .eq("proveedor_id", proveedorId)
      .order("creado_en", { ascending: false })
      .limit(100),
  ]);
  if (pagos.error || historial.error || avisos.error) return { error: "Falta correr en Supabase la migración 0127 (pagos del proveedor)." };

  const pagosPorPedido: Record<string, PagosDe> = {};
  const pagosPorHistorial: Record<string, PagosDe> = {};
  for (const p of pagos.data ?? []) {
    const destino = p.pedido_id ? (pagosPorPedido[p.pedido_id as string] ??= { anticipo: [], saldo: [] }) : (pagosPorHistorial[p.historial_id as string] ??= { anticipo: [], saldo: [] });
    destino[p.cuota as TipoCuota].push({ monto: Number(p.monto), fecha: p.fecha as string });
  }
  const llegadaHoja: Record<string, string> = {};
  const conHoja: string[] = [];
  const historialSuelto: HistorialSuelto[] = [];
  let ultimaHoja: string | null = null;
  for (const h of historial.data ?? []) {
    const envio = h.fecha_envio as string;
    if (!ultimaHoja || envio > ultimaHoja) ultimaHoja = envio;
    if (h.pedido_id) {
      conHoja.push(h.pedido_id as string);
      if (h.fecha_llegada) llegadaHoja[h.pedido_id as string] = h.fecha_llegada as string;
      continue;
    }
    historialSuelto.push({
      id: h.id as string,
      producto: h.producto as string,
      paisCodigo: (h.pais_codigo as string | null) ?? null,
      montoTotal: Number(h.monto_total),
      anticipoMonto: Number(h.anticipo_monto),
      fechaEnvio: envio,
      fechaLlegada: (h.fecha_llegada as string | null) ?? null,
      pagos: pagosPorHistorial[h.id as string] ?? { anticipo: [], saldo: [] },
    });
  }

  const listaAvisos: AvisoPago[] = (avisos.data ?? []).map((a) => ({
    id: a.id as string,
    fecha: a.fecha as string,
    monto: Number(a.monto),
    referencia: (a.referencia as string | null) ?? null,
    estado: a.estado as AvisoPago["estado"],
    avisadoPor: (a.avisado_por_nombre as string | null) ?? null,
    confirmadoEn: (a.confirmado_en as string | null) ?? null,
    nota: (a.nota as string | null) ?? null,
    comprobanteRuta: (a.comprobante_ruta as string | null) ?? null,
    cuotas: ((a.proveedor_aviso_cuotas as Fila[] | null) ?? []).map((c) => ({
      pedidoId: c.pedido_id as string,
      cuota: c.cuota as TipoCuota,
      monto: Number(c.monto),
      producto: ((c.proveedor_pedidos as { producto: string } | null)?.producto as string) ?? "—",
    })),
  }));
  return { datos: { pagosPorPedido, llegadaHoja, conHoja, historialSuelto, ultimaHoja }, avisos: listaAvisos };
}
