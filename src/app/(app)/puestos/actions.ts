"use server";

import { revalidatePath } from "next/cache";
import { CURSOS } from "@/lib/ayuda/cursos";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { cierraCiclo } from "@/lib/puestos/organigrama";
import { esUuid, leerEtapa, validarPuesto, type DatosPuesto } from "@/lib/puestos/puesto";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "puestos";
const ENTIDAD = "puestos";
const SIN_MIGRACION = "Falta correr la migración 0112 (Puestos) en Supabase.";

function refrescar() {
  revalidatePath("/puestos");
  revalidatePath("/puestos/organigrama");
  revalidatePath("/mi-puesto");
}

const fila = (d: DatosPuesto, quien: string) => ({
  nombre: d.nombre,
  area: d.area,
  reporta_a: d.reportaA,
  plazas: d.plazas,
  mision: d.mision,
  responsabilidades: d.responsabilidades,
  autoridad: d.autoridad,
  kra: d.kra,
  actualizado_por: quien,
  actualizado_en: new Date().toISOString(),
});

const errorDe = (e: { code?: string; message?: string } | null, porDefecto: string) =>
  e?.code === "23505" ? "Ya hay un puesto con ese nombre." : e?.code === "42P01" ? SIN_MIGRACION : e?.message?.includes("reportar") ? "El puesto no puede reportar a uno que depende de él." : porDefecto;

/** ¿El puesto al que reporta existe y no cierra un ciclo? */
async function revisarJefe(id: string | null, reportaA: string | null): Promise<string | null> {
  if (!reportaA) return null;
  const { data } = await createServiceClient().from("puestos").select("id, reporta_a");
  const puestos = (data ?? []).map((p) => ({ id: p.id as string, reportaA: (p.reporta_a as string | null) ?? null }));
  if (!puestos.some((p) => p.id === reportaA)) return "El puesto al que reporta ya no existe.";
  if (id && cierraCiclo(id, reportaA, puestos)) return "El puesto no puede reportar a uno que depende de él.";
  return null;
}

/** «Agregar»: un puesto nuevo. Devuelve el error como valor (la ficha lo muestra sin cerrarse). */
export async function crearPuesto(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const datos = validarPuesto(Object.fromEntries(formData));
  if ("error" in datos) return datos;
  const problema = await revisarJefe(null, datos.reportaA);
  if (problema) return { error: problema };
  const { data, error } = await createServiceClient().from("puestos").insert(fila(datos, usuario.nombre || usuario.email)).select("id").single();
  if (error || !data) return { error: errorDe(error, "No se pudo crear el puesto.") };
  await registrarAuditoria({ accion: "crear_puesto", entidad: ENTIDAD, entidadId: data.id as string, detalle: `${datos.nombre} (${datos.area})` });
  refrescar();
  return {};
}

/** Guarda la ficha del puesto. */
export async function actualizarPuesto(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const id = formData.get("id");
  if (!esUuid(id)) return { error: "Puesto no válido." };
  const datos = validarPuesto(Object.fromEntries(formData), id);
  if ("error" in datos) return datos;
  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("puestos").select("nombre, area, reporta_a, plazas, mision, kra").eq("id", id).maybeSingle();
  if (!antes) return { error: "El puesto ya no existe." };
  const problema = await revisarJefe(id, datos.reportaA);
  if (problema) return { error: problema };
  const { error } = await supabase.from("puestos").update(fila(datos, usuario.nombre || usuario.email)).eq("id", id);
  if (error) return { error: errorDe(error, "No se pudo guardar el puesto.") };

  const nombreJefe = async (j: string | null) => (j ? ((await supabase.from("puestos").select("nombre").eq("id", j).maybeSingle()).data?.nombre ?? "—") : "—");
  await registrarAuditoria({
    accion: "editar_puesto",
    entidad: ENTIDAD,
    entidadId: id,
    antes: { Nombre: antes.nombre, Área: antes.area, "Reporta a": await nombreJefe(antes.reporta_a), Plazas: String(antes.plazas), Misión: antes.mision || "—", "Áreas de resultado": (antes.kra ?? []).join(", ") || "—" },
    despues: { Nombre: datos.nombre, Área: datos.area, "Reporta a": await nombreJefe(datos.reportaA), Plazas: String(datos.plazas), Misión: datos.mision || "—", "Áreas de resultado": datos.kra.join(", ") || "—" },
  });
  refrescar();
  return {};
}

/** Desactiva o reactiva un puesto. No se borra: guarda quién lo ocupó y su historia. */
export async function cambiarEstadoPuesto(id: string, activo: boolean): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!esUuid(id)) return { error: "Puesto no válido." };
  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("puestos").select("activo").eq("id", id).maybeSingle();
  if (!actual) return { error: "El puesto ya no existe." };
  if (actual.activo === activo) return {};
  if (!activo) {
    const { count } = await supabase.from("puesto_personas").select("usuario_id", { count: "exact", head: true }).eq("puesto_id", id);
    if (count) return { error: "Quita primero a las personas que ocupan el puesto." };
  }
  const { error } = await supabase.from("puestos").update({ activo, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo cambiar el estado." };
  await registrarAuditoria({ accion: "cambiar_estado_puesto", entidad: ENTIDAD, entidadId: id, antes: { Estado: activo ? "Inactivo" : "Activo" }, despues: { Estado: activo ? "Activo" : "Inactivo" } });
  refrescar();
  return {};
}

async function nombrePersona(usuarioId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("perfiles").select("nombre, email").eq("id", usuarioId).maybeSingle();
  return data ? (data.nombre as string | null) || (data.email as string) : null;
}

/** Pone a una persona en el puesto. Si todavía no tiene un puesto principal, este pasa a serlo. */
export async function asignarPersona(puestoId: string, usuarioId: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!esUuid(puestoId) || !esUuid(usuarioId)) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const [{ data: puesto }, nombre, { data: suyos }] = await Promise.all([
    supabase.from("puestos").select("nombre, activo").eq("id", puestoId).maybeSingle(),
    nombrePersona(usuarioId),
    supabase.from("puesto_personas").select("puesto_id, principal").eq("usuario_id", usuarioId),
  ]);
  if (!puesto || !puesto.activo) return { error: "El puesto no existe o está inactivo." };
  if (!nombre) return { error: "La persona ya no existe." };
  if ((suyos ?? []).some((s) => s.puesto_id === puestoId)) return {};
  const principal = !(suyos ?? []).some((s) => s.principal);
  const { error } = await supabase.from("puesto_personas").insert({ puesto_id: puestoId, usuario_id: usuarioId, principal });
  if (error) return { error: error.code === "42P01" ? SIN_MIGRACION : "No se pudo asignar a la persona." };
  await registrarAuditoria({ accion: "asignar_puesto", entidad: ENTIDAD, entidadId: puestoId, detalle: `${nombre}${principal ? " (puesto principal)" : ""}` });
  refrescar();
  revalidatePath("/usuarios");
  return {};
}

/** Saca a una persona del puesto. Si era su principal, pasa a serlo el siguiente que tenga. */
export async function quitarPersona(puestoId: string, usuarioId: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!esUuid(puestoId) || !esUuid(usuarioId)) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("puesto_personas").select("principal").eq("puesto_id", puestoId).eq("usuario_id", usuarioId).maybeSingle();
  if (!actual) return {};
  const { error } = await supabase.from("puesto_personas").delete().eq("puesto_id", puestoId).eq("usuario_id", usuarioId);
  if (error) return { error: "No se pudo quitar a la persona." };
  if (actual.principal) {
    const { data: otro } = await supabase.from("puesto_personas").select("puesto_id").eq("usuario_id", usuarioId).order("creado_en").limit(1).maybeSingle();
    if (otro) await supabase.from("puesto_personas").update({ principal: true }).eq("puesto_id", otro.puesto_id).eq("usuario_id", usuarioId);
  }
  await registrarAuditoria({ accion: "quitar_puesto", entidad: ENTIDAD, entidadId: puestoId, detalle: (await nombrePersona(usuarioId)) ?? usuarioId });
  refrescar();
  revalidatePath("/usuarios");
  return {};
}

/** Marca este puesto como el principal de la persona (de él sale su jefe). */
export async function marcarPrincipal(puestoId: string, usuarioId: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!esUuid(puestoId) || !esUuid(usuarioId)) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("puesto_personas").select("principal").eq("puesto_id", puestoId).eq("usuario_id", usuarioId).maybeSingle();
  if (!actual) return { error: "La persona ya no está en este puesto." };
  if (actual.principal) return {};
  // Primero se quita el principal anterior: el índice único no deja tener dos a la vez.
  const quitar = await supabase.from("puesto_personas").update({ principal: false }).eq("usuario_id", usuarioId).eq("principal", true);
  if (quitar.error) return { error: "No se pudo cambiar el puesto principal." };
  const { error } = await supabase.from("puesto_personas").update({ principal: true }).eq("puesto_id", puestoId).eq("usuario_id", usuarioId);
  if (error) return { error: "No se pudo cambiar el puesto principal." };
  await registrarAuditoria({ accion: "puesto_principal", entidad: ENTIDAD, entidadId: puestoId, detalle: (await nombrePersona(usuarioId)) ?? usuarioId });
  refrescar();
  revalidatePath("/usuarios");
  return {};
}

type TipoEnlace = "curso" | "manual";
const TABLA: Record<TipoEnlace, { tabla: string; columna: string }> = {
  manual: { tabla: "puesto_manuales", columna: "manual_id" },
  curso: { tabla: "puesto_cursos", columna: "curso_id" },
};

/** Valida el enlace y devuelve su título (para la actividad). */
async function tituloEnlace(tipo: unknown, id: unknown): Promise<{ tipo: TipoEnlace; id: string; titulo: string } | { error: string }> {
  if (tipo === "curso") {
    const curso = CURSOS.find((c) => c.id === id);
    return curso ? { tipo, id: curso.id, titulo: curso.titulo } : { error: "Ese curso no existe." };
  }
  if (tipo === "manual" && esUuid(id)) {
    const { data } = await createServiceClient().from("manuales_proceso").select("titulo").eq("id", id).maybeSingle();
    return data ? { tipo, id, titulo: data.titulo as string } : { error: "Ese manual ya no existe." };
  }
  return { error: "Elige un manual o un curso." };
}

/** Enlaza un manual (SOP) o un curso al puesto, en una etapa del onboarding (o de consulta). */
export async function enlazar(puestoId: string, tipo: TipoEnlace, id: string, etapa: number | null): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!esUuid(puestoId)) return { error: "Puesto no válido." };
  const enlace = await tituloEnlace(tipo, id);
  if ("error" in enlace) return enlace;
  const { tabla, columna } = TABLA[enlace.tipo];
  const supabase = createServiceClient();
  const { count } = await supabase.from(tabla).select(columna, { count: "exact", head: true }).eq("puesto_id", puestoId);
  const { error } = await supabase.from(tabla).upsert({ puesto_id: puestoId, [columna]: enlace.id, etapa: leerEtapa(etapa), orden: count ?? 0 }, { onConflict: `puesto_id,${columna}` });
  if (error) return { error: error.code === "23503" ? "El puesto ya no existe." : error.code === "42P01" ? SIN_MIGRACION : "No se pudo enlazar." };
  await registrarAuditoria({ accion: enlace.tipo === "manual" ? "enlazar_sop_puesto" : "enlazar_curso_puesto", entidad: ENTIDAD, entidadId: puestoId, detalle: enlace.titulo });
  refrescar();
  return {};
}

/** Cambia la etapa del onboarding en que va un manual o un curso. */
export async function cambiarEtapa(puestoId: string, tipo: TipoEnlace, id: string, etapa: number | null): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!esUuid(puestoId) || !TABLA[tipo]) return { error: "Datos no válidos." };
  const { tabla, columna } = TABLA[tipo];
  const { error } = await createServiceClient().from(tabla).update({ etapa: leerEtapa(etapa) }).eq("puesto_id", puestoId).eq(columna, String(id));
  if (error) return { error: "No se pudo cambiar la etapa." };
  refrescar();
  return {};
}

/** Quita un manual o un curso del puesto. */
export async function quitarEnlace(puestoId: string, tipo: TipoEnlace, id: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!esUuid(puestoId) || !TABLA[tipo]) return { error: "Datos no válidos." };
  const enlace = await tituloEnlace(tipo, id);
  const { tabla, columna } = TABLA[tipo];
  const { error } = await createServiceClient().from(tabla).delete().eq("puesto_id", puestoId).eq(columna, String(id));
  if (error) return { error: "No se pudo quitar." };
  await registrarAuditoria({ accion: tipo === "manual" ? "quitar_sop_puesto" : "quitar_curso_puesto", entidad: ENTIDAD, entidadId: puestoId, detalle: "titulo" in enlace ? enlace.titulo : String(id) });
  refrescar();
  return {};
}

/** La actividad de un puesto para su ficha. Es una lectura: basta poder abrir el módulo. */
export async function obtenerHistorialPuesto(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (!esUuid(id)) return { error: "Puesto no válido." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", ENTIDAD)
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}
