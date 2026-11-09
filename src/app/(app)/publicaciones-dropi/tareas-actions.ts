"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { etiquetaEstado, etiquetaPrioridad, normalizarCambio, normalizarTarea, pendiente, type TareaVista } from "@/lib/publicaciones/tareas";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarTareas, COLUMNAS_0178, COLUMNAS_TAREA, deFilaManual, type PublicacionDeTarea } from "./tareas-datos";

const MODULO = "publicaciones-dropi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const falta = (m: string) => /dropi_publicaciones_tareas|does not exist|schema cache/i.test(m);
const falta0178 = (m: string) => /estado|prioridad|archivada_en|check constraint|column/i.test(m);
const MIGRACION = "Falta correr en Supabase la migración 0175.";
const MIGRACION_0178 = "Falta correr en Supabase la migración 0178 para los estados, la prioridad y archivar.";
const fechaLarga = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function revalidar() {
  revalidatePath("/publicaciones-dropi");
  revalidatePath("/publicaciones-dropi/tareas");
}

/** La publicación, si existe y es de un país que la persona ve. */
async function publicacionPermitida(id: string, permitidos: string[] | null) {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const supabase = createServiceClient();
  const { data } = await supabase.from("dropi_publicaciones").select("id, nombre, pais_id, numero, foto_url, dropi_id").eq("id", id).maybeSingle();
  if (!data || !(await puedeVerPaisId(supabase, permitidos, data.pais_id as string))) return null;
  return data as { id: string; nombre: string; pais_id: string; numero: number | null; foto_url: string | null; dropi_id: string | null };
}

/** El nombre de una persona activa, o null si no existe o no está activa. */
async function personaActiva(id: string): Promise<string | null> {
  const { data } = await createServiceClient().from("perfiles").select("nombre, email, activo").eq("id", id).maybeSingle();
  if (!data || data.activo === false) return null;
  return ((data.nombre as string | null) || (data.email as string | null) || "").trim() || "Sin nombre";
}

async function avisarResponsable(responsableId: string, usuario: { id: string; nombre?: string | null; email?: string | null }, titulo: string, texto: string) {
  if (responsableId === usuario.id) return;
  await createServiceClient()
    .from("notificaciones_usuario")
    .insert({
      usuario_id: responsableId,
      tipo: "tarea",
      titulo: `Tarea en Gestión de IDs Dropi: ${titulo}`.slice(0, 300),
      texto: texto.slice(0, 600),
      href: "/publicaciones-dropi/tareas",
      autor_id: usuario.id,
      autor_nombre: usuario.nombre || usuario.email || null,
    });
}

/**
 * Crea una tarea asociada a una publicación (pedido de Alcides, 28–29 oct 2026): qué hay que hacer, su estado (Por hacer de entrada), prioridad, para
 * cuándo y a quién le toca (si no se elige, a quien la crea). Si le toca a otra persona, le llega el aviso «Para ti». Queda en la Actividad.
 */
export async function crearTareaPublicacion(publicacionId: string, crudo: unknown): Promise<{ error?: string; tarea?: TareaVista; publicacion?: PublicacionDeTarea }> {
  const usuario = await requireModuloEscritura(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario.paisesPermitidos);
  if (!pub) return { error: "Elige el producto (la publicación) de la tarea." };
  const t = normalizarTarea(crudo);
  if ("error" in t) return { error: t.error };
  const responsableId = t.responsableId ?? usuario.id;
  const responsableNombre = await personaActiva(responsableId);
  if (!responsableNombre) return { error: "La persona elegida no está activa." };
  const yo = usuario.nombre || usuario.email || null;
  const supabase = createServiceClient();
  const base = { publicacion_id: pub.id, titulo: t.titulo, nota: t.nota, responsable_id: responsableId, responsable_nombre: responsableNombre, plazo: t.plazo, creado_por: usuario.id, creado_por_nombre: yo };
  const hecha = t.estado === "hecha" ? { hecha_en: new Date().toISOString(), hecha_por_nombre: yo } : {};
  let r = await supabase.from("dropi_publicaciones_tareas").insert({ ...base, ...hecha, estado: t.estado, prioridad: t.prioridad }).select(`${COLUMNAS_TAREA}, ${COLUMNAS_0178}`).single();
  // Sin la 0178 se guarda sin estado ni prioridad.
  if (r.error && falta0178(r.error.message) && !falta(r.error.message)) r = await supabase.from("dropi_publicaciones_tareas").insert({ ...base, ...hecha }).select(COLUMNAS_TAREA).single();
  if (r.error || !r.data) return { error: r.error && falta(r.error.message) ? MIGRACION : "No se pudo guardar la tarea." };
  await registrarAuditoria({
    accion: "crear_tarea_publicacion",
    entidad: "dropi_publicaciones",
    entidadId: pub.id,
    detalle: `Tarea: ${t.titulo}${t.plazo ? ` · para el ${fechaLarga(t.plazo)}` : ""} · le toca a ${responsableNombre}${t.prioridad ? ` · prioridad ${etiquetaPrioridad(t.prioridad).toLowerCase()}` : ""}${t.nota ? ` · «${t.nota}»` : ""}`,
  });
  await avisarResponsable(responsableId, usuario, t.titulo, `${pub.nombre}${t.plazo ? ` · para el ${fechaLarga(t.plazo)}` : ""}${t.nota ? ` · «${t.nota}»` : ""}`);
  revalidar();
  return {
    tarea: deFilaManual(r.data as unknown as Record<string, unknown>),
    publicacion: { id: pub.id, numero: pub.numero == null ? null : Number(pub.numero), nombre: pub.nombre, fotoUrl: pub.foto_url, dropiId: pub.dropi_id },
  };
}

/**
 * Cambia una tarea escrita a mano, como en ClickUp: el estado (pasar a Hecha la da por hecha; volver a otro estado la reabre), la prioridad, a quién le
 * toca (con aviso), la fecha, el título, la nota, el producto al que va asociada, o la archiva / la saca de Archivadas. Cada cambio queda en la Actividad.
 */
export async function actualizarTarea(tareaId: string, crudo: unknown): Promise<{ error?: string; tarea?: TareaVista; publicacion?: PublicacionDeTarea }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof tareaId !== "string" || !UUID.test(tareaId)) return { error: "Tarea no válida." };
  const c = normalizarCambio(crudo);
  if ("error" in c) return { error: c.error };
  const supabase = createServiceClient();
  let leida = await supabase.from("dropi_publicaciones_tareas").select(`${COLUMNAS_TAREA}, ${COLUMNAS_0178}, dropi_publicaciones!inner(pais_id, nombre)`).eq("id", tareaId).maybeSingle();
  const conEstados = !leida.error;
  if (!conEstados) leida = await supabase.from("dropi_publicaciones_tareas").select(`${COLUMNAS_TAREA}, dropi_publicaciones!inner(pais_id, nombre)` as "*").eq("id", tareaId).maybeSingle();
  if (leida.error) return { error: falta(leida.error.message) ? MIGRACION : "No se pudo leer la tarea." };
  const fila = leida.data as unknown as Record<string, unknown> | null;
  const pubActual = fila?.dropi_publicaciones as { pais_id: string; nombre: string } | undefined;
  if (!fila || !pubActual || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pubActual.pais_id))) return { error: "No se encontró la tarea." };
  const antes = deFilaManual(fila);
  if (!conEstados && (c.estado && c.estado !== "hecha" ? true : c.prioridad !== undefined || c.archivar !== undefined)) return { error: MIGRACION_0178 };

  const yo = usuario.nombre || usuario.email || null;
  const cambios: Record<string, unknown> = {};
  const lineas: string[] = [];
  let pubNueva: Awaited<ReturnType<typeof publicacionPermitida>> = null;
  if (c.titulo !== undefined && c.titulo !== antes.titulo) {
    cambios.titulo = c.titulo;
    lineas.push(`título «${c.titulo}»`);
  }
  if (c.nota !== undefined && c.nota !== antes.nota) {
    cambios.nota = c.nota;
    lineas.push(c.nota ? "cambió la descripción" : "quitó la descripción");
  }
  if (c.estado !== undefined && c.estado !== antes.estado) {
    if (conEstados) cambios.estado = c.estado;
    if (c.estado === "hecha") Object.assign(cambios, { hecha_en: new Date().toISOString(), hecha_por_nombre: yo });
    else if (antes.estado === "hecha") Object.assign(cambios, { hecha_en: null, hecha_por_nombre: null, hecha_nota: null });
    lineas.push(`${etiquetaEstado(antes.estado)} → ${etiquetaEstado(c.estado)}`);
  }
  if (c.prioridad !== undefined && c.prioridad !== antes.prioridad) {
    cambios.prioridad = c.prioridad;
    lineas.push(`prioridad ${etiquetaPrioridad(c.prioridad).toLowerCase()}`);
  }
  if (c.plazo !== undefined && c.plazo !== antes.plazo) {
    cambios.plazo = c.plazo;
    lineas.push(c.plazo ? `para el ${fechaLarga(c.plazo)}` : "sin fecha");
  }
  let nuevoResponsable: string | null = null;
  if (c.responsableId !== undefined && c.responsableId !== antes.responsableId) {
    const nombre = await personaActiva(c.responsableId);
    if (!nombre) return { error: "La persona elegida no está activa." };
    Object.assign(cambios, { responsable_id: c.responsableId, responsable_nombre: nombre });
    nuevoResponsable = c.responsableId;
    lineas.push(`le toca a ${nombre}`);
  }
  if (c.publicacionId !== undefined && c.publicacionId !== antes.publicacionId) {
    pubNueva = await publicacionPermitida(c.publicacionId, usuario.paisesPermitidos);
    if (!pubNueva) return { error: "Ese producto no existe o no es de tus países." };
    cambios.publicacion_id = pubNueva.id;
    lineas.push(`pasó de «${pubActual.nombre}» a «${pubNueva.nombre}»`);
  }
  if (c.archivar !== undefined && c.archivar !== !!antes.archivadaEn) {
    cambios.archivada_en = c.archivar ? new Date().toISOString() : null;
    lineas.push(c.archivar ? "archivada" : "fuera de Archivadas");
  }
  if (!Object.keys(cambios).length) return { tarea: antes };

  const { data, error } = await supabase
    .from("dropi_publicaciones_tareas")
    .update(cambios)
    .eq("id", tareaId)
    .select(conEstados ? `${COLUMNAS_TAREA}, ${COLUMNAS_0178}` : COLUMNAS_TAREA)
    .single();
  if (error || !data) return { error: error && falta0178(error.message) ? MIGRACION_0178 : "No se pudo guardar." };
  const despues = deFilaManual(data as unknown as Record<string, unknown>);
  await registrarAuditoria({
    accion: c.estado === "hecha" && antes.estado !== "hecha" ? "resolver_tarea_publicacion" : "editar_tarea_publicacion",
    entidad: "dropi_publicaciones",
    entidadId: despues.publicacionId,
    detalle: `Tarea «${despues.titulo}»: ${lineas.join(" · ")}`,
  });
  if (nuevoResponsable) await avisarResponsable(nuevoResponsable, usuario, despues.titulo, `${pubNueva?.nombre ?? pubActual.nombre}${despues.plazo ? ` · para el ${fechaLarga(despues.plazo)}` : ""}`);
  revalidar();
  return {
    tarea: despues,
    ...(pubNueva ? { publicacion: { id: pubNueva.id, numero: pubNueva.numero == null ? null : Number(pubNueva.numero), nombre: pubNueva.nombre, fotoUrl: pubNueva.foto_url, dropiId: pubNueva.dropi_id } } : {}),
  };
}

/** Las tareas escritas a mano de una publicación (para su ficha y el botón de su fila): todas, también hechas y archivadas. Basta poder abrir el módulo. */
export async function obtenerTareasPublicacion(publicacionId: string): Promise<{ tareas: TareaVista[]; disponible: boolean; conEstados: boolean } | { error: string }> {
  const usuario = await requireModulo(MODULO);
  const pub = await publicacionPermitida(publicacionId, usuario.paisesPermitidos);
  if (!pub) return { error: "Publicación no válida." };
  const supabase = createServiceClient();
  const leer = (columnas: string) => supabase.from("dropi_publicaciones_tareas").select(columnas as "*").eq("publicacion_id", pub.id).order("creado_en", { ascending: false }).limit(100);
  let r = await leer(`${COLUMNAS_TAREA}, ${COLUMNAS_0178}`);
  const conEstados = !r.error;
  if (r.error) r = await leer(COLUMNAS_TAREA);
  if (r.error) return falta(r.error.message) ? { tareas: [], disponible: false, conEstados: false } : { error: "No se pudieron cargar las tareas." };
  return { tareas: ((r.data ?? []) as unknown as Record<string, unknown>[]).map(deFilaManual), disponible: true, conEstados };
}

/** Las publicaciones del país de la barra que se llaman como lo escrito (o su PUB-0000 o su ID de Dropi), para asociar una tarea a un producto. */
export async function buscarPublicacionesParaTarea(consulta: string): Promise<{ resultados: PublicacionDeTarea[] }> {
  const usuario = await requireModulo(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais.id))) return { resultados: [] };
  // Solo letras, números, espacios y guion: nada que se cuele en el filtro.
  const t = String(consulta ?? "").normalize("NFC").replace(/[^\p{L}\p{N} -]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (t.length < 2) return { resultados: [] };
  const numero = t.match(/^(?:pub-?)?(\d{1,6})$/i)?.[1];
  const consultas = [supabase.from("dropi_publicaciones").select("id, numero, nombre, foto_url, dropi_id").eq("pais_id", pais.id).ilike("nombre", `%${t}%`).limit(12)];
  if (numero) {
    consultas.push(supabase.from("dropi_publicaciones").select("id, numero, nombre, foto_url, dropi_id").eq("pais_id", pais.id).eq("numero", Number(numero)).limit(1));
    consultas.push(supabase.from("dropi_publicaciones").select("id, numero, nombre, foto_url, dropi_id").eq("pais_id", pais.id).ilike("dropi_id", `%${numero}%`).limit(5));
  }
  const vistos = new Map<string, PublicacionDeTarea>();
  for (const r of await Promise.all(consultas))
    for (const p of (r.data ?? []) as Record<string, unknown>[])
      if (!vistos.has(p.id as string))
        vistos.set(p.id as string, { id: p.id as string, numero: p.numero == null ? null : Number(p.numero), nombre: String(p.nombre ?? ""), fotoUrl: (p.foto_url as string | null) ?? null, dropiId: (p.dropi_id as string | null) ?? null });
  return { resultados: [...vistos.values()].slice(0, 12) };
}

/** Cuántas tareas pendientes tiene la persona en el país de la barra (el globo de la pestaña «Tareas»). */
export async function contarMisTareasPendientes(): Promise<number | null> {
  const usuario = await requireModulo(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pais.id))) return null;
  const { tareas } = await cargarTareas(supabase, pais.id, usuario.id, false);
  return tareas.filter(pendiente).length;
}
