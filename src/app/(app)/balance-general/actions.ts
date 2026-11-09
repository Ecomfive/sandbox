"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { dinero } from "@/lib/af4/formato";
import { mesEnCursoPanama } from "@/lib/af4/fecha";
import { esRubroPartida, etiquetaRubro } from "@/lib/finanzas/balance";
import { SIN_MIGRACION_BALANCE, valorInventarioHoy } from "@/lib/finanzas/cargar-balance";
import { leerMes } from "@/lib/finanzas/flujo";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "balance-general";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

/** «-1.250,40», «1250.40», «$ 1,250.40» → número; vacío o no numérico → null. */
function leerMonto(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  let s = v.replace(/[$\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? Math.round(n * 100) / 100 : null;
}

const revalidar = () => revalidatePath(RUTA_BALANCE, "layout");
const RUTA_BALANCE = "/balance-general";

/**
 * Guarda el saldo de una partida del balance (préstamo, otro activo o pasivo, aporte, patrimonio inicial) desde el
 * cierre de un mes. Si ya había una del mismo concepto y mes, la reemplaza (así se corrige).
 */
export async function guardarPartidaBalance(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const rubro = String(formData.get("rubro") ?? "");
    const concepto = String(formData.get("concepto") ?? "").replace(/\s+/g, " ").trim();
    const periodo = leerMes(String(formData.get("mes") ?? ""));
    const monto = leerMonto(formData.get("monto"));
    const entidad = String(formData.get("entidad_id") ?? "");
    const nota = String(formData.get("nota") ?? "").trim().slice(0, 300) || null;
    if (!esRubroPartida(rubro)) return { error: "Elige el rubro." };
    if (!concepto || concepto.length > 120) return { error: "Escribe el concepto (hasta 120 caracteres)." };
    if (!periodo) return { error: "Elige el mes." };
    if (monto === null) return { error: "Escribe el saldo en dólares (0 cierra el concepto)." };
    if (entidad && !UUID.test(entidad)) return { error: "Entidad inválida." };
    const supabase = createServiceClient();
    if (entidad) {
      const e = await supabase.from("fin_entidades").select("id").eq("id", entidad).maybeSingle();
      if (e.error || !e.data) return { error: "Entidad inválida." };
    }
    let previa = supabase.from("fin_balance_partidas").select("id, monto, concepto").eq("rubro", rubro).eq("periodo", periodo).ilike("concepto", concepto.replace(/[%_\\]/g, "\\$&"));
    previa = entidad ? previa.eq("entidad_id", entidad) : previa.is("entidad_id", null);
    const p = await previa.maybeSingle();
    if (p.error) return { error: SIN_MIGRACION_BALANCE };
    const fila = { entidad_id: entidad || null, rubro, concepto, periodo, monto, nota, actualizado_en: new Date().toISOString() };
    const r = p.data
      ? await supabase.from("fin_balance_partidas").update(fila).eq("id", p.data.id).select("id").single()
      : await supabase.from("fin_balance_partidas").insert({ ...fila, creado_por: usuario.id }).select("id").single();
    if (r.error) return { error: `No se pudo guardar: ${r.error.message}` };
    await registrarAuditoria({
      accion: "guardar_partida_balance",
      entidad: "fin_balance_partidas",
      entidadId: r.data.id,
      detalle: `${etiquetaRubro(rubro)} · ${concepto} · ${periodo.slice(0, 7)}`,
      antes: p.data ? { Saldo: usd(Number(p.data.monto)) } : undefined,
      despues: { Saldo: usd(monto) },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la partida." };
  }
}

export async function eliminarPartidaBalance(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Partida inválida." };
    const supabase = createServiceClient();
    const previa = await supabase.from("fin_balance_partidas").select("rubro, concepto, periodo, monto").eq("id", id).maybeSingle();
    if (previa.error || !previa.data) return { error: "Esa partida ya no existe." };
    const { error } = await supabase.from("fin_balance_partidas").delete().eq("id", id);
    if (error) return { error: "No se pudo eliminar." };
    await registrarAuditoria({
      accion: "eliminar_partida_balance",
      entidad: "fin_balance_partidas",
      entidadId: id,
      detalle: `${etiquetaRubro(previa.data.rubro as string)} · ${previa.data.concepto} · ${String(previa.data.periodo).slice(0, 7)}`,
      antes: { Saldo: usd(Number(previa.data.monto)) },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar la partida." };
  }
}

/** Guarda la foto del inventario valorizado de hoy como el del mes en curso (la última foto del mes queda como su cierre). */
export async function guardarFotoInventario(): Promise<{ error?: string; valor?: number }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const valor = await valorInventarioHoy(supabase);
    if (valor === null) return { error: "Falta correr la migración 0921 (inventario valorizado) en Supabase." };
    const mes = mesEnCursoPanama();
    const previa = await supabase.from("fin_inventario_cortes").select("valor").eq("periodo", mes).maybeSingle();
    if (previa.error) return { error: SIN_MIGRACION_BALANCE };
    const { error } = await supabase
      .from("fin_inventario_cortes")
      .upsert({ periodo: mes, valor, origen: "manual", tomado_por: usuario.id, tomado_en: new Date().toISOString() }, { onConflict: "periodo" });
    if (error) return { error: "No se pudo guardar la foto." };
    await registrarAuditoria({
      accion: "guardar_foto_inventario",
      entidad: "fin_inventario_cortes",
      entidadId: mes,
      detalle: `Inventario de ${mes.slice(0, 7)}`,
      antes: previa.data ? { Valor: usd(Number(previa.data.valor)) } : undefined,
      despues: { Valor: usd(valor) },
    });
    revalidar();
    revalidatePath("/flujo-caja");
    return { valor };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la foto." };
  }
}
