"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { leerMes } from "@/lib/finanzas/flujo";
import { leerPorcentaje } from "@/lib/finanzas/utilidades";

const MODULO = "utilidades";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUEVO = "nuevo";

/**
 * Pone el porcentaje de un socio en una tienda desde un mes. No pisa la historia: es una fila nueva con su fecha (si ya
 * había una de ese socio, esa tienda y ese mismo mes, se corrige esa). Con «Nuevo socio» se crea el socio.
 */
export async function guardarParticipacion(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const socioElegido = String(formData.get("socio_id") ?? "");
    const nombreNuevo = String(formData.get("socio_nuevo") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const unidad = String(formData.get("unidad_id") ?? "");
    const porcentaje = leerPorcentaje(formData.get("porcentaje"));
    const desde = leerMes(String(formData.get("desde") ?? ""));
    if (!UUID.test(unidad)) return { error: "Elige la tienda." };
    if (porcentaje === null) return { error: "El porcentaje va de 0 a 100." };
    if (!desde) return { error: "Elige desde qué mes rige." };
    const supabase = createServiceClient();
    const tienda = await supabase.from("fin_unidades").select("id, nombre, clase").eq("id", unidad).maybeSingle();
    if (tienda.error || !tienda.data || tienda.data.clase !== "tienda") return { error: "Tienda inválida." };

    let socioId: string;
    let socioNombre: string;
    if (socioElegido === NUEVO) {
      if (nombreNuevo.length < 3) return { error: "Escribe el nombre del socio nuevo." };
      const creado = await supabase.from("fin_socios").insert({ nombre: nombreNuevo }).select("id, nombre").single();
      if (creado.error) return { error: creado.error.code === "23505" ? "Ya hay un socio con ese nombre: elígelo de la lista." : creado.error.message };
      socioId = creado.data.id;
      socioNombre = creado.data.nombre;
    } else {
      if (!UUID.test(socioElegido)) return { error: "Elige el socio." };
      const socio = await supabase.from("fin_socios").select("id, nombre").eq("id", socioElegido).maybeSingle();
      if (socio.error || !socio.data) return { error: "Socio inválido." };
      socioId = socio.data.id;
      socioNombre = socio.data.nombre;
    }

    // El porcentaje que regía antes de este mes, para la bitácora.
    const previo = await supabase
      .from("fin_participaciones")
      .select("porcentaje")
      .eq("socio_id", socioId)
      .eq("unidad_id", unidad)
      .lte("vigente_desde", desde)
      .order("vigente_desde", { ascending: false })
      .limit(1);
    const { data, error } = await supabase
      .from("fin_participaciones")
      .upsert(
        { socio_id: socioId, unidad_id: unidad, porcentaje, vigente_desde: desde, creado_por: usuario.id },
        { onConflict: "socio_id,unidad_id,vigente_desde" },
      )
      .select("id")
      .single();
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    const antes = previo.data?.[0] ? Number(previo.data[0].porcentaje) : null;
    await registrarAuditoria({
      accion: "guardar_participacion",
      entidad: "fin_participaciones",
      entidadId: data.id,
      detalle: `${socioNombre} en ${tienda.data.nombre} desde ${desde.slice(0, 7)}`,
      antes: antes === null ? undefined : { Porcentaje: `${antes} %` },
      despues: { Porcentaje: `${porcentaje} %` },
    });
    revalidatePath("/utilidades", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el porcentaje." };
  }
}

/**
 * Atribuye un retiro de dividendos a un socio a mano (manda sobre el nombre en la descripción). Con `socioId = null`
 * vuelve a la atribución automática.
 */
export async function atribuirRetiro(movimientoId: string, socioId: string | null): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (typeof movimientoId !== "string" || !UUID.test(movimientoId)) return { error: "Retiro inválido." };
    if (socioId !== null && (typeof socioId !== "string" || !UUID.test(socioId))) return { error: "Socio inválido." };
    const supabase = createServiceClient();
    const mov = await supabase
      .from("fin_movimientos")
      .select("id, periodo, monto, fin_tipos!inner(nombre)")
      .eq("id", movimientoId)
      .ilike("fin_tipos.nombre", "%dividendo%")
      .maybeSingle();
    if (mov.error || !mov.data) return { error: "Ese movimiento no es un retiro de dividendos." };
    let nombre = "atribución automática";
    if (socioId) {
      const socio = await supabase.from("fin_socios").select("nombre").eq("id", socioId).maybeSingle();
      if (socio.error || !socio.data) return { error: "Socio inválido." };
      nombre = socio.data.nombre;
      const { error } = await supabase
        .from("fin_retiros_socio")
        .upsert({ movimiento_id: movimientoId, socio_id: socioId, creado_por: usuario.id }, { onConflict: "movimiento_id" });
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("fin_retiros_socio").delete().eq("movimiento_id", movimientoId);
      if (error) return { error: error.message };
    }
    await registrarAuditoria({
      accion: "atribuir_retiro_socio",
      entidad: "fin_retiros_socio",
      entidadId: movimientoId,
      detalle: `Retiro de ${String(mov.data.periodo).slice(0, 7)} por ${Number(mov.data.monto).toFixed(2)} → ${nombre}`,
    });
    revalidatePath("/utilidades", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo atribuir el retiro." };
  }
}
