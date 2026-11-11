"use server";

// Acciones del Informe mensual: la explicación de la variación (IA + edición, mejora 96) y «Guardar versión» (mejora 95).
// Piden poder modificar el Estado de resultados. Devuelven el error como valor.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { leerPeriodo } from "@/lib/af4/fecha";
import { armarSnapshotInforme, guardarVersion, SIN_MIGRACION_ENVIOS } from "@/lib/finanzas/cargar-informe-envio";
import { configAnthropic, pedirExplicacion } from "@/lib/finanzas/explicacion-ia";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "estado-resultados";

async function permiso() {
  try {
    return { usuario: await requireModuloEscritura(MODULO) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sin permiso." };
  }
}

/** Un borrador de la explicación con la IA (no se guarda: la persona lo revisa y lo guarda). */
export async function generarExplicacion(mesCrudo: unknown): Promise<{ error?: string; texto?: string }> {
  const p = await permiso();
  if ("error" in p) return { error: p.error };
  const cfg = configAnthropic(process.env);
  if (!cfg) return { error: "Falta ANTHROPIC_API_KEY en el servidor." };
  const mes = leerPeriodo(mesCrudo);
  if (!mes) return { error: "Mes inválido." };
  const snap = await armarSnapshotInforme(createServiceClient(), mes);
  if ("error" in snap) return { error: snap.error };
  if (snap.mes !== mes) return { error: "Ese mes no se puede informar." };
  const r = await pedirExplicacion(snap, cfg);
  return "error" in r ? { error: r.error } : { texto: r.texto };
}

/** Guarda (o borra, con texto vacío) la explicación del mes en el informe. */
export async function guardarExplicacion(mesCrudo: unknown, textoCrudo: unknown, deIa: unknown): Promise<{ error?: string }> {
  const p = await permiso();
  if ("error" in p) return { error: p.error };
  const mes = leerPeriodo(mesCrudo);
  if (!mes) return { error: "Mes inválido." };
  const texto = typeof textoCrudo === "string" ? textoCrudo.replace(/\r\n/g, "\n").trim() : "";
  if (texto.length > 4000) return { error: "La explicación admite hasta 4 000 caracteres." };
  const supabase = createServiceClient();
  const cfg = configAnthropic(process.env);
  const r = texto
    ? await supabase.from("fin_informes_explicacion").upsert(
        { periodo: mes, texto, origen: deIa === true ? "ia" : "manual", modelo: deIa === true ? (cfg?.modelo ?? null) : null, actualizado_por: p.usuario.id, actualizado_en: new Date().toISOString() },
        { onConflict: "periodo" },
      )
    : await supabase.from("fin_informes_explicacion").delete().eq("periodo", mes);
  if (r.error) return { error: SIN_MIGRACION_ENVIOS };
  await registrarAuditoria({ accion: "guardar_explicacion_informe", entidad: "fin_informes_explicacion", detalle: `${mes.slice(0, 7)}: ${texto || "(borrada)"}`.slice(0, 500) });
  revalidatePath("/panel-financiero/informe");
  return {};
}

/** Guarda una versión del informe tal como se ve hoy. */
export async function guardarVersionInforme(mesCrudo: unknown): Promise<{ error?: string; id?: string }> {
  const p = await permiso();
  if ("error" in p) return { error: p.error };
  const mes = leerPeriodo(mesCrudo);
  if (!mes) return { error: "Mes inválido." };
  const supabase = createServiceClient();
  const snap = await armarSnapshotInforme(supabase, mes);
  if ("error" in snap) return { error: snap.error };
  const id = await guardarVersion(supabase, { tipo: "mensual", periodo: snap.mes, motivo: "generado", contenido: snap, usuarioId: p.usuario.id, usuarioNombre: p.usuario.nombre ?? p.usuario.email });
  if (!id) return { error: SIN_MIGRACION_ENVIOS };
  await registrarAuditoria({ accion: "guardar_version_informe", entidad: "fin_informes_versiones", entidadId: id, detalle: `Informe de ${snap.mes.slice(0, 7)}` });
  revalidatePath("/panel-financiero/versiones");
  return { id };
}
