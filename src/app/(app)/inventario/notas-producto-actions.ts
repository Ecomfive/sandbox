"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { eventoVisible } from "@/lib/auditoria-visible";
import { requireAlgunModulo } from "@/lib/auth";
import * as motor from "@/lib/comentarios/servidor";
import type { AdjuntoSubido, DatosActividad } from "@/lib/comentarios/tipos";
import { createServiceClient } from "@/lib/supabase/server";

// Las notas de un producto (migración 0250, 7 nov 2026, pedido de Hernán): en la ficha del inventario, también desde el
// Levantamiento. Comentarios con archivos, respuestas, reacciones y @menciones, y debajo los cambios del producto (correcciones,
// cambios de estado, nombre…) de la auditoría. Las ve quien abre Inventario o Producto; escribe quien puede modificar uno de los dos.
// Cada acción revisa el permiso y que el producto exista ANTES de llamar al motor común. Devuelven el error como valor.

const CFG: motor.ConfigComentarios = {
  comentarios: "sku_comentarios",
  adjuntos: "sku_adjuntos",
  reacciones: "sku_comentario_reacciones",
  fk: "sku_maestro_id",
  bucket: "producto-notas",
};
const MODULOS = ["inventario", "producto"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const faltaMigracion = "Falta correr en Supabase la migración 0250 para escribir notas en los productos.";

async function permitido(id: string): Promise<{ id: string; codigo: string } | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data } = await createServiceClient().from("skus_maestros").select("id, codigo").eq("id", id).maybeSingle();
  return data ? { id: data.id as string, codigo: data.codigo as string } : null;
}

const persona = (u: { id: string; nombre: string | null; email: string }) => ({ id: u.id, nombre: u.nombre || u.email });

/** El título y el enlace de los avisos de @mención y de respuesta: abren la ficha del producto en el inventario. */
const aviso = (p: { id: string; codigo: string }) => async () => ({ donde: `el producto ${p.codigo}`, href: `/inventario?abrir=${p.id}` });

/** Notas (con archivos y reacciones) y los cambios del producto. Basta poder abrir Inventario o Producto. */
export async function obtenerNotasProducto(id: string): Promise<DatosActividad | { error: string }> {
  const usuario = await requireAlgunModulo(MODULOS);
  if (!(await permitido(id))) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const [comentarios, auditoria] = await Promise.all([
    motor.leerComentarios(CFG, id, usuario.id),
    supabase
      .from("historial_auditoria")
      .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
      .eq("entidad", "skus_maestros")
      .eq("entidad_id", id)
      .order("creado_en", { ascending: false })
      .limit(30),
  ]);
  // Como en la ficha de Producto: con países limitados, lo de otros países no se muestra.
  let cambios = auditoria.data ?? [];
  if (usuario.paisesPermitidos !== null) {
    const { data: paises } = await supabase.from("paises").select("codigo, nombre");
    cambios = cambios.filter((e) => eventoVisible({ ...e, entidad: "skus_maestros", entidad_id: id }, usuario, () => undefined, (paises ?? []) as { codigo: string; nombre: string }[]));
  }
  // Quién lo hizo va aparte (como en Compras): la línea va sin el nombre.
  const eventos = cambios.map((e) => ({ id: e.id as string, campo: e.accion as string, antes: null, despues: null, ocurridoEn: e.creado_en as string, autor: (e.usuario_nombre as string | null) ?? null, origen: "auditoria", texto: formatearEventoAuditoria({ ...e, usuario_nombre: null }) }));
  // Sin la migración 0250 se ve igual, solo con los cambios.
  return { comentarios: "error" in comentarios ? [] : comentarios.comentarios, adjuntos: [], eventos };
}

export async function comentarProducto(id: string, texto: string, menciones: string[] = [], adjuntos: AdjuntoSubido[] = [], respuestaA: string | null = null): Promise<{ error?: string }> {
  const usuario = await requireAlgunModulo(MODULOS, true);
  const p = await permitido(id);
  if (!p) return { error: "Producto no válido." };
  const r = await motor.comentar(CFG, persona(usuario), id, texto, menciones, adjuntos, respuestaA, aviso(p));
  return r.error === "No se pudo guardar el comentario." ? { error: `${r.error} ${faltaMigracion}` } : r;
}

/** Revisa que la nota sea de un producto que existe. */
async function comentarioPermitido(comentarioId: string) {
  const c = await motor.comentarioDe(CFG, comentarioId);
  if (!c) return null;
  const p = await permitido(c.entidadId);
  return p ? { c, p } : null;
}

export async function editarComentarioProducto(comentarioId: string, texto: string, menciones: string[] = [], archivos: { quitar?: string[]; agregar?: AdjuntoSubido[] } = {}): Promise<{ error?: string }> {
  const usuario = await requireAlgunModulo(MODULOS, true);
  const x = await comentarioPermitido(comentarioId);
  if (!x) return { error: "La nota ya no existe." };
  return motor.editar(CFG, persona(usuario), comentarioId, texto, menciones, archivos, aviso(x.p));
}

export async function eliminarComentarioProducto(comentarioId: string): Promise<{ error?: string }> {
  const usuario = await requireAlgunModulo(MODULOS, true);
  const x = await comentarioPermitido(comentarioId);
  if (!x) return { error: "La nota ya no existe." };
  const r = await motor.eliminar(CFG, persona(usuario), comentarioId);
  if (r.error) return { error: r.error };
  await registrarAuditoria({
    accion: "eliminar_nota_producto",
    entidad: "skus_maestros",
    entidadId: x.p.id,
    detalle: `${(r.texto ?? "").slice(0, 200) || "(solo archivos)"}${r.archivos ? ` · ${r.archivos} archivo${r.archivos === 1 ? "" : "s"}` : ""}`,
  });
  return {};
}

export async function reaccionarComentarioProducto(comentarioId: string, emoji: string) {
  const usuario = await requireAlgunModulo(MODULOS, true);
  if (!(await comentarioPermitido(comentarioId))) return { error: "La nota ya no existe." };
  return motor.reaccionar(CFG, persona(usuario), comentarioId, emoji);
}

export async function prepararSubidaComentarioProducto(id: string, nombreArchivo: string) {
  await requireAlgunModulo(MODULOS, true);
  if (!(await permitido(id))) return { error: "Producto no válido." };
  return motor.prepararSubida(CFG, id, nombreArchivo);
}

export async function descartarSubidaComentarioProducto(id: string, ruta: string): Promise<void> {
  await requireAlgunModulo(MODULOS, true);
  if (!(await permitido(id))) return;
  await motor.descartarSubida(CFG, id, ruta);
}
