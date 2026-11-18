"use server";

// Acciones de Libro › Recurrentes (mejora 9, migración 0981): crear una plantilla, activarla o pausarla y generar ya los
// movimientos que le tocan. Devuelven el error como valor.

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/af4/fecha";
import { sinAccesoARegistros, sinAccesoAUnidades } from "@/lib/finanzas/acceso-tienda";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { leerDatosRecurrente } from "@/lib/finanzas/recurrentes";
import { generarRecurrentes, textoRecurrentes } from "@/lib/finanzas/recurrentes-servidor";

const MODULO = "libro-movimientos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (v: number) => `US$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const revalidar = () => revalidatePath("/libro-movimientos", "layout");

export async function crearRecurrente(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const d = leerDatosRecurrente((k) => formData.get(k));
    if ("error" in d) return d;
    const acceso = await sinAccesoAUnidades([d.unidad_id]);
    if (acceso) return { error: acceso };
    const supabase = createServiceClient();
    const [u, t, c] = await Promise.all([
      supabase.from("fin_unidades").select("nombre").eq("id", d.unidad_id).maybeSingle(),
      supabase.from("fin_tipos").select("nombre").eq("id", d.tipo_id).maybeSingle(),
      d.cuenta_id ? supabase.from("fin_cuentas").select("id").eq("id", d.cuenta_id).maybeSingle() : Promise.resolve({ data: { id: null }, error: null }),
    ]);
    if (!u.data || !t.data || !c.data) return { error: "Tienda, tipo o cuenta inválidos." };
    const { data, error } = await supabase.from("fin_recurrentes").insert({ ...d, creado_por: usuario.id }).select("id").single();
    if (error || !data) return { error: /fin_recurrentes/.test(error?.message ?? "") ? "Falta correr la migración 0981 en Supabase." : `No se pudo guardar: ${error?.message ?? "sin respuesta"}` };
    await registrarAuditoria({
      accion: "crear_recurrente_libro",
      entidad: "fin_movimientos",
      detalle: `Recurrente «${d.descripcion}» · ${u.data.nombre} · ${t.data.nombre} · ${usd(d.monto)} el día ${d.dia} desde ${d.desde.slice(0, 7)}${d.hasta ? ` hasta ${d.hasta.slice(0, 7)}` : ""}`,
    });
    // Lo que ya le toca (meses pasados desde «desde», o este mes si pasó su día) se registra al momento.
    await generarRecurrentes(supabase, hoyPanama(), { soloIds: [data.id as string], usuarioId: usuario.id });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear la plantilla." };
  }
}

/** Pausa o reactiva una plantilla. No se borra: sus movimientos la siguen nombrando en la clave. */
export async function cambiarEstadoRecurrente(id: string, activo: boolean): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Plantilla inválida." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "fin_recurrentes", [id]);
    if (acceso) return { error: acceso };
    const { data, error } = await supabase.from("fin_recurrentes").update({ activo: activo === true, actualizado_en: new Date().toISOString() }).eq("id", id).select("descripcion").maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "La plantilla ya no existe." };
    await registrarAuditoria({ accion: activo ? "activar_recurrente_libro" : "pausar_recurrente_libro", entidad: "fin_movimientos", detalle: `Recurrente «${data.descripcion}»` });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cambiar la plantilla." };
  }
}

/** Genera ya lo que les toca a las plantillas activas que la persona puede ver (lo mismo que la tarea de cada mañana). */
export async function generarRecurrentesAhora(): Promise<{ error: string } | { texto: string; creados: number }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const supabase = createServiceClient();
    const [{ data, error }, permitidas] = await Promise.all([supabase.from("fin_recurrentes").select("id, unidad_id").eq("activo", true), cargarTiendasPermitidas()]);
    if (error) return { error: "Falta correr la migración 0981 en Supabase." };
    const permitidos = (data ?? []).filter((r) => !permitidas || puedeVerUnidad(permitidas, r.unidad_id as string)).map((r) => r.id as string);
    if (!permitidos.length) return { texto: "No hay plantillas activas.", creados: 0 };
    const r = await generarRecurrentes(supabase, hoyPanama(), { soloIds: permitidos, usuarioId: usuario.id });
    if ("error" in r) return r;
    if (r.creados) await registrarAuditoria({ accion: "generar_recurrentes_libro", entidad: "fin_movimientos", detalle: textoRecurrentes(r) });
    revalidar();
    return { texto: textoRecurrentes(r), creados: r.creados };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron generar." };
  }
}
