"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { APROBAR_DESDE, cursosPara } from "@/lib/ayuda/cursos";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);
/** Quien edita los manuales: quien puede modificar Usuarios y roles (la administración). */
const MODULO_EDITOR = "usuarios";

/**
 * Corrige el examen de un curso en el servidor (las respuestas correctas nunca van al navegador) y guarda la mejor nota y,
 * si aprobó, cuándo. Devuelve la nota y qué preguntas acertó (no cuáles eran las correctas). Devuelve el error como valor.
 */
export async function completarCurso(
  cursoId: string,
  respuestas: number[],
): Promise<{ aprobado: boolean; puntaje: number; aciertos: boolean[] } | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "No hay sesión activa." };
  const curso = cursosPara(usuario.modulos).find((c) => c.id === cursoId);
  if (!curso) return { error: "Ese curso no está disponible para ti." };
  if (!Array.isArray(respuestas) || respuestas.length !== curso.examen.length) return { error: "Responde todas las preguntas." };
  const aciertos = curso.examen.map((p, i) => Number(respuestas[i]) === p.correcta);
  const puntaje = Math.round((aciertos.filter(Boolean).length / curso.examen.length) * 100);
  const aprobado = puntaje / 100 >= APROBAR_DESDE;

  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase.from("cursos_progreso").select("puntaje, intentos, completado_en").eq("usuario_id", usuario.id).eq("curso_id", cursoId).maybeSingle();
  if (errorAntes) return { error: "Falta correr la migración 0088 en Supabase para guardar el progreso." };
  const { error } = await supabase.from("cursos_progreso").upsert(
    {
      usuario_id: usuario.id,
      curso_id: cursoId,
      puntaje: Math.max(puntaje, Number(antes?.puntaje ?? 0)),
      intentos: Number(antes?.intentos ?? 0) + 1,
      completado_en: antes?.completado_en ?? (aprobado ? new Date().toISOString() : null),
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "usuario_id,curso_id" },
  );
  if (error) return { error: "No se pudo guardar el resultado." };
  revalidatePath("/ayuda");
  return { aprobado, puntaje, aciertos };
}

const MODULOS_VALIDOS = /^[a-z0-9-]{2,40}$/;

/** Crea o edita un manual de proceso (solo la administración). Devuelve el id o el error como valor. */
export async function guardarManual(datos: { id?: string | null; titulo: string; contenido: string; modulos: string[]; borrador: boolean }): Promise<{ id?: string; error?: string }> {
  const usuario = await requireModuloEscritura(MODULO_EDITOR);
  const titulo = String(datos?.titulo ?? "").trim().slice(0, 160);
  if (!titulo) return { error: "Escribe el título del manual." };
  const contenido = String(datos?.contenido ?? "").slice(0, 50_000);
  const modulos = Array.isArray(datos?.modulos) ? [...new Set(datos.modulos.map(String).filter((m) => MODULOS_VALIDOS.test(m)))] : [];
  const fila = { titulo, contenido, modulos, borrador: datos?.borrador === true, actualizado_por: usuario.nombre || usuario.email, actualizado_en: new Date().toISOString() };
  const supabase = createServiceClient();
  if (datos?.id) {
    if (!ES_ID(datos.id)) return { error: "Manual no válido." };
    const { error } = await supabase.from("manuales_proceso").update(fila).eq("id", datos.id);
    if (error) return { error: "No se pudo guardar el manual." };
    await registrarAuditoria({ accion: "editar_manual", entidad: "manuales_proceso", entidadId: datos.id, detalle: titulo });
    revalidatePath("/ayuda/manuales");
    return { id: datos.id };
  }
  const { data, error } = await supabase.from("manuales_proceso").insert(fila).select("id").single();
  if (error || !data) return { error: error?.message.includes("manuales_proceso") ? "Falta correr la migración 0088 en Supabase." : "No se pudo crear el manual." };
  await registrarAuditoria({ accion: "crear_manual", entidad: "manuales_proceso", entidadId: data.id, detalle: titulo });
  revalidatePath("/ayuda/manuales");
  return { id: data.id as string };
}

/** Borra un manual (solo la administración). */
export async function eliminarManual(id: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO_EDITOR);
  if (!ES_ID(id)) return { error: "Manual no válido." };
  const supabase = createServiceClient();
  const { data } = await supabase.from("manuales_proceso").select("titulo").eq("id", id).maybeSingle();
  const { error } = await supabase.from("manuales_proceso").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar el manual." };
  await registrarAuditoria({ accion: "eliminar_manual", entidad: "manuales_proceso", entidadId: id, detalle: (data?.titulo as string) ?? id });
  revalidatePath("/ayuda/manuales");
  return {};
}
