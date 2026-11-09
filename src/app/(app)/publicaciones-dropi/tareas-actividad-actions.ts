"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import * as motor from "@/lib/comentarios/servidor";
import type { AdjuntoSubido, DatosActividad } from "@/lib/comentarios/tipos";
import { tareaVisiblePara } from "@/lib/publicaciones/tareas";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

// La Actividad de una tarea de Gestión de IDs Dropi (8 nov 2026, pedido de Alcides; migración 0256), como la de Compras: comentarios con archivos, respuestas,
// reacciones y @menciones, y los cambios de la tarea (de la auditoría de su publicación). Cada acción revisa el módulo, el país y que la persona vea la tarea
// (`tareaVisiblePara`) antes de llamar al motor común.

const MODULO = "publicaciones-dropi";
const CFG: motor.ConfigComentarios = {
  comentarios: "dropi_tarea_comentarios",
  adjuntos: "dropi_tarea_adjuntos",
  reacciones: "dropi_tarea_comentario_reacciones",
  fk: "tarea_id",
  bucket: "publicaciones-dropi",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const faltaMigracion = "Falta correr en Supabase la migración 0256 para comentar en las tareas.";
const ACCIONES_TAREA = ["crear_tarea_publicacion", "editar_tarea_publicacion", "resolver_tarea_publicacion", "eliminar_comentario_tarea"];

type Tarea = { id: string; titulo: string; publicacionId: string };

async function permitida(id: string, usuario: { id: string; paisesPermitidos: string[] | null }): Promise<Tarea | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("dropi_publicaciones_tareas").select("id, titulo, publicacion_id, responsable_id, creado_por, dropi_publicaciones!inner(pais_id)").eq("id", id).maybeSingle();
  if (!data) return null;
  const pub = data.dropi_publicaciones as { pais_id: string } | { pais_id: string }[];
  const paisId = Array.isArray(pub) ? pub[0]?.pais_id : pub?.pais_id;
  if (!paisId || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, paisId))) return null;
  const { data: otros } = await supabase.from("dropi_tareas_responsables").select("persona_id").eq("tarea_id", id);
  const visible = tareaVisiblePara({ responsableId: (data.responsable_id as string | null) ?? null, otrosIds: (otros ?? []).map((o) => o.persona_id as string), creadoPor: (data.creado_por as string | null) ?? null }, usuario.id);
  return visible ? { id: data.id as string, titulo: data.titulo as string, publicacionId: data.publicacion_id as string } : null;
}

const persona = (u: { id: string; nombre: string | null; email: string }) => ({ id: u.id, nombre: u.nombre || u.email });
const aviso = (t: Tarea) => async () => ({ donde: `la tarea «${t.titulo}»`, href: "/publicaciones-dropi/tareas" });

/** Comentarios y cambios de una tarea. Basta poder abrir el módulo y ver la tarea. */
export async function obtenerActividadTarea(id: string): Promise<DatosActividad | { error: string }> {
  const usuario = await requireModulo(MODULO);
  const t = await permitida(id, usuario);
  if (!t) return { error: "Tarea no válida." };
  const supabase = createServiceClient();
  const [comentarios, auditoria] = await Promise.all([
    motor.leerComentarios(CFG, id, usuario.id),
    // Los cambios de la tarea quedan en la auditoría de su publicación, con el título de la tarea en el detalle.
    supabase
      .from("historial_auditoria")
      .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
      .eq("entidad", "dropi_publicaciones")
      .eq("entidad_id", t.publicacionId)
      .in("accion", ACCIONES_TAREA)
      .order("creado_en", { ascending: false })
      .limit(300),
  ]);
  if (auditoria.error) return { error: "No se pudo cargar la actividad." };
  const deEsta = (detalle: string | null) => !!detalle && (detalle.includes(`Tarea «${t.titulo}»`) || detalle.startsWith(`Tarea: ${t.titulo}`) || detalle.includes(`[${t.id}]`));
  const eventos = (auditoria.data ?? [])
    .filter((e) => deEsta(e.detalle as string | null))
    .map((e) => ({
      id: e.id as string,
      campo: e.accion as string,
      antes: null,
      despues: null,
      ocurridoEn: e.creado_en as string,
      autor: (e.usuario_nombre as string | null) ?? null,
      origen: "sistema",
      texto: formatearEventoAuditoria({ ...e, usuario_nombre: null } as never),
    }));
  return { comentarios: "error" in comentarios ? [] : comentarios.comentarios, adjuntos: [], eventos };
}

export async function comentarTarea(id: string, texto: string, menciones: string[] = [], adjuntos: AdjuntoSubido[] = [], respuestaA: string | null = null): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const t = await permitida(id, usuario);
  if (!t) return { error: "Tarea no válida." };
  const r = await motor.comentar(CFG, persona(usuario), id, texto, menciones, adjuntos, respuestaA, aviso(t));
  return r.error === "No se pudo guardar el comentario." ? { error: `${r.error} ${faltaMigracion}` } : r;
}

async function comentarioPermitido(comentarioId: string, usuario: { id: string; paisesPermitidos: string[] | null }) {
  const c = await motor.comentarioDe(CFG, comentarioId);
  if (!c) return null;
  const t = await permitida(c.entidadId, usuario);
  return t ? { c, t } : null;
}

export async function editarComentarioTarea(comentarioId: string, texto: string, menciones: string[] = [], archivos: { quitar?: string[]; agregar?: AdjuntoSubido[] } = {}): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const x = await comentarioPermitido(comentarioId, usuario);
  if (!x) return { error: "El comentario ya no existe." };
  return motor.editar(CFG, persona(usuario), comentarioId, texto, menciones, archivos, aviso(x.t));
}

export async function eliminarComentarioTarea(comentarioId: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const x = await comentarioPermitido(comentarioId, usuario);
  if (!x) return { error: "El comentario ya no existe." };
  const r = await motor.eliminar(CFG, persona(usuario), comentarioId);
  if (r.error) return { error: r.error };
  await registrarAuditoria({
    accion: "eliminar_comentario_tarea",
    entidad: "dropi_publicaciones",
    entidadId: x.t.publicacionId,
    detalle: `Tarea «${x.t.titulo}»: ${(r.texto ?? "").slice(0, 200) || "(solo archivos)"}${r.archivos ? ` · ${r.archivos} archivo${r.archivos === 1 ? "" : "s"}` : ""}`,
  });
  return {};
}

export async function reaccionarComentarioTarea(comentarioId: string, emoji: string) {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await comentarioPermitido(comentarioId, usuario))) return { error: "El comentario ya no existe." };
  return motor.reaccionar(CFG, persona(usuario), comentarioId, emoji);
}

export async function prepararSubidaComentarioTarea(id: string, nombreArchivo: string) {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await permitida(id, usuario))) return { error: "Tarea no válida." };
  return motor.prepararSubida(CFG, id, nombreArchivo);
}

export async function descartarSubidaComentarioTarea(id: string, ruta: string): Promise<void> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await permitida(id, usuario))) return;
  await motor.descartarSubida(CFG, id, ruta);
}
