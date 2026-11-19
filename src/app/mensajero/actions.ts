"use server";

import { resolverMensajero } from "@/lib/ventas/cargar-mensajero";
import { guardarComprobante, permisoDeSubida } from "@/lib/ventas/comprobantes-servidor";
import { accionesDelMensajero, cambioDeMensajero, tokenPlausible, type FaseMensajero } from "@/lib/ventas/mensajero";
import { moverFase } from "@/lib/ventas/mover-fase";
import { createServiceClient } from "@/lib/supabase/server";
import { ipDeLaPeticion, limitar } from "@/lib/seguridad/limite";
import { claveLimite, DEMASIADAS_ACCIONES, LIMITES } from "@/lib/seguridad/limite-reglas";

// Acciones de la web app del mensajero. No hay sesión: la puerta es su código secreto, y cada acción vuelve a comprobar que la orden
// es suya y está en ruta (no se confía en lo que mande el navegador).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Resultado = { error: string } | { ok: true; aviso?: string };
const NO_VALE = "Este enlace ya no vale. Pide uno nuevo.";

async function ordenDelMensajero(token: string, ordenId: string) {
  // Tope de acciones por enlace e IP (seguridad · 19 nov 2026). Un código sin forma de código no llega a la base ni se cuenta.
  if (tokenPlausible(token) && !(await limitar(claveLimite("mensajero", token, (await ipDeLaPeticion()) ?? "sin-ip"), LIMITES.mensajero))) {
    return { error: DEMASIADAS_ACCIONES } as const;
  }
  const sesion = await resolverMensajero(token);
  if (!sesion) return { error: NO_VALE } as const;
  if (!UUID.test(ordenId)) return { error: "Orden inválida." } as const;
  const { data: o } = await createServiceClient().from("ven_ordenes").select("id, fase, repartidor_id").eq("id", ordenId).maybeSingle();
  if (!o || o.repartidor_id !== sesion.repartidorId) return { error: "Esa orden no es tuya." } as const;
  return { sesion, orden: o as { id: string; fase: string | null; repartidor_id: string | null } };
}

async function mover(token: string, ordenId: string, fase: FaseMensajero, datos: Record<string, unknown>): Promise<Resultado> {
  const r = await ordenDelMensajero(token, ordenId);
  if (r.error !== undefined) return { error: r.error };
  if (!accionesDelMensajero(r.orden, r.sesion.repartidorId).includes(fase)) return { error: "Esta orden ya no está en ruta." };
  return await moverFase(ordenId, fase, cambioDeMensajero(fase, datos ?? {}), `Mensajero ${r.sesion.nombre}`);
}

export async function marcarEntregada(token: string, ordenId: string, datos: Record<string, unknown>): Promise<Resultado> {
  return mover(token, ordenId, "entregada", datos);
}

export async function marcarFallida(token: string, ordenId: string, datos: Record<string, unknown>): Promise<Resultado> {
  return mover(token, ordenId, "fallida", datos);
}

export async function prepararSubidaMensajero(token: string, ordenId: string, nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  const r = await ordenDelMensajero(token, ordenId);
  if (r.error !== undefined) return { error: r.error };
  // Las fotos de prueba, como los cambios de fase, solo mientras la orden está en ruta (una orden ya cerrada no se toca desde el enlace).
  if (!accionesDelMensajero(r.orden, r.sesion.repartidorId).length) return { error: "Esta orden ya no está en ruta." };
  return await permisoDeSubida(ordenId, nombreArchivo);
}

export async function guardarComprobanteMensajero(token: string, ordenId: string, ruta: string, tipo: string, nota?: string | null): Promise<Resultado> {
  const r = await ordenDelMensajero(token, ordenId);
  if (r.error !== undefined) return { error: r.error };
  if (!accionesDelMensajero(r.orden, r.sesion.repartidorId).length) return { error: "Esta orden ya no está en ruta." };
  return await guardarComprobante(ordenId, ruta, tipo, nota, `Mensajero ${r.sesion.nombre}`);
}
