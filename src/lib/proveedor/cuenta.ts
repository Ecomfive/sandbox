// Portal del proveedor: saber si una sesión es de una cuenta del portal (`proveedor_usuarios`, migración 0124). Esas cuentas no
// tienen fila en `perfiles`, así que el sistema no las reconoce; aquí solo se mira a dónde mandarlas. Solo servidor.

import { createServiceClient } from "@/lib/supabase/server";

export interface CuentaProveedor {
  cuentaId: string;
  usuarioId: string;
  nombre: string;
  proveedor: { id: string; nombre: string; notificarA: string | null; diasAnticipo: number; porcentajeAnticipo: number };
}

/** La cuenta activa del portal de este usuario, con su proveedor activo; null si no es una cuenta de proveedor. */
export async function cuentaDeProveedor(usuarioId: string): Promise<CuentaProveedor | null> {
  const { data, error } = await createServiceClient()
    .from("proveedor_usuarios")
    .select("id, usuario_id, nombre, activo, proveedores(id, nombre, activo, notificar_a, dias_anticipo, porcentaje_anticipo)")
    .eq("usuario_id", usuarioId)
    .maybeSingle();
  if (error || !data || !data.activo) return null;
  const p = data.proveedores as unknown as { id: string; nombre: string; activo: boolean; notificar_a: string | null; dias_anticipo: number; porcentaje_anticipo: number } | null;
  if (!p || !p.activo) return null;
  return {
    cuentaId: data.id as string,
    usuarioId: data.usuario_id as string,
    nombre: data.nombre as string,
    proveedor: { id: p.id, nombre: p.nombre, notificarA: p.notificar_a, diasAnticipo: Number(p.dias_anticipo), porcentajeAnticipo: Number(p.porcentaje_anticipo) },
  };
}

/** La entrada del portal del proveedor. */
export const RUTA_PORTAL_PROVEEDOR = "/proveedor";
