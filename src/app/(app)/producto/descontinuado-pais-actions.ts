"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "producto";
const ES_ID = (v: string) => /^[0-9a-fA-F-]{36}$/.test(v);
const FALTA = "Falta correr la migración 0211 (descontinuado por país) en la base.";

export interface PaisDescontinuado {
  codigo: string;
  nombre: string;
  descontinuado: boolean;
}

/** Los países de la operación y si el producto está descontinuado en cada uno (ficha del producto, 31 oct 2026). */
export async function paisesDescontinuado(skuId: string): Promise<{ paises: PaisDescontinuado[] } | { error: string }> {
  await requireModulo(MODULO);
  if (!ES_ID(skuId)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const [paisesR, marcadosR] = await Promise.all([
    supabase.from("paises").select("id, codigo, nombre").order("nombre"),
    supabase.from("skus_descontinuado_pais").select("pais_id").eq("sku_id", skuId),
  ]);
  if (marcadosR.error) return { error: FALTA };
  const marcados = new Set((marcadosR.data ?? []).map((f) => f.pais_id as string));
  return {
    paises: ((paisesR.data ?? []) as { id: string; codigo: string; nombre: string }[]).map((p) => ({ codigo: p.codigo, nombre: p.nombre, descontinuado: marcados.has(p.id) })),
  };
}

/**
 * Descontinúa un producto en un país (o lo vuelve a activar allí con `si` en false): en ese país no se puede comprar y se marca en Gestión de
 * IDs Dropi y en el chat. Los demás países no cambian. Queda en la auditoría del producto.
 */
export async function cambiarDescontinuadoPais(skuId: string, codigo: string, si: boolean): Promise<{ ok: true } | { error: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!ES_ID(skuId)) return { error: "Producto no válido." };
  if (typeof codigo !== "string" || !/^[A-Z]{2}$/.test(codigo)) return { error: "País no válido." };
  if (!puedeVerPais(usuario.paisesPermitidos ?? null, codigo)) return { error: "No tienes acceso a ese país." };
  const supabase = createServiceClient();
  const [{ data: pais }, { data: sku }] = await Promise.all([
    supabase.from("paises").select("id, nombre").eq("codigo", codigo).maybeSingle(),
    supabase.from("skus_maestros").select("codigo").eq("id", skuId).maybeSingle(),
  ]);
  if (!pais) return { error: "Ese país no está en el sistema." };
  if (!sku) return { error: "El producto ya no existe." };
  const r = si
    ? await supabase.from("skus_descontinuado_pais").upsert({ sku_id: skuId, pais_id: pais.id, creado_por: usuario.nombre || usuario.email }, { onConflict: "sku_id,pais_id", ignoreDuplicates: true })
    : await supabase.from("skus_descontinuado_pais").delete().eq("sku_id", skuId).eq("pais_id", pais.id);
  if (r.error) return { error: /does not exist|schema cache/i.test(r.error.message) ? FALTA : "No se pudo guardar." };
  await registrarAuditoria({
    accion: "descontinuado_pais_producto",
    entidad: "skus_maestros",
    entidadId: skuId,
    antes: { [`Descontinuado en ${pais.nombre}`]: si ? "No" : "Sí" },
    despues: { [`Descontinuado en ${pais.nombre}`]: si ? "Sí" : "No" },
  });
  revalidatePath("/producto");
  revalidatePath("/publicaciones-dropi");
  return { ok: true };
}
