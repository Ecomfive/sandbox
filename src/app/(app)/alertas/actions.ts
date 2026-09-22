"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { upsertAlerta } from "@/lib/alertas/pendientes";
import { registrarAuditoria, registrarAuditoriaLote } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { ETIQUETA_ESTADO_ALERTA } from "./def-alertas";

export async function generarAlerta(formData: FormData) {
  await requireModuloEscritura("alertas");
  const pais_id = formData.get("pais_id") as string;
  const producto_id = formData.get("producto_id") as string;
  const cantidad = Number(formData.get("cantidad"));

  const supabase = createServiceClient();
  const id = await upsertAlerta(supabase, { pais_id, producto_id, pendiente: cantidad });
  if (id) {
    await registrarAuditoria({ accion: "generar_alerta", entidad: "alertas_inventario_no_retornado", entidadId: id, detalle: `cantidad=${cantidad}` });
  }

  revalidatePath("/alertas");
}

export async function actualizarEstadoAlerta(formData: FormData) {
  await requireModuloEscritura("alertas");
  const id = formData.get("id") as string;
  const estado = formData.get("estado") as "abierta" | "reclamada" | "resuelta";

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("alertas_inventario_no_retornado").select("estado").eq("id", id).single();
  const patch: Record<string, unknown> = { estado };
  if (estado === "reclamada") {
    patch.fecha_reclamo = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase.from("alertas_inventario_no_retornado").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  if (actual && actual.estado !== estado) {
    await registrarAuditoria({
      accion: "cambiar_estado_alerta",
      entidad: "alertas_inventario_no_retornado",
      entidadId: id,
      antes: { Estado: ETIQUETA_ESTADO_ALERTA[actual.estado as keyof typeof ETIQUETA_ESTADO_ALERTA] ?? actual.estado },
      despues: { Estado: ETIQUETA_ESTADO_ALERTA[estado] },
    });
  }

  revalidatePath("/alertas");
}

export async function actualizarEstadoAlertasMasivo(ids: string[], estado: "reclamada" | "resuelta") {
  await requireModuloEscritura("alertas");
  if (ids.length === 0) return;

  const supabase = createServiceClient();
  const { data: actuales } = await supabase.from("alertas_inventario_no_retornado").select("id, estado").in("id", ids);
  const patch: Record<string, unknown> = { estado };
  if (estado === "reclamada") {
    patch.fecha_reclamo = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase.from("alertas_inventario_no_retornado").update(patch).in("id", ids);
  if (error) throw new Error(error.message);

  await registrarAuditoriaLote(
    (actuales ?? [])
      .filter((a) => a.estado !== estado)
      .map((a) => ({
        accion: "cambiar_estado_alerta",
        entidad: "alertas_inventario_no_retornado",
        entidadId: a.id,
        antes: { Estado: ETIQUETA_ESTADO_ALERTA[a.estado as keyof typeof ETIQUETA_ESTADO_ALERTA] ?? a.estado },
        despues: { Estado: ETIQUETA_ESTADO_ALERTA[estado] },
      }))
  );

  revalidatePath("/alertas");
}

/** La actividad de una alerta (generada, cambios de estado...) para su ficha. Es una lectura, así que basta poder
 * abrir Alertas. Devuelve el error como valor, no lo lanza. */
export async function obtenerHistorialAlerta(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo("alertas");
  if (typeof id !== "string" || !/^[0-9a-fA-F-]{8,64}$/.test(id)) return { error: "Alerta no válida." };

  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "alertas_inventario_no_retornado")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };

  return {
    eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })),
  };
}
