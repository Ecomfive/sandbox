// Avisos de Cierre y control (migraciones 0927 y 0928), del lado del servidor: el aviso personal al responsable de una
// tarea del cierre (Centro de notificaciones › «Para ti»), las alertas de tareas atrasadas y las del calendario fiscal
// (`fin_alertas`, se ven en «Necesita tu atención» del Panel financiero). Las llaman las tareas programadas diarias
// (`src/lib/tareas/ejecutar.ts`) y las acciones del cierre. Lo que decide es puro (`cierre-control.ts`,
// `calendario-fiscal.ts`). Sin las migraciones, no hace nada y no falla.

import type { SupabaseClient } from "@supabase/supabase-js";
import { atrasoTarea, avisoPendiente, fechaObjetivo, textoPlazo, type ConfigCierre } from "./cierre-control";
import { alertasFiscales, filasCalendario, type Obligacion, type Presentacion } from "./calendario-fiscal";
import { nombreMes, type TareaCierre } from "./cierre";

const recortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Un aviso «Para ti» a una persona (tipo «cierre»). Si no se puede guardar, sigue. */
export async function notificarPersona(
  supabase: SupabaseClient,
  aviso: { usuarioId: string; titulo: string; texto: string; href: string; autorId?: string | null; autorNombre?: string | null },
): Promise<boolean> {
  const { error } = await supabase.from("notificaciones_usuario").insert({
    usuario_id: aviso.usuarioId,
    tipo: "cierre",
    titulo: recortar(aviso.titulo, 300),
    texto: recortar(aviso.texto, 600),
    href: aviso.href,
    autor_id: aviso.autorId ?? null,
    autor_nombre: aviso.autorNombre ?? null,
  });
  return !error;
}

/**
 * Las tareas de un cierre abierto contra su fecha límite: deja una alerta por tarea atrasada (y resuelve las que ya no
 * lo están) y avisa a su responsable cuando la tarea pasa a «por vencer» o a «vencida».
 */
export async function avisarTareasCierre(
  supabase: SupabaseClient,
  cierre: { id: string; periodo: string },
  tareas: Pick<TareaCierre, "clave" | "titulo" | "color">[],
  hoy: string,
  config: ConfigCierre,
): Promise<{ atrasadas: number; avisos: number }> {
  const { data, error } = await supabase
    .from("fin_cierre_tareas")
    .select("clave, responsable_id, fecha_limite, aviso_estado")
    .eq("cierre_id", cierre.id);
  if (error) return { atrasadas: 0, avisos: 0 };
  const guardadas = new Map((data ?? []).map((t) => [t.clave as string, t]));
  const objetivo = fechaObjetivo(cierre.periodo, config.diaHabil);
  const mesTxt = cierre.periodo.slice(0, 7);
  const href = `/cierre-mes/${mesTxt}`;
  const ahora = new Date().toISOString();
  const alertas: Record<string, unknown>[] = [];
  let avisos = 0;
  for (const t of tareas) {
    const g = guardadas.get(t.clave);
    const limite = (g?.fecha_limite as string | null)?.slice(0, 10) ?? objetivo;
    const a = atrasoTarea(t.color === "verde", limite, hoy);
    if (a.atraso === "vencida") {
      alertas.push({
        clave: `cierre-tarea:${mesTxt}:${t.clave}`,
        tipo: "cierre_tarea_atrasada",
        severidad: a.dias <= -3 ? "critica" : "aviso",
        mensaje: recortar(`${nombreMes(cierre.periodo)}: «${t.titulo}» ${textoPlazo(a).toLowerCase()}`, 500),
        enlace: href,
        modulo: "cierre-mes",
        monto: null,
        actualizada: ahora,
        resuelta_en: null,
      });
    }
    const responsable = (g?.responsable_id as string | null) ?? null;
    const aviso = avisoPendiente(a.atraso, (g?.aviso_estado as string | null) ?? null);
    if (aviso && responsable) {
      const ok = await notificarPersona(supabase, {
        usuarioId: responsable,
        titulo: aviso === "vencida" ? `Tarea del cierre atrasada: ${t.titulo}` : `Tarea del cierre por vencer: ${t.titulo}`,
        texto: `${nombreMes(cierre.periodo)} · ${textoPlazo(a)}`,
        href,
      });
      if (ok) {
        avisos++;
        await supabase.from("fin_cierre_tareas").update({ aviso_estado: aviso, aviso_en: ahora }).eq("cierre_id", cierre.id).eq("clave", t.clave);
      }
    } else if ((a.atraso === "resuelta" || a.atraso === "en_plazo") && g?.aviso_estado) {
      await supabase.from("fin_cierre_tareas").update({ aviso_estado: null }).eq("cierre_id", cierre.id).eq("clave", t.clave);
    }
  }
  if (alertas.length) await supabase.from("fin_alertas").upsert(alertas, { onConflict: "clave" });
  const abiertas = await supabase.from("fin_alertas").select("clave").eq("tipo", "cierre_tarea_atrasada").like("clave", `cierre-tarea:${mesTxt}:%`).is("resuelta_en", null);
  const vigentes = new Set(alertas.map((x) => x.clave as string));
  const resolver = (abiertas.data ?? []).map((x) => x.clave as string).filter((c) => !vigentes.has(c));
  if (resolver.length) await supabase.from("fin_alertas").update({ resuelta_en: ahora }).in("clave", resolver);
  return { atrasadas: alertas.length, avisos };
}

/** Resuelve las alertas de tareas atrasadas de un mes (al cerrarlo). */
export async function resolverAlertasCierre(supabase: SupabaseClient, periodo: string): Promise<void> {
  await supabase
    .from("fin_alertas")
    .update({ resuelta_en: new Date().toISOString() })
    .eq("tipo", "cierre_tarea_atrasada")
    .like("clave", `cierre-tarea:${periodo.slice(0, 7)}:%`)
    .is("resuelta_en", null);
}

// ---------------------------------------------------------------------------------------------
// Calendario fiscal
// ---------------------------------------------------------------------------------------------
export const SIN_MIGRACION_FISCAL = "Falta correr la migración 0928 (calendario fiscal) en Supabase.";

export async function cargarCalendario(supabase: SupabaseClient): Promise<{ error: string } | { obligaciones: Obligacion[]; presentaciones: Presentacion[] }> {
  const [o, p] = await Promise.all([
    supabase.from("fin_obligaciones_fiscales").select("id, clave, nombre, entidad, periodicidad, dia, mes, anio_siguiente, dias_aviso, activo").order("orden"),
    supabase.from("fin_obligaciones_presentadas").select("obligacion_id, periodo, presentado_en, referencia, monto").gte("periodo", `${new Date().getUTCFullYear() - 3}-01-01`),
  ]);
  if (o.error || p.error) return { error: SIN_MIGRACION_FISCAL };
  return {
    obligaciones: (o.data ?? []).map((x) => ({
      id: x.id as string,
      clave: x.clave as string,
      nombre: x.nombre as string,
      entidad: (x.entidad as string | null) ?? null,
      periodicidad: x.periodicidad as Obligacion["periodicidad"],
      dia: Number(x.dia),
      mes: x.mes === null ? null : Number(x.mes),
      anioSiguiente: Boolean(x.anio_siguiente),
      diasAviso: Number(x.dias_aviso),
      activo: Boolean(x.activo),
    })),
    presentaciones: (p.data ?? []).map((x) => ({
      obligacionId: x.obligacion_id as string,
      periodo: String(x.periodo).slice(0, 10),
      presentadoEn: String(x.presentado_en).slice(0, 10),
      referencia: (x.referencia as string | null) ?? null,
      monto: x.monto === null ? null : Number(x.monto),
    })),
  };
}

/** Las alertas del calendario fiscal de hoy (idempotente: una por obligación y período). */
export async function generarAlertasFiscales(supabase: SupabaseClient, hoy: string): Promise<{ error: string } | { activas: number; resueltas: number }> {
  const cal = await cargarCalendario(supabase);
  if ("error" in cal) return cal;
  const ahora = new Date().toISOString();
  const alertas = alertasFiscales(filasCalendario(cal.obligaciones, cal.presentaciones, hoy)).map((a) => ({
    clave: a.clave,
    tipo: "fiscal_vence",
    severidad: a.severidad,
    mensaje: recortar(a.mensaje, 500),
    enlace: "/cierre-mes/calendario-fiscal",
    modulo: "cierre-mes",
    monto: null,
    actualizada: ahora,
    resuelta_en: null,
  }));
  if (alertas.length) {
    const { error } = await supabase.from("fin_alertas").upsert(alertas, { onConflict: "clave" });
    if (error) return { error: `No se pudieron guardar las alertas fiscales: ${error.message}` };
  }
  const abiertas = await supabase.from("fin_alertas").select("clave").eq("tipo", "fiscal_vence").is("resuelta_en", null);
  const vigentes = new Set(alertas.map((a) => a.clave));
  const resolver = (abiertas.data ?? []).map((x) => x.clave as string).filter((c) => !vigentes.has(c));
  if (resolver.length) await supabase.from("fin_alertas").update({ resuelta_en: ahora }).in("clave", resolver);
  return { activas: alertas.length, resueltas: resolver.length };
}
