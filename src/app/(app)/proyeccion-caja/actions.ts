"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { SIN_MIGRACION_PROYECCION } from "@/lib/finanzas/cargar-proyeccion";
import { diaCorto, leerMontoAjuste, leerPorcentaje, leerSemana } from "@/lib/finanzas/proyeccion-caja";
import { hoyPanama } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";

const MODULO = "proyeccion-caja";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });
const texto = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function crearAjuste(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const semana = leerSemana(String(formData.get("semana") ?? ""));
    const concepto = texto(formData.get("concepto"), 120);
    const monto = leerMontoAjuste(formData.get("monto"));
    const sentido = formData.get("sentido") === "entrada" ? 1 : -1;
    const nota = String(formData.get("nota") ?? "").trim().slice(0, 2000) || null;
    if (!semana) return { error: "Elige la semana." };
    if (!concepto) return { error: "Escribe el concepto." };
    if (monto === null) return { error: "Escribe el monto." };
    const valor = Math.abs(monto) * sentido;
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("fin_proyeccion_ajustes")
      .insert({ semana, concepto, monto: valor, nota, creado_por: usuario.id })
      .select("id")
      .single();
    if (error) return { error: error.code === "42P01" ? SIN_MIGRACION_PROYECCION : `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({
      accion: "crear_ajuste_proyeccion",
      entidad: "fin_proyeccion_ajustes",
      entidadId: data.id,
      detalle: `${concepto} · semana del ${diaCorto(semana)} · ${usd(valor)}`,
    });
    revalidatePath("/proyeccion-caja", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el ajuste." };
  }
}

export async function eliminarAjuste(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Ajuste inválido." };
    const supabase = createServiceClient();
    const previo = await supabase.from("fin_proyeccion_ajustes").select("semana, concepto, monto").eq("id", id).maybeSingle();
    if (previo.error || !previo.data) return { error: "Ese ajuste ya no existe." };
    const { error } = await supabase.from("fin_proyeccion_ajustes").delete().eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({
      accion: "eliminar_ajuste_proyeccion",
      entidad: "fin_proyeccion_ajustes",
      entidadId: id,
      detalle: `${previo.data.concepto} · semana del ${diaCorto(String(previo.data.semana).slice(0, 10))}`,
      antes: { Monto: usd(Number(previo.data.monto)) },
    });
    revalidatePath("/proyeccion-caja", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar el ajuste." };
  }
}

/** Caja mínima, probabilidades de lo vencido y, si no hay saldos iniciales, la caja de hoy a mano. */
export async function guardarSupuestos(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const minimaTexto = String(formData.get("caja_minima") ?? "").trim();
    const cajaMinima = minimaTexto ? leerMontoAjuste(minimaTexto) : 0;
    if (cajaMinima === null && minimaTexto !== "0") return { error: "La caja mínima es un monto en USD." };
    const cobro = leerPorcentaje(formData.get("cobro_vencido"));
    const pago = leerPorcentaje(formData.get("pago_vencido"));
    if (cobro === null || pago === null) return { error: "Los porcentajes van de 0 a 100." };
    const cajaTexto = String(formData.get("caja_inicial") ?? "").trim();
    const cajaInicial = cajaTexto ? (cajaTexto === "0" ? 0 : leerMontoAjuste(cajaTexto)) : undefined;
    if (cajaInicial === null) return { error: "La caja de hoy es un monto en USD." };

    const supabase = createServiceClient();
    const previos = await supabase.from("fin_config").select("clave, valor").in("clave", ["caja_minima", "proyeccion_probabilidades", "proyeccion_caja_inicial"]);
    if (previos.error) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };
    const ahora = new Date().toISOString();
    const filas: { clave: string; valor: unknown; actualizado_por: string; actualizado_en: string }[] = [
      { clave: "caja_minima", valor: cajaMinima ?? 0, actualizado_por: usuario.id, actualizado_en: ahora },
      { clave: "proyeccion_probabilidades", valor: { cobroVencido: cobro, pagoVencido: pago }, actualizado_por: usuario.id, actualizado_en: ahora },
    ];
    if (cajaInicial !== undefined) filas.push({ clave: "proyeccion_caja_inicial", valor: { monto: cajaInicial, fecha: hoyPanama() }, actualizado_por: usuario.id, actualizado_en: ahora });
    const { error } = await supabase.from("fin_config").upsert(filas, { onConflict: "clave" });
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    const antes = Object.fromEntries((previos.data ?? []).map((f) => [f.clave, JSON.stringify(f.valor)]));
    await registrarAuditoria({
      accion: "guardar_supuestos_proyeccion",
      entidad: "fin_proyeccion_supuestos",
      entidadId: "proyeccion_caja",
      detalle: "Supuestos de la proyección de caja",
      antes: Object.keys(antes).length ? antes : undefined,
      despues: Object.fromEntries(filas.map((f) => [f.clave, JSON.stringify(f.valor)])),
    });
    revalidatePath("/proyeccion-caja", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron guardar los supuestos." };
  }
}
