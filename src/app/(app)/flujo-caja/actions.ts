"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { leerMes } from "@/lib/finanzas/flujo";
import { dinero } from "@/lib/af4/formato";

const MODULO = "flujo-caja";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

/** «-1.250,40», «1250.40», «$ 1,250.40» → número; vacío o no numérico → null. */
function leerMonto(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string") return null;
  let s = v.replace(/[$\s]/g, "");
  if (!s) return null;
  // Con coma y punto, el último es el decimal; con solo coma, es el decimal.
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? Math.round(n * 100) / 100 : null;
}

/**
 * Guarda el saldo de una cuenta al comenzar un mes. Si ya había uno para esa cuenta y ese mes, lo reemplaza (es la
 * forma de corregirlo).
 */
export async function guardarSaldoInicial(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const cuenta = String(formData.get("cuenta_id") ?? "");
    const fecha = leerMes(String(formData.get("mes") ?? ""));
    const monto = leerMonto(formData.get("monto"));
    const nota = String(formData.get("nota") ?? "").trim().slice(0, 200) || null;
    if (!UUID.test(cuenta)) return { error: "Elige la cuenta." };
    if (!fecha) return { error: "Elige el mes." };
    if (monto === null) return { error: "Escribe el saldo (puede ser negativo en una tarjeta)." };
    const supabase = createServiceClient();
    const existe = await supabase.from("fin_cuentas").select("id, nombre").eq("id", cuenta).maybeSingle();
    if (existe.error || !existe.data) return { error: "Cuenta inválida." };
    const previo = await supabase.from("fin_saldos_iniciales").select("id, monto").eq("cuenta_id", cuenta).eq("fecha", fecha).maybeSingle();
    if (previo.error) return { error: "Falta correr la migración 0904 (flujo de caja) en Supabase." };
    const { data, error } = await supabase
      .from("fin_saldos_iniciales")
      .upsert(
        { cuenta_id: cuenta, fecha, monto, nota, creado_por: usuario.id, actualizado_en: new Date().toISOString() },
        { onConflict: "cuenta_id,fecha" },
      )
      .select("id")
      .single();
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({
      accion: "guardar_saldo_inicial",
      entidad: "fin_saldos_iniciales",
      entidadId: data.id,
      detalle: `${existe.data.nombre} · ${fecha.slice(0, 7)}`,
      antes: previo.data ? { Saldo: usd(Number(previo.data.monto)) } : undefined,
      despues: { Saldo: usd(monto) },
    });
    revalidatePath("/flujo-caja", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el saldo." };
  }
}

export async function eliminarSaldoInicial(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Saldo inválido." };
    const supabase = createServiceClient();
    const previo = await supabase.from("fin_saldos_iniciales").select("monto, fecha, fin_cuentas(nombre)").eq("id", id).maybeSingle();
    if (previo.error || !previo.data) return { error: "Ese saldo ya no existe." };
    const { error } = await supabase.from("fin_saldos_iniciales").delete().eq("id", id);
    if (error) return { error: error.message };
    const cuenta = previo.data.fin_cuentas as unknown as { nombre: string } | { nombre: string }[] | null;
    const nombre = Array.isArray(cuenta) ? cuenta[0]?.nombre : cuenta?.nombre;
    await registrarAuditoria({
      accion: "eliminar_saldo_inicial",
      entidad: "fin_saldos_iniciales",
      entidadId: id,
      detalle: `${nombre ?? "Cuenta"} · ${String(previo.data.fecha).slice(0, 7)}`,
      antes: { Saldo: usd(Number(previo.data.monto)) },
    });
    revalidatePath("/flujo-caja", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar el saldo." };
  }
}
