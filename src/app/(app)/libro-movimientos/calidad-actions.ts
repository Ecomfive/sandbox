"use server";

import { sinAccesoARegistros, sinAccesoAUnidades } from "@/lib/finanzas/acceso-tienda";

// Acciones de «Datos y calidad» del libro: marcar un par como «no es duplicado», un atípico como revisado, anular o
// restaurar un movimiento y la vista previa de una regla antes de crearla. Todas devuelven `{ error }` como valor.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { dinero } from "@/lib/af4/formato";
import { normalizar, reglaPara } from "@/lib/finanzas/clasificacion";
import { clavePar } from "@/lib/finanzas/duplicados";
import { UNIDAD_SIN_ASIGNAR } from "@/lib/finanzas/libro-excel";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";

const MODULO = "libro-movimientos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr la migración 0925 en Supabase.";
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

function revalidar() {
  revalidatePath("/libro-movimientos", "layout");
  revalidatePath("/estado-resultados");
  revalidatePath("/flujo-caja");
}

/** «No es duplicado»: el par ya no vuelve a la lista. */
export async function marcarNoDuplicado(a: string, b: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!UUID.test(String(a)) || !UUID.test(String(b)) || a === b) return { error: "Movimientos inválidos." };
    const acceso = await sinAccesoARegistros(createServiceClient(), "fin_movimientos", [a, b]);
    if (acceso) return { error: acceso };
    const [x, y] = clavePar(a, b).split("|");
    const { error } = await createServiceClient()
      .from("fin_calidad_revisados")
      .upsert({ clave: `dup:${x}|${y}`, tipo: "duplicado", movimiento_id: x, movimiento_b: y, creado_por: usuario.id }, { onConflict: "clave" });
    if (error) return { error: error.code === "42P01" ? FALTA : error.message };
    await registrarAuditoria({ accion: "marcar_no_duplicado", entidad: "fin_movimientos", entidadId: x, detalle: "No es duplicado" });
    revalidatePath("/libro-movimientos", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Un monto atípico ya revisado (no vuelve a contar como pendiente). */
export async function marcarAtipicoRevisado(id: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!UUID.test(String(id))) return { error: "Movimiento inválido." };
    const acceso = await sinAccesoARegistros(createServiceClient(), "fin_movimientos", [id]);
    if (acceso) return { error: acceso };
    const { error } = await createServiceClient()
      .from("fin_calidad_revisados")
      .upsert({ clave: `atip:${id}`, tipo: "atipico", movimiento_id: id, creado_por: usuario.id }, { onConflict: "clave" });
    if (error) return { error: error.code === "42P01" ? FALTA : error.message };
    await registrarAuditoria({ accion: "revisar_atipico", entidad: "fin_movimientos", entidadId: id, detalle: "Monto atípico revisado" });
    revalidatePath("/libro-movimientos", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/**
 * Anula un movimiento (un duplicado): sale del EERR y del flujo y queda marcado como anulado, sin borrarse, para poder
 * restaurarlo. Queda «editado a mano»: reimportar el Excel no lo devuelve. En un mes cerrado, la base lo rechaza.
 */
export async function anularMovimiento(id: string, motivo: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!UUID.test(String(id))) return { error: "Movimiento inválido." };
    const acceso = await sinAccesoARegistros(createServiceClient(), "fin_movimientos", [id]);
    if (acceso) return { error: acceso };
    const razon = String(motivo ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || "Duplicado";
    const supabase = createServiceClient();
    const { data: m, error: e1 } = await supabase.from("fin_movimientos").select("descripcion, monto, periodo, en_eerr, en_flujo, anulado_en").eq("id", id).maybeSingle();
    if (e1) return { error: FALTA };
    if (!m) return { error: "El movimiento ya no existe." };
    if (m.anulado_en) return { error: "Ya está anulado." };
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from("fin_movimientos")
      .update({
        anulado_en: ahora,
        anulado_por: usuario.id,
        anulado_motivo: razon,
        anulado_previo: { en_eerr: m.en_eerr, en_flujo: m.en_flujo },
        en_eerr: false,
        en_flujo: false,
        editado_a_mano: true,
        editado_por: usuario.id,
        editado_en: ahora,
        actualizado_en: ahora,
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({
      accion: "anular_movimiento_libro",
      entidad: "fin_movimientos",
      entidadId: id,
      detalle: `${m.descripcion} · ${usd(Number(m.monto))} (${String(m.periodo).slice(0, 7)}): ${razon}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo anular." };
  }
}

/** Devuelve un movimiento anulado a como estaba (EERR y flujo de antes). */
export async function restaurarMovimiento(id: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!UUID.test(String(id))) return { error: "Movimiento inválido." };
    const acceso = await sinAccesoARegistros(createServiceClient(), "fin_movimientos", [id]);
    if (acceso) return { error: acceso };
    const supabase = createServiceClient();
    const { data: m, error: e1 } = await supabase.from("fin_movimientos").select("anulado_en, anulado_previo").eq("id", id).maybeSingle();
    if (e1) return { error: FALTA };
    if (!m?.anulado_en) return { error: "No está anulado." };
    const previo = (m.anulado_previo ?? {}) as { en_eerr?: boolean; en_flujo?: boolean };
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from("fin_movimientos")
      .update({
        anulado_en: null,
        anulado_por: null,
        anulado_motivo: null,
        anulado_previo: null,
        en_eerr: previo.en_eerr !== false,
        en_flujo: previo.en_flujo !== false,
        editado_por: usuario.id,
        editado_en: ahora,
        actualizado_en: ahora,
      })
      .eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: "restaurar_movimiento_libro", entidad: "fin_movimientos", entidadId: id, detalle: "Restaurado" });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo restaurar." };
  }
}

export interface VistaPreviaRegla {
  /** Movimientos del libro cuya descripción calza con el patrón. */
  total: number;
  /** De esos, los que están pendientes y la regla completaría. */
  completaria: number;
  /** Los ya clasificados con otro tipo o tienda (la regla no los cambia, pero conviene saberlo). */
  distintos: number;
  ejemplos: { descripcion: string; monto: number }[];
  /** Si ya hay una regla más específica que gana para esos movimientos. */
  ganaOtra: string | null;
}

/**
 * Cuántos movimientos tocaría una regla nueva antes de crearla: los que calzan, los pendientes que completaría y los ya
 * clasificados distinto. Es una lectura: basta poder abrir el libro.
 */
export async function vistaPreviaRegla(patronTexto: string, unidadId: string | null, tipoId: string | null): Promise<{ error: string } | VistaPreviaRegla> {
  try {
    await requireModulo(MODULO);
    const accesoRegla = unidadId ? await sinAccesoAUnidades([unidadId]) : null;
    if (accesoRegla) return { error: accesoRegla };
    const patron = normalizar(String(patronTexto ?? "")).slice(0, 120);
    if (patron.length < 3) return { error: "El texto debe tener al menos 3 letras." };
    const unidad = typeof unidadId === "string" && UUID.test(unidadId) ? unidadId : null;
    const tipo = typeof tipoId === "string" && UUID.test(tipoId) ? tipoId : null;
    const supabase = createServiceClient();
    // El calce (palabras completas, sin acentos) se revisa aquí: en la base no se puede comparar sin acentos.
    const [movs, sin, reglas] = await Promise.all([
      traerTodasConError<{ descripcion: string; monto: number | string; unidad_id: string; tipo_id: string | null }>((d, h) =>
        supabase.from("fin_movimientos").select("descripcion, monto, unidad_id, tipo_id").order("id").range(d, h),
      ),
      supabase.from("fin_unidades").select("id").eq("nombre", UNIDAD_SIN_ASIGNAR).maybeSingle(),
      supabase.from("fin_reglas").select("id, patron, unidad_id, tipo_id, activo").eq("activo", true),
    ]);
    if (movs.error) return { error: "No se pudo leer el libro." };
    const sinAsignar = (sin.data?.id as string | undefined) ?? null;
    const calza = (movs.data ?? []).filter((m) => ` ${normalizar(m.descripcion)} `.includes(` ${patron} `));
    const nueva = { id: "nueva", patron, unidad_id: unidad, tipo_id: tipo, activo: true };
    const existentes = (reglas.data ?? []) as typeof nueva[];
    let completaria = 0;
    let distintos = 0;
    let ganaOtra: string | null = null;
    for (const m of calza) {
      const r = reglaPara(m.descripcion, [...existentes, nueva]);
      if (r && r.id !== "nueva") ganaOtra ??= r.patron;
      if (r?.id === "nueva" && ((m.unidad_id === sinAsignar && unidad) || (!m.tipo_id && tipo))) completaria++;
      if ((tipo && m.tipo_id && m.tipo_id !== tipo) || (unidad && m.unidad_id !== sinAsignar && m.unidad_id !== unidad)) distintos++;
    }
    return {
      total: calza.length,
      completaria,
      distintos,
      ejemplos: calza.slice(0, 5).map((m) => ({ descripcion: m.descripcion, monto: Number(m.monto) })),
      ganaOtra,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo calcular." };
  }
}
