"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { MAX_NOTA_CIERRE, normalizarTarea, type TareaVista } from "@/lib/publicaciones/tareas";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarTareas, deFilaManual } from "./tareas-datos";

const MODULO = "publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const falta = (m: string) => /dropi_publicaciones_tareas|does not exist|schema cache/i.test(m);
const MIGRACION = "Falta correr en Supabase la migración 0175.";
const fechaLarga = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function revalidar() {
  revalidatePath("/publicaciones-dropi");
  revalidatePath("/publicaciones-dropi/tareas");
}

/** La publicación, si existe y es de un país que la persona ve. */
async function publicacionPermitida(id: string, permitidos: string[] | null) {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("dropi_publicaciones").select("id, nombre, pais_id, numero").eq("id", id).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, permitidos, data.pais_id as string))) return null;
  return data as { id: string; nombre: string; pais_id: string; numero: number | null };
}

/**
 * Agrega una tarea a una publicación (pedido de Alcides, 28 oct 2026): qué hay que hacer, para cuándo y a quién le toca (si no se elige, a quien la
 * crea). Si le toca a otra persona, le llega el aviso «Para ti». Queda en la Actividad de la publicación.
 */
export async function crearTareaPublicacion(publicacionId: string, crudo: unknown): Promise<{ error?: string; tarea?: TareaVista }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario.paisesPermitidos);
  if (!pub) return { error: "La publicación ya no existe o no es de tus países." };
  const t = normalizarTarea(crudo);
  if ("error" in t) return { error: t.error };
  const supabase = createServiceClient();
  const responsableId = t.responsableId ?? usuario.id;
  const { data: perfil } = await supabase.from("perfiles").select("id, nombre, email, activo").eq("id", responsableId).maybeSingle();
  if (!perfil || perfil.activo === false) return { error: "La persona elegida no está activa." };
  const responsableNombre = ((perfil.nombre as string | null) || (perfil.email as string | null) || "").trim();
  const yo = usuario.nombre || usuario.email || null;
  const { data, error } = await supabase
    .from("dropi_publicaciones_tareas")
    .insert({ publicacion_id: pub.id, titulo: t.titulo, nota: t.nota, responsable_id: responsableId, responsable_nombre: responsableNombre, plazo: t.plazo, creado_por: usuario.id, creado_por_nombre: yo })
    .select("*")
    .single();
  if (error || !data) return { error: error && falta(error.message) ? MIGRACION : "No se pudo guardar la tarea." };
  await registrarAuditoria({
    accion: "crear_tarea_publicacion",
    entidad: "dropi_publicaciones",
    entidadId: pub.id,
    detalle: `Tarea: ${t.titulo}${t.plazo ? ` · para el ${fechaLarga(t.plazo)}` : ""} · le toca a ${responsableNombre}${t.nota ? ` · «${t.nota}»` : ""}`,
  });
  // Un aviso «Para ti» a quien la tiene que hacer, si no es quien la creó. Si falla, la tarea ya quedó.
  if (responsableId !== usuario.id)
    await supabase.from("notificaciones_usuario").insert({
      usuario_id: responsableId,
      tipo: "tarea",
      titulo: `Tarea en Gestión de IDs Dropi: ${t.titulo}`.slice(0, 300),
      texto: `${pub.nombre}${t.plazo ? ` · para el ${fechaLarga(t.plazo)}` : ""}${t.nota ? ` · «${t.nota}»` : ""}`.slice(0, 600),
      href: "/publicaciones-dropi/tareas",
      autor_id: usuario.id,
      autor_nombre: yo,
    });
  revalidar();
  return { tarea: deFilaManual(data as Record<string, unknown>) };
}

/** Da por hecha una tarea escrita a mano, con una nota opcional de qué se hizo. Queda en la Actividad de la publicación. */
export async function resolverTareaPublicacion(tareaId: string, nota: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof tareaId !== "string" || !UUID.test(tareaId)) return { error: "Tarea no válida." };
  const supabase = createServiceClient();
  const { data: t, error: e1 } = await supabase.from("dropi_publicaciones_tareas").select("id, publicacion_id, titulo, hecha_en, dropi_publicaciones!inner(pais_id)").eq("id", tareaId).maybeSingle();
  if (e1) return { error: falta(e1.message) ? MIGRACION : "No se pudo leer la tarea." };
  const pais = (t?.dropi_publicaciones as unknown as { pais_id: string } | null)?.pais_id;
  if (!t || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais))) return { error: "No se encontró la tarea." };
  if (t.hecha_en) return {};
  const texto = typeof nota === "string" ? nota.replace(/\s+/g, " ").trim().slice(0, MAX_NOTA_CIERRE) : "";
  const { error } = await supabase
    .from("dropi_publicaciones_tareas")
    .update({ hecha_en: new Date().toISOString(), hecha_por_nombre: usuario.nombre || usuario.email || null, hecha_nota: texto || null })
    .eq("id", tareaId)
    .is("hecha_en", null);
  if (error) return { error: "No se pudo guardar." };
  await registrarAuditoria({ accion: "resolver_tarea_publicacion", entidad: "dropi_publicaciones", entidadId: t.publicacion_id as string, detalle: `Tarea resuelta: ${t.titulo}${texto ? ` · «${texto}»` : ""}` });
  revalidar();
  return {};
}

/** Las tareas escritas a mano de una publicación (para su ficha): pendientes y hechas. Basta poder abrir el módulo. */
export async function obtenerTareasPublicacion(publicacionId: string): Promise<{ tareas: TareaVista[]; disponible: boolean } | { error: string }> {
  const usuario = await requireModulo(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario.paisesPermitidos);
  if (!pub) return { error: "Publicación no válida." };
  const { data, error } = await createServiceClient().from("dropi_publicaciones_tareas").select("*").eq("publicacion_id", pub.id).order("creado_en", { ascending: false }).limit(100);
  if (error) return falta(error.message) ? { tareas: [], disponible: false } : { error: "No se pudieron cargar las tareas." };
  return { tareas: ((data ?? []) as Record<string, unknown>[]).map(deFilaManual), disponible: true };
}

/** Cuántas tareas pendientes tiene la persona en el país de la barra (el globo de la pestaña «Tareas»). */
export async function contarMisTareasPendientes(): Promise<number | null> {
  const usuario = await requireModulo(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais.id))) return null;
  const { tareas } = await cargarTareas(supabase, pais.id, usuario.id, false);
  return tareas.filter((t) => !t.hechaEn).length;
}
