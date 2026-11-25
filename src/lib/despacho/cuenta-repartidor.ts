// Panel del repartidor (24 nov 2026, migración 0362): saber si una sesión es de una cuenta de repartidor (`despacho_repartidores`). Esas cuentas no
// tienen fila en `perfiles` (como las del portal del proveedor), así que el sistema no las reconoce: aquí solo se mira a dónde mandarlas. Solo servidor.

import { createServiceClient } from "@/lib/supabase/server";

export interface CuentaRepartidor {
  id: string;
  usuarioId: string;
  /** Su nombre de repartidor en Envíos Delivery («JULY CALLE»): solo ve esas filas. */
  courier: string;
  nombre: string;
}

/** La cuenta activa de repartidor de este usuario; null si no es una (o sin la migración 0362). */
export async function cuentaDeRepartidor(usuarioId: string): Promise<CuentaRepartidor | null> {
  const { data, error } = await createServiceClient().from("despacho_repartidores").select("id, usuario_id, courier, nombre, activo").eq("usuario_id", usuarioId).maybeSingle();
  if (error || !data || !data.activo) return null;
  return { id: data.id as string, usuarioId: data.usuario_id as string, courier: data.courier as string, nombre: data.nombre as string };
}

/** La entrada del panel del repartidor. */
export const RUTA_PANEL_REPARTIDOR = "/repartidor";
