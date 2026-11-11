"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { CODIGO_MES_CERRADO } from "@/lib/finanzas/cierre";
import { leerTasa } from "@/lib/finanzas/entidades";
import { leerMes } from "@/lib/finanzas/flujo";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "estado-resultados";
const SIN_MIGRACION = "Falta correr la migración 0923 (multimoneda) en Supabase.";
const RUTAS = ["/estado-resultados", "/estado-resultados/tipos-cambio", "/flujo-caja", "/panel-financiero", "/rentabilidad", "/libro-movimientos"];

const fmt = (v: number) => v.toLocaleString("es-PA", { maximumFractionDigits: 6 });

/** El error de la base, dicho claro (un mes cerrado no deja cambiar su tasa). */
function mensajeError(error: { code?: string; message: string }): string {
  if (error.code === CODIGO_MES_CERRADO) return "Ese mes está cerrado: para cambiar su tipo de cambio hay que reabrirlo en Cierre de mes.";
  return `No se pudo guardar: ${error.message}`;
}

/** Las monedas que se pueden cargar: las de las entidades que no son dólares. */
async function monedasValidas(supabase: ReturnType<typeof createServiceClient>): Promise<Set<string> | null> {
  const { data, error } = await supabase.from("fin_entidades").select("moneda");
  if (error) return null;
  return new Set((data ?? []).map((e) => e.moneda as string).filter((m) => m !== "USD"));
}

function revalidar() {
  for (const r of RUTAS) revalidatePath(r);
}

/**
 * Guarda a mano el tipo de cambio de un mes (promedio y cierre, unidades por 1 USD). Si ya había uno, lo reemplaza y
 * queda como manual: completar desde los diarios no lo pisa. Los movimientos de ese mes en esa moneda se recalculan solos.
 */
export async function guardarTipoCambio(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const moneda = String(formData.get("moneda") ?? "");
    const periodo = leerMes(String(formData.get("mes") ?? ""));
    const promedio = leerTasa(formData.get("promedio"));
    const cierreTexto = String(formData.get("cierre") ?? "").trim();
    const cierre = cierreTexto ? leerTasa(cierreTexto) : promedio;
    const nota = String(formData.get("nota") ?? "").trim().slice(0, 300) || null;
    const monedas = await monedasValidas(supabase);
    if (!monedas) return { error: SIN_MIGRACION };
    if (!monedas.has(moneda)) return { error: "Elige la moneda." };
    if (!periodo) return { error: "Elige el mes." };
    if (promedio === null) return { error: "Escribe el promedio del mes (unidades por 1 USD)." };
    if (cierre === null) return { error: "El cierre debe ser un número positivo." };
    const previo = await supabase.from("fin_tipos_cambio_mes").select("promedio, cierre, origen").eq("moneda", moneda).eq("periodo", periodo).maybeSingle();
    if (previo.error) return { error: SIN_MIGRACION };
    const { error } = await supabase.from("fin_tipos_cambio_mes").upsert(
      { moneda, periodo, promedio, cierre, origen: "manual", dias: null, nota, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() },
      { onConflict: "moneda,periodo" },
    );
    if (error) return { error: mensajeError(error) };
    await registrarAuditoria({
      accion: "guardar_tipo_cambio",
      entidad: "fin_tipos_cambio_mes",
      entidadId: `${moneda}:${periodo.slice(0, 7)}`,
      detalle: `${moneda} · ${periodo.slice(0, 7)}`,
      antes: previo.data
        ? { Promedio: fmt(Number(previo.data.promedio)), Cierre: fmt(Number(previo.data.cierre)), Origen: previo.data.origen === "manual" ? "Manual" : "Automático" }
        : undefined,
      despues: { Promedio: fmt(promedio), Cierre: fmt(cierre), Origen: "Manual" },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el tipo de cambio." };
  }
}

/** Quita el tipo de cambio de un mes: sus movimientos en esa moneda quedan sin tasa hasta cargar otro. */
export async function eliminarTipoCambio(moneda: string, mes: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const periodo = leerMes(mes);
    if (typeof moneda !== "string" || !/^[A-Z]{3}$/.test(moneda) || !periodo) return { error: "Tipo de cambio inválido." };
    const supabase = createServiceClient();
    const previo = await supabase.from("fin_tipos_cambio_mes").select("promedio, cierre").eq("moneda", moneda).eq("periodo", periodo).maybeSingle();
    if (previo.error) return { error: SIN_MIGRACION };
    if (!previo.data) return { error: "Ese tipo de cambio ya no existe." };
    const { error } = await supabase.from("fin_tipos_cambio_mes").delete().eq("moneda", moneda).eq("periodo", periodo);
    if (error) return { error: mensajeError(error) };
    await registrarAuditoria({
      accion: "eliminar_tipo_cambio",
      entidad: "fin_tipos_cambio_mes",
      entidadId: `${moneda}:${periodo.slice(0, 7)}`,
      detalle: `${moneda} · ${periodo.slice(0, 7)}`,
      antes: { Promedio: fmt(Number(previo.data.promedio)), Cierre: fmt(Number(previo.data.cierre)) },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo quitar el tipo de cambio." };
  }
}

/** Completa los meses desde los tipos de cambio diarios (`tipos_cambio`). No pisa lo manual ni los meses cerrados. */
export async function completarTiposCambio(): Promise<{ error?: string; meses?: number }> {
  try {
    await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("fin_tipos_cambio_completar", { p_moneda: null, p_desde: null });
    if (error) return { error: error.code === CODIGO_MES_CERRADO ? mensajeError(error) : SIN_MIGRACION };
    const meses = Number(data ?? 0);
    await registrarAuditoria({
      accion: "completar_tipos_cambio",
      entidad: "fin_tipos_cambio_mes",
      detalle: `Desde los tipos de cambio diarios: ${meses} ${meses === 1 ? "mes" : "meses"}`,
    });
    revalidar();
    return { meses };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo completar." };
  }
}
