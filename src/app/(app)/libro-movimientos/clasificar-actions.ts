"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizar, reglaPara } from "@/lib/finanzas/clasificacion";
import { leerReglas } from "@/lib/finanzas/guardar-libro";
import { UNIDAD_SIN_ASIGNAR } from "@/lib/finanzas/libro-excel";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { sinAccesoARegistros, sinAccesoAUnidades, sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";

const MODULO = "libro-movimientos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 1000;

export interface Asignacion {
  id: string;
  unidad_id?: string | null;
  tipo_id?: string | null;
}

/** Comprueba que los ids de tienda y tipo existan (no se confía en lo que manda el navegador). */
async function catalogosValidos(unidades: string[], tipos: string[]) {
  const supabase = createServiceClient();
  const [u, t] = await Promise.all([
    unidades.length ? supabase.from("fin_unidades").select("id").in("id", unidades) : Promise.resolve({ data: [], error: null }),
    tipos.length ? supabase.from("fin_tipos").select("id").in("id", tipos) : Promise.resolve({ data: [], error: null }),
  ]);
  if (u.error || t.error) throw new Error("No se pudieron leer los catálogos.");
  return { unidades: new Set((u.data ?? []).map((r) => r.id as string)), tipos: new Set((t.data ?? []).map((r) => r.id as string)) };
}

/**
 * Clasifica movimientos: a cada uno le pone su tienda y/o su tipo. Queda marcado «editado a mano» para que reimportar el
 * Excel no lo pise. Sirve para aceptar sugerencias (cada fila con lo suyo) y para asignar lo mismo a varias.
 */
export async function clasificarMovimientos(asignaciones: Asignacion[]): Promise<{ error: string } | { clasificados: number }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!Array.isArray(asignaciones) || !asignaciones.length || asignaciones.length > MAX) return { error: "Nada que clasificar." };
    const limpias = asignaciones.filter(
      (a) =>
        a &&
        typeof a.id === "string" &&
        UUID.test(a.id) &&
        ((typeof a.unidad_id === "string" && UUID.test(a.unidad_id)) || (typeof a.tipo_id === "string" && UUID.test(a.tipo_id))),
    );
    if (!limpias.length) return { error: "Elige una tienda o un tipo." };
    // Tiendas permitidas: los movimientos (su tienda en la base) y la tienda que se les pone.
    const acceso =
      (await sinAccesoARegistros(createServiceClient(), "fin_movimientos", limpias.map((a) => a.id))) ??
      (await sinAccesoAUnidades(limpias.flatMap((a) => (a.unidad_id ? [a.unidad_id] : []))));
    if (acceso) return { error: acceso };
    const validos = await catalogosValidos(
      [...new Set(limpias.flatMap((a) => (a.unidad_id ? [a.unidad_id] : [])))],
      [...new Set(limpias.flatMap((a) => (a.tipo_id ? [a.tipo_id] : [])))],
    );
    // Agrupa por (tienda, tipo) para hacer una escritura por combinación, no una por fila.
    const grupos = new Map<string, { cambios: Record<string, string>; ids: string[] }>();
    for (const a of limpias) {
      const cambios: Record<string, string> = {};
      if (a.unidad_id && validos.unidades.has(a.unidad_id)) cambios.unidad_id = a.unidad_id;
      if (a.tipo_id && validos.tipos.has(a.tipo_id)) cambios.tipo_id = a.tipo_id;
      if (!Object.keys(cambios).length) continue;
      const k = `${cambios.unidad_id ?? ""}|${cambios.tipo_id ?? ""}`;
      const g = grupos.get(k) ?? { cambios, ids: [] };
      g.ids.push(a.id);
      grupos.set(k, g);
    }
    const supabase = createServiceClient();
    const ahora = new Date().toISOString();
    let clasificados = 0;
    for (const { cambios, ids } of grupos.values()) {
      for (let i = 0; i < ids.length; i += 200) {
        const parte = ids.slice(i, i + 200);
        const { error, count } = await supabase
          .from("fin_movimientos")
          .update({ ...cambios, editado_a_mano: true, editado_por: usuario.id, editado_en: ahora, actualizado_en: ahora }, { count: "exact" })
          .in("id", parte);
        if (error) return { error: `No se pudo guardar: ${error.message}` };
        clasificados += count ?? parte.length;
      }
    }
    await registrarAuditoria({
      accion: "clasificar_movimientos",
      entidad: "fin_movimientos",
      detalle: `${clasificados} movimientos clasificados`,
    });
    revalidatePath("/libro-movimientos", "layout");
    revalidatePath("/estado-resultados");
    return { clasificados };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo clasificar." };
  }
}

/** Crea una regla: si la descripción contiene `patron`, la tienda y/o el tipo son estos. */
export async function crearRegla(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const patron = normalizar(String(formData.get("patron") ?? "")).slice(0, 120);
    const unidad = String(formData.get("unidad_id") ?? "");
    const tipo = String(formData.get("tipo_id") ?? "");
    if (patron.length < 3) return { error: "El texto de la regla debe tener al menos 3 letras." };
    const unidadId = UUID.test(unidad) ? unidad : null;
    const tipoId = UUID.test(tipo) ? tipo : null;
    if (!unidadId && !tipoId) return { error: "Elige una tienda o un tipo." };
    // Con tiendas limitadas, la regla tiene que llevar a una de sus tiendas (una sin tienda cambia el libro de todos).
    const acceso = await sinAccesoAUnidades([unidadId]);
    if (acceso) return { error: acceso };
    const validos = await catalogosValidos(unidadId ? [unidadId] : [], tipoId ? [tipoId] : []);
    if ((unidadId && !validos.unidades.has(unidadId)) || (tipoId && !validos.tipos.has(tipoId))) return { error: "Tienda o tipo inválido." };
    const { error } = await createServiceClient()
      .from("fin_reglas")
      .insert({ patron, unidad_id: unidadId, tipo_id: tipoId, creado_por: usuario.id });
    if (error) return { error: error.code === "23505" ? "Ya hay una regla con ese texto." : `No se pudo crear: ${error.message}` };
    await registrarAuditoria({ accion: "crear_regla_libro", entidad: "fin_movimientos", detalle: `Regla «${patron}»` });
    revalidatePath("/libro-movimientos", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear la regla." };
  }
}

/** Activa o desactiva una regla (no se borra: los movimientos que completó la siguen nombrando). */
export async function cambiarEstadoRegla(id: string, activo: boolean): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Regla inválida." };
    const acceso = await sinAccesoARegistros(createServiceClient(), "fin_reglas", [id]);
    if (acceso) return { error: acceso };
    const { error } = await createServiceClient().from("fin_reglas").update({ activo: activo === true }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/libro-movimientos", "layout");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cambiar la regla." };
  }
}

/**
 * Aplica las reglas activas a todo lo pendiente (sin tienda o sin tipo). Solo completa lo que falta. No marca «editado a
 * mano»: al reimportar el Excel, la misma regla vuelve a completar esas filas.
 */
export async function aplicarReglasPendientes(): Promise<{ error: string } | { completados: number }> {
  try {
    await requireModuloEscritura(MODULO);
    const acceso = await sinAccesoTodaLaEmpresa();
    if (acceso) return { error: acceso };
    const supabase = createServiceClient();
    const [reglas, sin] = await Promise.all([
      leerReglas(supabase),
      supabase.from("fin_unidades").select("id").eq("nombre", UNIDAD_SIN_ASIGNAR).maybeSingle(),
    ]);
    if (!reglas.length) return { completados: 0 };
    const sinAsignar = (sin.data?.id as string | undefined) ?? null;
    const pendientes = await traerTodasConError<{ id: string; descripcion: string; unidad_id: string; tipo_id: string | null }>((d, h) =>
      supabase
        .from("fin_movimientos")
        .select("id, descripcion, unidad_id, tipo_id")
        .or(sinAsignar ? `tipo_id.is.null,unidad_id.eq.${sinAsignar}` : "tipo_id.is.null")
        .order("id")
        .range(d, h),
    );
    if (pendientes.error) return { error: "No se pudieron leer los pendientes." };
    const grupos = new Map<string, { cambios: Record<string, string>; ids: string[] }>();
    for (const m of pendientes.data ?? []) {
      const r = reglaPara(m.descripcion, reglas);
      if (!r) continue;
      const cambios: Record<string, string> = {};
      if (m.unidad_id === sinAsignar && r.unidad_id) cambios.unidad_id = r.unidad_id;
      if (!m.tipo_id && r.tipo_id) cambios.tipo_id = r.tipo_id;
      if (!Object.keys(cambios).length) continue;
      cambios.regla_id = r.id;
      const k = JSON.stringify(cambios);
      const g = grupos.get(k) ?? { cambios, ids: [] };
      g.ids.push(m.id);
      grupos.set(k, g);
    }
    let completados = 0;
    const ahora = new Date().toISOString();
    for (const { cambios, ids } of grupos.values()) {
      for (let i = 0; i < ids.length; i += 200) {
        const parte = ids.slice(i, i + 200);
        const { error } = await supabase.from("fin_movimientos").update({ ...cambios, actualizado_en: ahora }).in("id", parte);
        if (error) return { error: error.message };
        completados += parte.length;
      }
    }
    if (completados) {
      await registrarAuditoria({ accion: "clasificar_movimientos", entidad: "fin_movimientos", detalle: `${completados} completados por reglas` });
      revalidatePath("/libro-movimientos", "layout");
      revalidatePath("/estado-resultados");
    }
    return { completados };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron aplicar las reglas." };
  }
}
