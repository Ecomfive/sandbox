"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { formatearFecha } from "@/lib/formato";
import { esAdministrador } from "@/lib/permisos/acceso";
import { etiquetaDeModulo } from "@/lib/permisos/catalogo";
import { createServiceClient } from "@/lib/supabase/server";
import { etiquetaEstado, etiquetaPrioridad, motivoNoPuede, normalizarCambio, numeroTarea, puedeVerTarea, type CambioTarea } from "@/lib/tareas/tareas";
import { aVista, COLUMNAS_TAREA, type TareaVista } from "./datos";

const MODULO = "tareas";
const RUTA = "/tareas";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr en Supabase la migración 0215 (tareas del equipo).";

/** Cada dato que cambia, en palabras, para la Actividad (antes → después). */
const VER: Record<keyof CambioTarea, [string, (v: unknown, nombres: Map<string, string>) => string]> = {
  titulo: ["Título", (v) => String(v ?? "—")],
  descripcion: ["Descripción", (v) => (v ? "con texto" : "—")],
  estado: ["Estado", (v) => etiquetaEstado(String(v))],
  prioridad: ["Prioridad", (v) => etiquetaPrioridad((v as string | null) ?? null)],
  responsableId: ["Asignada a", (v, n) => (v ? (n.get(String(v)) ?? "Otra persona") : "Sin asignar")],
  fechaInicio: ["Fecha de inicio", (v) => (v ? formatearFecha(String(v)) : "—")],
  fechaLimite: ["Fecha límite", (v) => (v ? formatearFecha(String(v)) : "—")],
  modulo: ["Módulo", (v) => (v ? etiquetaDeModulo(String(v)) : "—")],
};
const COLUMNA: Record<keyof CambioTarea, string> = {
  titulo: "titulo",
  descripcion: "descripcion",
  estado: "estado",
  prioridad: "prioridad",
  responsableId: "responsable_id",
  fechaInicio: "fecha_inicio",
  fechaLimite: "fecha_limite",
  modulo: "modulo",
};

async function nombresDe(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const { data } = await createServiceClient().from("perfiles").select("id, nombre, email").in("id", unicos);
  return new Map((data ?? []).map((p) => [String(p.id), String(p.nombre || p.email || "Sin nombre")]));
}

/** Un aviso «Para ti» a quien le asignan una tarea (si no se la asignó a sí misma). Si falla, la tarea ya quedó. */
async function avisarAsignada(tarea: TareaVista, autor: { id: string; nombre: string }) {
  if (!tarea.responsableId || tarea.responsableId === autor.id) return;
  await createServiceClient()
    .from("notificaciones_usuario")
    .insert({
      usuario_id: tarea.responsableId,
      tipo: "tarea",
      titulo: `Te asignaron una tarea: ${tarea.titulo}`.slice(0, 300),
      texto: `${numeroTarea(tarea.numero)}${tarea.fechaLimite ? ` · para el ${formatearFecha(tarea.fechaLimite)}` : ""} · de ${autor.nombre}`.slice(0, 600),
      href: `${RUTA}?abrir=${tarea.id}`,
      autor_id: autor.id,
      autor_nombre: autor.nombre,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

/**
 * Crea una tarea del equipo. Quien no es administrador solo puede crearla para sí misma (o sin asignar). Devuelve la tarea o el error como valor.
 */
export async function crearTarea(entrada: unknown): Promise<{ tarea: TareaVista } | { error: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const admin = esAdministrador(usuario);
  const leido = normalizarCambio(entrada);
  if ("error" in leido) return leido;
  const c = leido.cambio;
  if (!c.titulo) return { error: "La tarea necesita un título." };
  if (!admin && c.responsableId && c.responsableId !== usuario.id) return { error: "Solo un administrador asigna tareas a otras personas." };
  const autor = { id: usuario.id, nombre: usuario.nombre || usuario.email };
  const fila: Record<string, unknown> = { creado_por: usuario.id, creado_por_nombre: autor.nombre };
  for (const k of Object.keys(c) as (keyof CambioTarea)[]) fila[COLUMNA[k]] = c[k] ?? null;
  if (c.estado === "hecho") fila.hecha_en = new Date().toISOString();
  const { data, error } = await createServiceClient().from("tareas_equipo").insert(fila).select(COLUMNAS_TAREA).single();
  if (error || !data) return { error: error && /tareas_equipo|relation/i.test(error.message) ? FALTA : "No se pudo crear la tarea." };
  const tarea = aVista(data, await nombresDe([c.responsableId]));
  await registrarAuditoria({
    accion: "crear_tarea_equipo",
    entidad: "tareas_equipo",
    entidadId: tarea.id,
    detalle: `${numeroTarea(tarea.numero)} «${tarea.titulo}»${tarea.responsableNombre ? ` · asignada a ${tarea.responsableNombre}` : ""}`,
  });
  await avisarAsignada(tarea, autor);
  revalidatePath(RUTA);
  return { tarea };
}

/**
 * Cambia uno o varios datos de una tarea (desde la celda, el tablero o la ficha). Quien no es administrador solo toca las suyas y no se las pasa
 * a otra persona. «Hecho» guarda cuándo; otro estado lo quita. Devuelve la tarea como quedó.
 */
export async function actualizarTarea(id: string, entrada: unknown): Promise<{ tarea: TareaVista } | { error: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Tarea no válida." };
  const leido = normalizarCambio(entrada);
  if ("error" in leido) return leido;
  const c = leido.cambio;
  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase.from("tareas_equipo").select(COLUMNAS_TAREA).eq("id", id).maybeSingle();
  if (errorAntes) return { error: /tareas_equipo|relation/i.test(errorAntes.message) ? FALTA : "No se pudo leer la tarea." };
  if (!antes) return { error: "Esa tarea ya no existe." };
  const previa = { responsableId: (antes.responsable_id as string | null) ?? null, creadoPor: (antes.creado_por as string | null) ?? null };
  const persona = { id: usuario.id, admin: esAdministrador(usuario) };
  const motivo = motivoNoPuede(previa, c, persona);
  if (motivo) return { error: motivo };

  const claves = (Object.keys(c) as (keyof CambioTarea)[]).filter((k) => (c[k] ?? null) !== ((antes as Record<string, unknown>)[COLUMNA[k]] ?? null));
  const nombres = await nombresDe([previa.responsableId, c.responsableId]);
  if (!claves.length) return { tarea: aVista(antes, nombres) };
  const fila: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  for (const k of claves) fila[COLUMNA[k]] = c[k] ?? null;
  if (claves.includes("estado")) fila.hecha_en = c.estado === "hecho" ? new Date().toISOString() : null;
  const { data, error } = await supabase.from("tareas_equipo").update(fila).eq("id", id).select(COLUMNAS_TAREA).single();
  if (error || !data) return { error: "No se pudo guardar la tarea." };
  const tarea = aVista(data, nombres);
  await registrarAuditoria({
    accion: "editar_tarea_equipo",
    entidad: "tareas_equipo",
    entidadId: id,
    antes: Object.fromEntries(claves.map((k) => [VER[k][0], VER[k][1]((antes as Record<string, unknown>)[COLUMNA[k]] ?? null, nombres)])),
    despues: Object.fromEntries(claves.map((k) => [VER[k][0], VER[k][1](c[k] ?? null, nombres)])),
  });
  if (claves.includes("responsableId")) await avisarAsignada(tarea, { id: usuario.id, nombre: usuario.nombre || usuario.email });
  revalidatePath(RUTA);
  return { tarea };
}

/** La actividad de una tarea (de la más nueva a la más vieja), para su ficha. Basta poder abrir Tareas y ver esa tarea. */
export async function obtenerHistorialTarea(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  const usuario = await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Tarea no válida." };
  const supabase = createServiceClient();
  const { data: t } = await supabase.from("tareas_equipo").select("responsable_id, creado_por").eq("id", id).maybeSingle();
  if (!t || !puedeVerTarea({ responsableId: t.responsable_id as string | null, creadoPor: t.creado_por as string | null }, { id: usuario.id, admin: esAdministrador(usuario) }))
    return { error: "No se encontró la tarea." };
  const { data, error } = await supabase
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "tareas_equipo")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(40);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}

/** «Agregar tarea» (la ficha de crear del sistema manda un formulario): devuelve el error como valor. */
export async function crearTareaFormulario(f: FormData): Promise<{ error?: string }> {
  const texto = (k: string) => String(f.get(k) ?? "").trim();
  const r = await crearTarea({
    titulo: texto("titulo"),
    descripcion: texto("descripcion"),
    estado: texto("estado") || "pendiente",
    prioridad: texto("prioridad"),
    responsableId: texto("responsable_id"),
    fechaInicio: texto("fecha_inicio"),
    fechaLimite: texto("fecha_limite"),
    modulo: texto("modulo"),
  });
  return "error" in r ? { error: r.error } : {};
}
