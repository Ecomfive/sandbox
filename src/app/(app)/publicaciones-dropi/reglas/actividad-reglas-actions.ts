"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import * as motor from "@/lib/comentarios/servidor";
import type { AdjuntoSubido, DatosActividad } from "@/lib/comentarios/tipos";
import { REGLAS_ID } from "@/lib/publicaciones/reglas";
import { createServiceClient } from "@/lib/supabase/server";

// La Actividad de la pestaña Reglas de Gestión de IDs Dropi (8 nov 2026, pedido de Alcides; migración 0253): comentarios con archivos, respuestas,
// reacciones y @menciones, y los cambios de la auditoría (reglas, indicaciones para la IA e imágenes modelo). Las reglas son una sola para todo el
// sistema, así que los comentarios cuelgan de un id fijo (`REGLAS_ID`). Cada acción revisa el permiso del módulo antes de llamar al motor común.

const MODULO = "publicaciones-dropi";
const CFG: motor.ConfigComentarios = {
  comentarios: "dropi_reglas_comentarios",
  adjuntos: "dropi_reglas_adjuntos",
  reacciones: "dropi_reglas_comentario_reacciones",
  fk: "reglas_id",
  bucket: "publicaciones-dropi",
};
const faltaMigracion = "Falta correr en Supabase la migración 0253 para comentar en las reglas.";
/** Lo que cambia en la pestaña Reglas fuera de los umbrales: indicaciones para la IA e imágenes modelo (se guardan con la entidad de las publicaciones). */
const ACCIONES_DE_REGLAS = ["editar_indicaciones_ia", "crear_estilo_imagen_ia", "editar_estilo_imagen_ia", "eliminar_estilo_imagen_ia"];

const persona = (u: { id: string; nombre: string | null; email: string }) => ({ id: u.id, nombre: u.nombre || u.email });
const esReglas = (id: string) => id === REGLAS_ID;
const aviso = async () => ({ donde: "las reglas de Gestión de IDs Dropi", href: "/publicaciones-dropi/reglas" });

/** Comentarios y cambios de las reglas. Basta poder abrir el módulo. */
export async function obtenerActividadReglas(id: string): Promise<DatosActividad | { error: string }> {
  const usuario = await requireModulo(MODULO);
  if (!esReglas(id)) return { error: "No válido." };
  const supabase = createServiceClient();
  const [comentarios, reglas, ia] = await Promise.all([
    motor.leerComentarios(CFG, id, usuario.id),
    supabase.from("historial_auditoria").select("id, accion, usuario_nombre, detalle, antes, despues, creado_en").eq("entidad", "dropi_publicaciones_reglas").order("creado_en", { ascending: false }).limit(300),
    supabase.from("historial_auditoria").select("id, accion, usuario_nombre, detalle, antes, despues, creado_en").eq("entidad", "dropi_publicaciones").in("accion", ACCIONES_DE_REGLAS).order("creado_en", { ascending: false }).limit(200),
  ]);
  if (reglas.error || ia.error) return { error: "No se pudo cargar la actividad." };
  const eventos = [...(reglas.data ?? []), ...(ia.data ?? [])].map((e) => ({
    id: e.id as string,
    campo: e.accion as string,
    antes: null,
    despues: null,
    ocurridoEn: e.creado_en as string,
    autor: (e.usuario_nombre as string | null) ?? null,
    origen: "sistema",
    texto: formatearEventoAuditoria({ ...e, usuario_nombre: null } as never),
  }));
  // Sin la migración 0253 se ve igual, solo con los cambios.
  return { comentarios: "error" in comentarios ? [] : comentarios.comentarios, adjuntos: [], eventos };
}

export async function comentarReglas(id: string, texto: string, menciones: string[] = [], adjuntos: AdjuntoSubido[] = [], respuestaA: string | null = null): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!esReglas(id)) return { error: "No válido." };
  const r = await motor.comentar(CFG, persona(usuario), id, texto, menciones, adjuntos, respuestaA, aviso);
  return r.error === "No se pudo guardar el comentario." ? { error: `${r.error} ${faltaMigracion}` } : r;
}

async function comentarioDeReglas(comentarioId: string) {
  const c = await motor.comentarioDe(CFG, comentarioId);
  return c && esReglas(c.entidadId) ? c : null;
}

export async function editarComentarioReglas(comentarioId: string, texto: string, menciones: string[] = [], archivos: { quitar?: string[]; agregar?: AdjuntoSubido[] } = {}): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await comentarioDeReglas(comentarioId))) return { error: "El comentario ya no existe." };
  return motor.editar(CFG, persona(usuario), comentarioId, texto, menciones, archivos, aviso);
}

export async function eliminarComentarioReglas(comentarioId: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await comentarioDeReglas(comentarioId))) return { error: "El comentario ya no existe." };
  const r = await motor.eliminar(CFG, persona(usuario), comentarioId);
  if (r.error) return { error: r.error };
  await registrarAuditoria({
    accion: "eliminar_comentario_reglas",
    entidad: "dropi_publicaciones_reglas",
    detalle: `${(r.texto ?? "").slice(0, 200) || "(solo archivos)"}${r.archivos ? ` · ${r.archivos} archivo${r.archivos === 1 ? "" : "s"}` : ""}`,
  });
  return {};
}

export async function reaccionarComentarioReglas(comentarioId: string, emoji: string) {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await comentarioDeReglas(comentarioId))) return { error: "El comentario ya no existe." };
  return motor.reaccionar(CFG, persona(usuario), comentarioId, emoji);
}

export async function prepararSubidaComentarioReglas(id: string, nombreArchivo: string) {
  await requireModuloEscritura(MODULO);
  if (!esReglas(id)) return { error: "No válido." };
  return motor.prepararSubida(CFG, id, nombreArchivo);
}

export async function descartarSubidaComentarioReglas(id: string, ruta: string): Promise<void> {
  await requireModuloEscritura(MODULO);
  if (!esReglas(id)) return;
  await motor.descartarSubida(CFG, id, ruta);
}

