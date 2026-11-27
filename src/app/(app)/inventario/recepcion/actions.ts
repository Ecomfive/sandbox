"use server";

import { revalidatePath } from "next/cache";
import { hoyPanama } from "@/lib/af4/fecha";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { alcanceInventario, SOLO_A_CARGO } from "@/lib/permisos/inventario";
import { puedeVerBodega, puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { reglaDeRecepcion, revisarRecepcion } from "@/lib/wms/recepcion";

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;

/** Recibe productos de una compra: cuenta contra lo pedido y entra al inventario en un solo paso (`wms_recibir_compra`, migración 0241). Devuelve el error como valor. */
export async function recibirCompra(compraId: string, bodegaId: string, items: unknown): Promise<{ error?: string; lineas?: number; unidades?: number; faltan?: number }> {
  const usuario = await requireModuloEscritura("inventario");
  // La mercancía nueva entra por aquí: la recibe la persona a cargo del inventario o un administrador (26 nov 2026).
  if (alcanceInventario(usuario) !== "total") return { error: SOLO_A_CARGO };
  if (!ES_ID.test(compraId)) return { error: "Compra no válida." };
  if (!ES_ID.test(bodegaId)) return { error: "Elige la bodega." };
  const revisado = revisarRecepcion(items);
  if ("error" in revisado) return { error: revisado.error };
  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, bodegaId))) return { error: "No tienes acceso al país de esa bodega." };
  const { data, error } = await supabase.rpc("wms_recibir_compra", { p_compra: compraId, p_bodega: bodegaId, p_items: revisado.items, p_usuario: usuario.id });
  if (error) {
    if (error.code === "PGRST202" || /wms_recibir_compra/.test(error.message)) return { error: "Falta correr la migración 0241 en la base." };
    return { error: error.message.length < 200 ? error.message : "No se pudo recibir la compra." };
  }
  const r = (data ?? {}) as { lineas?: number; unidades?: number; faltan?: number };
  const { data: compra } = await supabase.from("wms_compras").select("codigo").eq("id", compraId).maybeSingle();
  await registrarAuditoria({
    accion: "recepcion_compra",
    entidad: "wms_compras",
    entidadId: compraId,
    detalle: `${compra?.codigo ?? "Compra"}: ${r.lineas ?? 0} productos, ${r.unidades ?? 0} u. recibidas${r.faltan ? `, faltaron ${r.faltan} u.` : ""}`,
  });
  revalidatePath("/inventario");
  revalidatePath("/inventario/recepcion");
  revalidatePath("/compras", "layout");
  return { lineas: r.lineas ?? 0, unidades: r.unidades ?? 0, faltan: r.faltan ?? 0 };
}

const YA_CONTADA = "Ya estaba en el inventario: no se sumó";

/**
 * Marca productos de una compra como recibidos **sin sumarlos** al inventario, porque ya se habían contado a mano (26 nov 2026: al empezar la recepción en Panamá había compras en puerto
 * ya cargadas con un levantamiento; recibirlas las contaría dos veces). Anota la cantidad escrita y lo deja en la Actividad. Devuelve el error como valor.
 */
export async function marcarYaContadas(compraId: string, items: unknown): Promise<{ error?: string; lineas?: number }> {
  const usuario = await requireModuloEscritura("inventario");
  if (alcanceInventario(usuario) !== "total") return { error: SOLO_A_CARGO };
  if (!ES_ID.test(compraId)) return { error: "Compra no válida." };
  const revisado = revisarRecepcion(items);
  if ("error" in revisado) return { error: revisado.error };
  const supabase = createServiceClient();
  const { data: compra } = await supabase.from("wms_compras").select("codigo, pais_id, etapa, anulada_en, paises(codigo)").eq("id", compraId).maybeSingle();
  if (!compra) return { error: "La compra no existe." };
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, compra.pais_id as string | null))) return { error: "No tienes acceso al país de esa compra." };
  const p = compra.paises as { codigo: string } | { codigo: string }[] | null;
  if (!reglaDeRecepcion((Array.isArray(p) ? p[0] : p)?.codigo)?.admiteYaContadas) return { error: "Esto no aplica en el país de esa compra." };
  if (compra.anulada_en || compra.etapa === "descartado") return { error: "Esa compra está anulada o descartada." };

  const { data: lineas, error: eLineas } = await supabase.from("wms_compra_items").select("id, notas").eq("compra_id", compraId).in("id", revisado.items.map((i) => i.item)).is("cantidad_recibida", null);
  if (eLineas) return { error: "No se pudo leer la compra." };
  const pendientes = new Map((lineas ?? []).map((l) => [l.id as string, (l.notas as string | null) ?? ""]));
  let hechas = 0;
  let unidades = 0;
  for (const i of revisado.items) {
    if (!pendientes.has(i.item)) continue;
    // Solo si sigue sin recibir: dos clics no la marcan dos veces.
    const { data, error } = await supabase
      .from("wms_compra_items")
      .update({ cantidad_recibida: i.cantidad, fecha_recepcion: hoyPanama(), notas: [pendientes.get(i.item), YA_CONTADA, i.nota].filter(Boolean).join(" · "), actualizado_en: new Date().toISOString() })
      .eq("id", i.item)
      .eq("compra_id", compraId)
      .is("cantidad_recibida", null)
      .select("id");
    if (error) break;
    if (data?.length) {
      hechas++;
      unidades += i.cantidad;
    }
  }
  if (!hechas) return { error: "No se marcó nada: esos productos ya estaban recibidos o no se pudo guardar." };
  await registrarAuditoria({
    accion: "recepcion_ya_contada",
    entidad: "wms_compras",
    entidadId: compraId,
    detalle: `${compra.codigo ?? "Compra"}: ${hechas} productos (${unidades} u.) marcados como recibidos sin sumar al inventario, porque ya estaban contados`,
  });
  revalidatePath("/inventario/recepcion");
  revalidatePath("/compras", "layout");
  return { lineas: hechas };
}
