"use server";

import { requireModulo } from "@/lib/auth";
import { cuotasDe, estadoCuota, type EstadoCuota, type Pago, type TipoCuota } from "@/lib/proveedor/cuotas";
import { hoyPanama } from "@/lib/proveedor/fechas";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoACompras } from "./acceso-compras";
import { campoOculto, restriccionesDe } from "./permisos-compras";

export interface PagosProveedorCompra {
  proveedor: string;
  cuotas: { cuota: TipoCuota; monto: number; vence: string | null; pagado: number; fechaPago: string | null; estado: EstadoCuota; avisado: boolean }[];
}

/**
 * «Pagos a Shen Zhen» en la ficha de una compra (fase 4 del portal del proveedor): anticipo y saldo con lo pagado, que vive en el portal y
 * no en los campos de pago de la compra. Null si la compra no es de un proveedor con portal o todavía no tiene envío.
 */
export async function obtenerPagosProveedorCompra(compraId: string): Promise<PagosProveedorCompra | null> {
  const usuario = await requireModulo("compras");
  if (!esUuid(compraId)) return null;
  // Quien no ve los montos de Compras tampoco ve esto.
  if (campoOculto(restriccionesDe(usuario.afinado.compras), "monto")) return null;
  // Solo de una compra que la persona puede ver (su país y su alcance; auditoría del 27 oct 2026).
  if (await sinAccesoACompras([compraId], usuario)) return null;
  const supabase = createServiceClient();
  const { data: p } = await supabase
    .from("proveedor_pedidos")
    .select("id, visible, monto_total, fecha_envio, fecha_llegada, anticipo_monto, proveedores(nombre, dias_anticipo, porcentaje_anticipo)")
    .eq("compra_id", compraId)
    .maybeSingle();
  if (!p || !p.visible || !p.fecha_envio) return null;
  const prov = p.proveedores as unknown as { nombre: string; dias_anticipo: number; porcentaje_anticipo: number } | null;
  if (!prov) return null;
  const [pagos, historial, avisadas] = await Promise.all([
    supabase.from("proveedor_pagos").select("cuota, monto, fecha").eq("pedido_id", p.id),
    supabase.from("proveedor_historial").select("fecha_llegada, monto_total, anticipo_monto").eq("pedido_id", p.id).maybeSingle(),
    supabase.from("proveedor_aviso_cuotas").select("cuota, proveedor_avisos_pago!inner(estado)").eq("pedido_id", p.id).eq("proveedor_avisos_pago.estado", "avisado"),
  ]);
  if (pagos.error) return null;
  const de = (c: TipoCuota): Pago[] => (pagos.data ?? []).filter((x) => x.cuota === c).map((x) => ({ monto: Number(x.monto), fecha: x.fecha as string }));
  const hoy = hoyPanama();
  const enAviso = new Set((avisadas.data ?? []).map((x) => x.cuota as string));
  const cuotas = cuotasDe(
    {
      // Si vino en la hoja de Shen Zhen, manda el total y el anticipo que él facturó.
      montoTotal: historial.data ? Number(historial.data.monto_total) : p.monto_total == null ? null : Number(p.monto_total),
      fechaEnvio: p.fecha_envio as string,
      fechaLlegada: (p.fecha_llegada as string | null) ?? (historial.data?.fecha_llegada as string | null) ?? null,
      anticipoMonto: historial.data ? Number(historial.data.anticipo_monto) : p.anticipo_monto == null ? null : Number(p.anticipo_monto),
      pagosAnticipo: de("anticipo"),
      pagosSaldo: de("saldo"),
    },
    Number(prov.porcentaje_anticipo),
    Number(prov.dias_anticipo),
  );
  if (!cuotas.length) return null;
  return {
    proveedor: prov.nombre,
    cuotas: cuotas.map((c) => ({ cuota: c.cuota, monto: c.monto, vence: c.vence, pagado: c.pagado, fechaPago: c.fechaPago, estado: estadoCuota(c, hoy), avisado: enAviso.has(c.cuota) && c.pendiente > 0 })),
  };
}
