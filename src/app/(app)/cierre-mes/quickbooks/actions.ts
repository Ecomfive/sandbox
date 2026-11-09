"use server";

// Cierre de mes › QuickBooks (migración 0950): desconectar y leer ahora (quien puede modificar Usuarios y roles) y el mapeo
// de cuentas de QuickBooks a las secciones del portal (quien puede modificar Cierre de mes). Todo devuelve `{ error }`.

import { revalidatePath } from "next/cache";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { configQbo, desconectarQbo, SIN_MIGRACION_QBO } from "@/lib/quickbooks/cliente";
import { DESTINOS, esDestino } from "@/lib/quickbooks/conciliacion";
import { administraIntegraciones } from "@/lib/quickbooks/permiso";
import { limitadoATiendas } from "@/components/finanzas/solo-toda-la-empresa";
import { createServiceClient } from "@/lib/supabase/server";
import { ejecutarTarea } from "@/lib/tareas/ejecutar";

const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });
const CUENTA = /^[^\s].{0,199}$/;

function revalidar() {
  revalidatePath("/cierre-mes/quickbooks");
  revalidatePath("/cierre-mes");
  revalidatePath("/panel-financiero/estado-sistema");
}

async function exigirAdministrador(): Promise<{ id: string } | { error: string }> {
  const u = await getUsuarioActual();
  if (!administraIntegraciones(u)) return { error: "Solo quien puede modificar Usuarios y roles conecta o desconecta QuickBooks." };
  return { id: u!.id };
}

export async function desconectarQuickbooks(): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura("cierre-mes");
    const a = await exigirAdministrador();
    if ("error" in a) return a;
    const r = await desconectarQbo(createServiceClient(), configQbo());
    if (r.error) return r;
    await registrarAuditoria({ accion: "desconectar_quickbooks", entidad: "qbo_conexion", detalle: "QuickBooks desconectado (lo leído se conserva)" });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo desconectar.");
  }
}

export async function leerQuickbooksAhora(): Promise<{ error?: string; resumen?: string }> {
  try {
    await requireModuloEscritura("cierre-mes");
    const a = await exigirAdministrador();
    if ("error" in a) return a;
    const r = await ejecutarTarea(createServiceClient(), "quickbooks", { disparo: "manual", usuarioId: a.id });
    revalidar();
    return r.ok ? { resumen: r.resumen } : { error: r.error ?? "Falló la lectura." };
  } catch (e) {
    return fallo(e, "No se pudo leer QuickBooks.");
  }
}

/** Guarda el destino de una o varias cuentas (`[cuentaId, destino][]`). */
export async function guardarMapeoQbo(cambios: [string, string][]): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura("cierre-mes");
    if (await limitadoATiendas()) return { error: "El mapeo de QuickBooks es de toda la empresa." };
    if (!Array.isArray(cambios) || !cambios.length || cambios.length > 2000) return { error: "Nada que guardar." };
    const filas: { cuenta_id: string; destino: string; actualizado_por: string; actualizado_en: string }[] = [];
    const ahora = new Date().toISOString();
    for (const par of cambios) {
      if (!Array.isArray(par) || typeof par[0] !== "string" || !CUENTA.test(par[0]) || !esDestino(par[1])) return { error: "Cuenta o destino inválido." };
      filas.push({ cuenta_id: par[0], destino: par[1], actualizado_por: usuario.id, actualizado_en: ahora });
    }
    const supabase = createServiceClient();
    // Solo cuentas que QuickBooks ya trajo.
    const ids = [...new Set(filas.map((f) => f.cuenta_id))];
    const conocidas = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from("qbo_pyg_mensual").select("cuenta_id").in("cuenta_id", ids.slice(i, i + 200));
      if (error) return { error: SIN_MIGRACION_QBO };
      for (const d of data ?? []) conocidas.add(String(d.cuenta_id));
    }
    const validas = filas.filter((f) => conocidas.has(f.cuenta_id));
    if (!validas.length) return { error: "Esas cuentas no están en lo leído de QuickBooks." };
    const { error } = await supabase.from("qbo_mapeo").upsert(validas, { onConflict: "cuenta_id" });
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    const etiqueta = (d: string) => DESTINOS.find((x) => x.clave === d)?.etiqueta ?? d;
    await registrarAuditoria({
      accion: "mapear_cuentas_quickbooks",
      entidad: "qbo_mapeo",
      detalle: validas.length === 1 ? `Cuenta ${validas[0].cuenta_id} → ${etiqueta(validas[0].destino)}` : `${validas.length} cuentas mapeadas`,
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar el mapeo.");
  }
}
