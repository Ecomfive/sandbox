"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import * as motor from "@/lib/comentarios/servidor";
import type { AdjuntoSubido, DatosActividad } from "@/lib/comentarios/tipos";
import { MODULO_ATENCION } from "@/lib/crm/areas";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerLineaDeTiempo } from "./actions";

// La Actividad de un dropshipper (migración 0184, 29 oct 2026), como la de Compras: comentarios con archivos, respuestas, reacciones y
// @menciones, y debajo los cambios de siempre (notas, casos, seguimientos y la auditoría) de `obtenerLineaDeTiempo`, que ya filtra por
// área: Atención no ve lo comercial. Los comentarios los ve todo el que abre el CRM (lo privado de Comercial va en «Nota comercial»).
// Cada acción revisa el permiso del módulo y que el dropshipper exista ANTES de llamar al motor común. Devuelven el error como valor.

const CFG: motor.ConfigComentarios = {
  comentarios: "dropshipper_comentarios",
  adjuntos: "dropshipper_adjuntos",
  reacciones: "dropshipper_comentario_reacciones",
  fk: "dropshipper_id",
  bucket: "crm-dropshippers",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const faltaMigracion = "Falta correr en Supabase la migración 0184 para comentar en el CRM.";

async function permitido(id: string): Promise<{ id: string; nombre: string } | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data } = await createServiceClient().from("dropshippers").select("id, nombre").eq("id", id).maybeSingle();
  return data ? { id: data.id as string, nombre: data.nombre as string } : null;
}

const persona = (u: { id: string; nombre: string | null; email: string }) => ({ id: u.id, nombre: u.nombre || u.email });

/** El título y el enlace de los avisos de @mención y de respuesta: abren la ficha del dropshipper en el CRM. */
const aviso = (d: { id: string; nombre: string }) => async () => ({ donde: `el dropshipper ${d.nombre}`, href: `/crm-dropshippers?abrir=${d.id}` });

/** Comentarios (con archivos y reacciones) y los cambios del dropshipper que la persona puede ver. Basta poder abrir el CRM. */
export async function obtenerActividadDropshipper(id: string): Promise<DatosActividad | { error: string }> {
  const usuario = await requireModulo(MODULO_ATENCION);
  if (!(await permitido(id))) return { error: "Dropshipper no válido." };
  const [comentarios, linea] = await Promise.all([motor.leerComentarios(CFG, id, usuario.id), obtenerLineaDeTiempo(id)]);
  if ("error" in linea) return { error: linea.error };
  const eventos = linea.items.map((i) => ({ id: i.id, campo: "linea", antes: null, despues: null, ocurridoEn: i.creadoEn, autor: null, origen: "sistema", texto: i.texto }));
  // Sin la migración 0184 la actividad se ve igual, solo con los cambios.
  return { comentarios: "error" in comentarios ? [] : comentarios.comentarios, adjuntos: [], eventos };
}

export async function comentarDropshipper(id: string, texto: string, menciones: string[] = [], adjuntos: AdjuntoSubido[] = [], respuestaA: string | null = null): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO_ATENCION);
  const d = await permitido(id);
  if (!d) return { error: "Dropshipper no válido." };
  const r = await motor.comentar(CFG, persona(usuario), id, texto, menciones, adjuntos, respuestaA, aviso(d));
  return r.error === "No se pudo guardar el comentario." ? { error: `${r.error} ${faltaMigracion}` } : r;
}

/** Revisa que el comentario sea de un dropshipper que existe. */
async function comentarioPermitido(comentarioId: string) {
  const c = await motor.comentarioDe(CFG, comentarioId);
  if (!c) return null;
  const d = await permitido(c.entidadId);
  return d ? { c, d } : null;
}

export async function editarComentarioDropshipper(comentarioId: string, texto: string, menciones: string[] = [], archivos: { quitar?: string[]; agregar?: AdjuntoSubido[] } = {}): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO_ATENCION);
  const x = await comentarioPermitido(comentarioId);
  if (!x) return { error: "El comentario ya no existe." };
  return motor.editar(CFG, persona(usuario), comentarioId, texto, menciones, archivos, aviso(x.d));
}

export async function eliminarComentarioDropshipper(comentarioId: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO_ATENCION);
  const x = await comentarioPermitido(comentarioId);
  if (!x) return { error: "El comentario ya no existe." };
  const r = await motor.eliminar(CFG, persona(usuario), comentarioId);
  if (r.error) return { error: r.error };
  await registrarAuditoria({
    accion: "eliminar_comentario_dropshipper",
    entidad: "dropshippers",
    entidadId: x.d.id,
    detalle: `${(r.texto ?? "").slice(0, 200) || "(solo archivos)"}${r.archivos ? ` · ${r.archivos} archivo${r.archivos === 1 ? "" : "s"}` : ""}`,
  });
  return {};
}

export async function reaccionarComentarioDropshipper(comentarioId: string, emoji: string) {
  const usuario = await requireModuloEscritura(MODULO_ATENCION);
  if (!(await comentarioPermitido(comentarioId))) return { error: "El comentario ya no existe." };
  return motor.reaccionar(CFG, persona(usuario), comentarioId, emoji);
}

export async function prepararSubidaComentarioDropshipper(id: string, nombreArchivo: string) {
  await requireModuloEscritura(MODULO_ATENCION);
  if (!(await permitido(id))) return { error: "Dropshipper no válido." };
  return motor.prepararSubida(CFG, id, nombreArchivo);
}

export async function descartarSubidaComentarioDropshipper(id: string, ruta: string): Promise<void> {
  await requireModuloEscritura(MODULO_ATENCION);
  if (!(await permitido(id))) return;
  await motor.descartarSubida(CFG, id, ruta);
}
