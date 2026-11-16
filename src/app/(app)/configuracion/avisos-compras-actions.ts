"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { AVISOS_DE_COMPRAS } from "@/lib/compras/llegadas-avisos";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Marca o desmarca a una persona para recibir un aviso de Compras (Llegada a Puerto → Logística, En Bodega → Pagos; Configuración › «Avisos de Compras», migración 0304, 16 nov 2026).
 * Devuelve el error como valor.
 */
export async function cambiarDestinatarioAviso(evento: string, perfilId: string, activo: boolean): Promise<{ error?: string }> {
  await requireModuloEscritura("configuracion");
  const aviso = AVISOS_DE_COMPRAS.find((a) => a.evento === evento);
  if (!aviso || !esUuid(perfilId) || typeof activo !== "boolean") return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: persona } = await supabase.from("perfiles").select("nombre, email").eq("id", perfilId).maybeSingle();
  if (!persona) return { error: "No se encontró a esa persona." };
  const { error } = activo
    ? await supabase.from("compras_avisos_destinatarios").upsert({ evento, perfil_id: perfilId }, { onConflict: "evento,perfil_id", ignoreDuplicates: true })
    : await supabase.from("compras_avisos_destinatarios").delete().eq("evento", evento).eq("perfil_id", perfilId);
  if (error) return { error: error.code === "42P01" ? "Falta correr la migración 0304 en Supabase." : error.message };
  await registrarAuditoria({
    accion: "aviso_compras_destinatario",
    entidad: "compras_avisos_destinatarios",
    entidadId: perfilId,
    detalle: `${activo ? "Agregó a" : "Quitó a"} ${persona.nombre || persona.email} del aviso «${aviso.titulo}»`,
  });
  revalidatePath("/configuracion");
  return {};
}
