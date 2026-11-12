"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { conectarTienda, revisarTienda } from "@/lib/tienda/conectar-shopify";

// Gestión de tienda › Tiendas (12 nov 2026): conectar una tienda de Shopify en vivo y revisarla a mano. Solo un administrador: conectar pide a Shopify
// los avisos de pedidos de la tienda. Nada cambia en Shopify (la app es de solo lectura; si tuviera permisos de escritura, no se conecta).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function soloAdmin() {
  const usuario = await requireModuloEscritura("tienda-tiendas");
  return esAdministrador(usuario) ? usuario : null;
}

export async function conectarTiendaShopify(tiendaId: string): Promise<{ error?: string; resumen?: string }> {
  if (!(await soloAdmin())) return { error: "Solo un administrador conecta una tienda." };
  if (!UUID.test(tiendaId)) return { error: "Tienda no válida." };
  const supabase = createServiceClient();
  try {
    const r = await conectarTienda(supabase, tiendaId);
    await registrarAuditoria({
      accion: "conectar_tienda_shopify",
      entidad: "tiendas",
      entidadId: tiendaId,
      detalle: `${r.tienda}: ${r.avisos.creados} avisos de pedidos pedidos a Shopify (${r.avisos.yaEstaban} ya estaban) · ${r.traidos}`,
    });
    revalidatePath("/tienda-tiendas");
    revalidatePath("/tienda-pedidos");
    const avisos = r.avisos.creados ? `se pidieron ${r.avisos.creados} avisos a Shopify` : "los avisos ya estaban";
    return { resumen: `${r.tienda} conectada: ${avisos}. ${r.traidos}.${r.completa ? "" : " Falta traer una parte: pulsa «Revisar ahora»."}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo conectar la tienda." };
  }
}

export async function revisarTiendaShopify(tiendaId: string): Promise<{ error?: string; resumen?: string }> {
  if (!(await soloAdmin())) return { error: "Solo un administrador revisa la conexión." };
  if (!UUID.test(tiendaId)) return { error: "Tienda no válida." };
  const supabase = createServiceClient();
  const { data: t } = await supabase.from("tiendas").select("id, nombre, estado").eq("id", tiendaId).maybeSingle();
  if (!t || t.estado !== "conectada") return { error: "La tienda no está conectada." };
  try {
    const r = await revisarTienda(supabase, { id: t.id as string, nombre: t.nombre as string });
    revalidatePath("/tienda-tiendas");
    revalidatePath("/tienda-pedidos");
    return { resumen: `${r.texto}.${r.completa ? "" : " Falta una parte: vuelve a pulsar «Revisar ahora»."}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo revisar la tienda." };
  }
}
