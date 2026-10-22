"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import * as motor from "@/lib/comentarios/servidor";
import type { AdjuntoSubido, DatosActividad } from "@/lib/comentarios/tipos";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

// La Actividad de una publicación de Gestión de IDs Dropi (migración 0132): comentarios con archivos, respuestas, reacciones y
// @menciones, y los cambios de la auditoría. Cada acción revisa el permiso del módulo y que la publicación sea de un país que la
// persona ve ANTES de llamar al motor común (`@/lib/comentarios/servidor`). Devuelven el error como valor.

const MODULO = "publicaciones-dropi";
const CFG: motor.ConfigComentarios = {
  comentarios: "dropi_publicacion_comentarios",
  adjuntos: "dropi_publicacion_adjuntos",
  reacciones: "dropi_publicacion_comentario_reacciones",
  fk: "publicacion_id",
  bucket: "publicaciones-dropi",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const faltaMigracion = "Falta correr en Supabase la migración 0132 para comentar en las publicaciones.";

async function permitida(id: string, permitidos: string[] | null): Promise<{ id: string; nombre: string; numero: number | null } | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("dropi_publicaciones").select("id, nombre, pais_id").eq("id", id).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, permitidos, data.pais_id as string))) return null;
  const { data: n } = await supabase.from("dropi_publicaciones").select("numero").eq("id", id).maybeSingle();
  return { id: data.id as string, nombre: data.nombre as string, numero: n?.numero === undefined || n?.numero === null ? null : Number(n.numero) };
}

const persona = (u: { id: string; nombre: string | null; email: string }) => ({ id: u.id, nombre: u.nombre || u.email });

/** El título y el enlace de los avisos de @mención y de respuesta: abren la publicación. */
const aviso = (p: { id: string; nombre: string; numero: number | null }) => async () => ({
  donde: `la publicación ${numeroPublicacion(p.numero)} · ${p.nombre}`,
  href: `/publicaciones-dropi?abrir=${p.id}`,
});

/** Comentarios (con archivos y reacciones) y los cambios de la auditoría de una publicación. Basta poder abrir el módulo. */
export async function obtenerActividadPublicacion(id: string): Promise<DatosActividad | { error: string }> {
  const usuario = await requireModulo(MODULO);
  if (!(await permitida(id, usuario.paisesPermitidos))) return { error: "Publicación no válida." };
  const [comentarios, auditoria] = await Promise.all([
    motor.leerComentarios(CFG, id, usuario.id),
    createServiceClient()
      .from("historial_auditoria")
      .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
      .eq("entidad", "dropi_publicaciones")
      .eq("entidad_id", id)
      .order("creado_en", { ascending: false })
      .limit(300),
  ]);
  if (auditoria.error) return { error: "No se pudo cargar la actividad." };
  const eventos = (auditoria.data ?? [])
    // Lo de los comentarios ya se ve como comentario: su eliminación sí queda como cambio.
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
  // Sin la migración 0132 la actividad se ve igual, solo con los cambios.
  return { comentarios: "error" in comentarios ? [] : comentarios.comentarios, adjuntos: [], eventos };
}

export async function comentarPublicacion(id: string, texto: string, menciones: string[] = [], adjuntos: AdjuntoSubido[] = [], respuestaA: string | null = null): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const p = await permitida(id, usuario.paisesPermitidos);
  if (!p) return { error: "Publicación no válida." };
  const r = await motor.comentar(CFG, persona(usuario), id, texto, menciones, adjuntos, respuestaA, aviso(p));
  return r.error === "No se pudo guardar el comentario." ? { error: `${r.error} ${faltaMigracion}` } : r;
}

/** Revisa que el comentario sea de una publicación que la persona ve. */
async function comentarioPermitido(comentarioId: string, permitidos: string[] | null) {
  const c = await motor.comentarioDe(CFG, comentarioId);
  if (!c) return null;
  const p = await permitida(c.entidadId, permitidos);
  return p ? { c, p } : null;
}

export async function editarComentarioPublicacion(comentarioId: string, texto: string, menciones: string[] = [], archivos: { quitar?: string[]; agregar?: AdjuntoSubido[] } = {}): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const x = await comentarioPermitido(comentarioId, usuario.paisesPermitidos);
  if (!x) return { error: "El comentario ya no existe." };
  return motor.editar(CFG, persona(usuario), comentarioId, texto, menciones, archivos, aviso(x.p));
}

export async function eliminarComentarioPublicacion(comentarioId: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const x = await comentarioPermitido(comentarioId, usuario.paisesPermitidos);
  if (!x) return { error: "El comentario ya no existe." };
  const r = await motor.eliminar(CFG, persona(usuario), comentarioId);
  if (r.error) return { error: r.error };
  await registrarAuditoria({
    accion: "eliminar_comentario_publicacion",
    entidad: "dropi_publicaciones",
    entidadId: x.p.id,
    detalle: `${(r.texto ?? "").slice(0, 200) || "(solo archivos)"}${r.archivos ? ` · ${r.archivos} archivo${r.archivos === 1 ? "" : "s"}` : ""}`,
  });
  return {};
}

export async function reaccionarComentarioPublicacion(comentarioId: string, emoji: string) {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await comentarioPermitido(comentarioId, usuario.paisesPermitidos))) return { error: "El comentario ya no existe." };
  return motor.reaccionar(CFG, persona(usuario), comentarioId, emoji);
}

export async function prepararSubidaComentarioPublicacion(id: string, nombreArchivo: string) {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await permitida(id, usuario.paisesPermitidos))) return { error: "Publicación no válida." };
  return motor.prepararSubida(CFG, id, nombreArchivo);
}

export async function descartarSubidaComentarioPublicacion(id: string, ruta: string): Promise<void> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!(await permitida(id, usuario.paisesPermitidos))) return;
  await motor.descartarSubida(CFG, id, ruta);
}
