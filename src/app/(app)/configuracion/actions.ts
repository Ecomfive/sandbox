"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearPlataforma(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("configuracion");
  const pais_id = formData.get("pais_id") as string;
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre de la plataforma es obligatorio." };

  const supabase = createServiceClient();

  const { data: existente, error: errorBuscar } = await supabase
    .from("plataformas")
    .select("id")
    .eq("nombre", nombre)
    .maybeSingle();
  if (errorBuscar) return { error: errorBuscar.message };

  let plataforma_id = existente?.id as string | undefined;
  if (!plataforma_id) {
    const { data: nueva, error: errorCrear } = await supabase
      .from("plataformas")
      .insert({ nombre })
      .select("id")
      .single();
    if (errorCrear || !nueva) return { error: errorCrear?.message ?? "No se pudo crear la plataforma." };
    plataforma_id = nueva.id;
  }

  const { error } = await supabase
    .from("pais_plataformas")
    .upsert(
      { pais_id, plataforma_id, disponible_para_retiro: true },
      { onConflict: "pais_id,plataforma_id" }
    );
  if (error) return { error: error.message };

  await registrarAuditoria({
    accion: "crear_plataforma",
    entidad: "plataformas",
    entidadId: plataforma_id,
    detalle: `nombre=${nombre}`,
  });

  revalidatePath("/configuracion");
  revalidatePath("/retiros");
  return {};
}

export async function alternarDisponiblePlataforma(formData: FormData) {
  await requireModuloEscritura("configuracion");
  const id = formData.get("id") as string;
  const disponible = formData.get("disponible") === "true";

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("pais_plataformas")
    .update({ disponible_para_retiro: disponible })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await registrarAuditoria({
    accion: "configurar_plataforma_retiro",
    entidad: "pais_plataformas",
    entidadId: id,
    antes: { "Disponible para crear": disponible ? "Oculta" : "Disponible" },
    despues: { "Disponible para crear": disponible ? "Disponible" : "Oculta" },
  });

  revalidatePath("/configuracion");
  revalidatePath("/retiros");
}

/**
 * Los umbrales del «Tipo de cliente» del CRM en un país (migración 0196): VIP desde `vipDesde` y BLACK desde `blackDesde` pedidos al mes (promedio de
 * los últimos 3 meses). Al guardar se recalcula el tipo de todos los clientes. Devuelve cuántos cambiaron de tipo.
 */
export async function guardarUmbralesTipoCliente(paisId: string, vipDesde: number, blackDesde: number): Promise<{ cambiados: number } | { error: string }> {
  await requireModuloEscritura("configuracion");
  if (!/^[0-9a-f-]{36}$/i.test(String(paisId))) return { error: "País no válido." };
  const vip = Math.round(Number(vipDesde));
  const black = Math.round(Number(blackDesde));
  if (!Number.isFinite(vip) || vip < 1 || !Number.isFinite(black) || black < 1) return { error: "Escribe cantidades de pedidos mayores que cero." };
  if (black <= vip) return { error: "BLACK tiene que empezar en más pedidos que VIP." };
  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("crm_tipo_cliente_umbrales").select("vip_desde, black_desde").eq("pais_id", paisId).maybeSingle();
  const { error } = await supabase
    .from("crm_tipo_cliente_umbrales")
    .upsert({ pais_id: paisId, vip_desde: vip, black_desde: black, actualizado_en: new Date().toISOString() }, { onConflict: "pais_id" });
  if (error) return { error: error.code === "42P01" ? "Falta correr en Supabase la migración 0196." : "No se pudieron guardar los umbrales." };
  await registrarAuditoria({
    accion: "umbrales_tipo_cliente",
    entidad: "crm_tipo_cliente_umbrales",
    entidadId: paisId,
    antes: { "VIP desde": String(antes?.vip_desde ?? 500), "BLACK desde": String(antes?.black_desde ?? 1000) },
    despues: { "VIP desde": String(vip), "BLACK desde": String(black) },
  });
  const { data: cambiados } = await supabase.rpc("crm_recalcular_tipo_cliente");
  revalidatePath("/configuracion");
  revalidatePath("/crm-dropshippers", "layout");
  return { cambiados: Number(cambiados ?? 0) };
}
