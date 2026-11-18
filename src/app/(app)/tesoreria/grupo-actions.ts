"use server";

// Acciones de Tesorería › Préstamos del grupo (migración 0983): registrar un préstamo, costo o abono, eliminar uno
// cargado a mano y sumar una parte. Devuelven el error como valor.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { leerDatosMovGrupo, etiquetaTipoGrupo, CLASES_PARTE } from "@/lib/finanzas/prestamos-grupo";
import { limitadoATiendas } from "@/components/finanzas/solo-toda-la-empresa";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "tesoreria";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (v: number) => `US$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const revalidar = () => revalidatePath("/tesoreria/grupo");

export async function crearMovimientoGrupo(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    const d = leerDatosMovGrupo((k) => formData.get(k));
    if ("error" in d) return d;
    const supabase = createServiceClient();
    const { data: partes, error: ep } = await supabase.from("fin_grupo_partes").select("id, nombre").in("id", [d.acreedor_id, d.deudor_id]);
    if (ep) return { error: ep.message.includes("fin_grupo") ? "Falta correr la migración 0983 en Supabase." : ep.message };
    if ((partes ?? []).length !== 2) return { error: "Quien presta o quien debe ya no existe." };
    const nombre = (id: string) => (partes ?? []).find((p) => p.id === id)?.nombre ?? "—";
    const { data, error } = await supabase.from("fin_grupo_movimientos").insert({ ...d, creado_por: usuario.id }).select("id").single();
    if (error || !data) return { error: `No se pudo guardar: ${error?.message ?? "sin respuesta"}` };
    await registrarAuditoria({
      accion: "crear_movimiento_grupo",
      entidad: "fin_grupo_movimientos",
      entidadId: data.id as string,
      detalle: `${etiquetaTipoGrupo(d.tipo)} ${usd(d.monto)} · ${nombre(d.deudor_id)} debe a ${nombre(d.acreedor_id)} · ${d.concepto}${d.ordenes.length ? ` · ${d.ordenes.join(", ")}` : ""}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Elimina un movimiento cargado a mano (lo importado de ClickUp se corrige con otro movimiento). */
export async function eliminarMovimientoGrupo(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Movimiento inválido." };
    const supabase = createServiceClient();
    const { data: m } = await supabase.from("fin_grupo_movimientos").select("tipo, monto, concepto, origen").eq("id", id).maybeSingle();
    if (!m) return { error: "El movimiento ya no existe." };
    if (m.origen !== "manual") return { error: "Lo importado de ClickUp no se borra: corrígelo con otro movimiento (un abono o un costo)." };
    const { error } = await supabase.from("fin_grupo_movimientos").delete().eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: "eliminar_movimiento_grupo", entidad: "fin_grupo_movimientos", entidadId: id, detalle: `${etiquetaTipoGrupo(m.tipo)} ${usd(Number(m.monto))} · ${m.concepto}` });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar." };
  }
}

export async function crearParteGrupo(formData: FormData): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    const nombre = String(formData.get("nombre") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const clase = String(formData.get("clase") ?? "");
    if (!nombre) return { error: "Falta el nombre." };
    if (!CLASES_PARTE.some((c) => c.clave === clase)) return { error: "Elige qué es." };
    const { error } = await createServiceClient().from("fin_grupo_partes").insert({ nombre, clase });
    if (error) return { error: error.code === "23505" ? "Ya existe con ese nombre." : error.message };
    await registrarAuditoria({ accion: "crear_parte_grupo", entidad: "fin_grupo_movimientos", detalle: `${nombre} (${clase})` });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear." };
  }
}
