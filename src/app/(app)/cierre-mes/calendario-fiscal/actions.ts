"use server";

// Calendario fiscal (migración 0928): marcar una obligación como presentada, quitar la marca y cambiar sus fechas y avisos.

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { hoyPanama } from "@/lib/af4/fecha";
import { createServiceClient } from "@/lib/supabase/server";
import { SIN_MIGRACION_FISCAL } from "@/lib/finanzas/avisos-cierre";
import { leerMonto } from "@/lib/finanzas/ajustes-cierre";
import { nombrePeriodoFiscal, periodoDe, validarObligacion } from "@/lib/finanzas/calendario-fiscal";

const MODULO = "cierre-mes";
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });

function revalidar() {
  revalidatePath("/cierre-mes/calendario-fiscal");
  revalidatePath("/panel-financiero");
}

async function obligacion(id: string) {
  const { data, error } = await createServiceClient().from("fin_obligaciones_fiscales").select("id, nombre, periodicidad").eq("id", id).maybeSingle();
  if (error) return { error: SIN_MIGRACION_FISCAL };
  if (!data) return { error: "Esa obligación no existe." };
  return data as { id: string; nombre: string; periodicidad: "mensual" | "anual" };
}

export async function marcarPresentada(obligacionId: string, periodoTexto: string, fechaTexto: string, referenciaTexto: string, montoTexto: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!ES_UUID.test(obligacionId)) return { error: "Obligación inválida." };
    if (!FECHA.test(periodoTexto)) return { error: "Período inválido." };
    const fecha = fechaTexto || hoyPanama();
    if (!FECHA.test(fecha) || fecha > hoyPanama()) return { error: "La fecha de presentación no puede ser futura." };
    const monto = montoTexto.trim() ? leerMonto(montoTexto) : null;
    if (montoTexto.trim() && monto === null) return { error: "El monto no es válido (Ej: 1250.00)." };
    const o = await obligacion(obligacionId);
    if ("error" in o) return o;
    const periodo = periodoDe(o, periodoTexto);
    const referencia = referenciaTexto.replace(/\s+/g, " ").trim().slice(0, 120) || null;
    const { error } = await createServiceClient()
      .from("fin_obligaciones_presentadas")
      .upsert(
        { obligacion_id: o.id, periodo, presentado_en: fecha, referencia, monto, marcado_por: usuario.id, marcado_en: new Date().toISOString() },
        { onConflict: "obligacion_id,periodo" },
      );
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({
      accion: "marcar_obligacion_fiscal",
      entidad: "fin_obligaciones_fiscales",
      entidadId: o.id,
      detalle: `${o.nombre} de ${nombrePeriodoFiscal(o, periodo)} presentada el ${fecha}${referencia ? ` · ${referencia}` : ""}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo marcar.");
  }
}

export async function quitarPresentada(obligacionId: string, periodoTexto: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!ES_UUID.test(obligacionId) || !FECHA.test(periodoTexto)) return { error: "Datos inválidos." };
    const o = await obligacion(obligacionId);
    if ("error" in o) return o;
    const periodo = periodoDe(o, periodoTexto);
    const { error } = await createServiceClient().from("fin_obligaciones_presentadas").delete().eq("obligacion_id", o.id).eq("periodo", periodo);
    if (error) return { error: `No se pudo quitar: ${error.message}` };
    await registrarAuditoria({ accion: "quitar_obligacion_fiscal", entidad: "fin_obligaciones_fiscales", entidadId: o.id, detalle: `${o.nombre} de ${nombrePeriodoFiscal(o, periodo)}` });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo quitar la marca.");
  }
}

/** Cambia el día (y el mes, si es anual), los días de aviso y si está activa. */
export async function guardarObligacion(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const id = String(formData.get("id") ?? "");
    if (!ES_UUID.test(id)) return { error: "Obligación inválida." };
    const o = await obligacion(id);
    if ("error" in o) return o;
    const v = validarObligacion(Object.fromEntries(formData.entries()), o.periodicidad);
    if ("error" in v) return v;
    const { error } = await createServiceClient()
      .from("fin_obligaciones_fiscales")
      .update({ ...v, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({
      accion: "cambiar_obligacion_fiscal",
      entidad: "fin_obligaciones_fiscales",
      entidadId: id,
      detalle: `${o.nombre}: día ${v.dia}${v.mes ? ` del mes ${v.mes}` : ""}, aviso ${v.dias_aviso} días${v.activo ? "" : ", inactiva"}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar la obligación.");
  }
}
