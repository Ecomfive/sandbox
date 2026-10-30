"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { accesoCrm } from "@/lib/crm/areas";
import { puedeVerTelefonos } from "@/lib/whatsapp/telefono-oculto";
import { DIAS_ATENDIDA, ETIQUETA_ALERTA, SUGERENCIA_ALERTA, type TipoAlerta } from "@/lib/crm/salud";
import { avisarTarea } from "@/lib/crm/tareas-servidor";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";

const RUTA = "/crm-dropshippers/direccion";
const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F-]{8,64}$/.test(v);
const TIPOS: TipoAlerta[] = ["caida", "dormido", "devoluciones", "sin_primer_pedido"];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Solo Dirección (`crm-direccion`) con escritura atiende alertas y crea tareas desde ellas. */
async function usuarioDireccion(): Promise<UsuarioActual | null> {
  const u = await getUsuarioActual();
  return u && accesoCrm(u).escribeDireccion ? u : null;
}

function hastaDentroDe(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Panama" });
}

/** «Atendida»: la alerta deja de salir en la cola por 7 días (si sigue igual después, vuelve). */
export async function atenderAlerta(dropshipperId: string, tipo: TipoAlerta): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioDireccion();
  if (!u) return { error: "Solo Dirección puede atender alertas." };
  if (!ES_ID(dropshipperId) || !TIPOS.includes(tipo)) return { error: "Alerta no válida." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: d } = await supabase.from("dropshippers").select("nombre").eq("id", dropshipperId).maybeSingle();
  if (!d) return { error: "Ese dropshipper ya no existe." };
  const { error } = await supabase.from("crm_alertas_atendidas").insert({
    dropshipper_id: dropshipperId,
    pais_id: pais.id,
    tipo,
    como: "atendida",
    hasta: hastaDentroDe(DIAS_ATENDIDA),
    atendida_por: u.id,
    atendida_por_nombre: u.nombre || u.email,
  });
  if (error) return { error: "No se pudo guardar. ¿Falta correr la migración 0197?" };
  await registrarAuditoria({ accion: "crm_alerta_atendida", entidad: "dropshippers", entidadId: dropshipperId, detalle: `${ETIQUETA_ALERTA[tipo]} · ${d.nombre} (${pais.codigo})` });
  revalidatePath(RUTA);
  return { ok: true };
}

/**
 * «Crear tarea» desde una alerta: una tarea del CRM para la persona elegida (le llega el aviso en la campana), unida al chat del dropshipper si
 * tiene. La alerta queda atendida 7 días.
 */
export async function crearTareaDeAlerta(datos: { dropshipperId: string; tipo: TipoAlerta; responsableId: string; vence: string; texto: string }): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioDireccion();
  if (!u) return { error: "Solo Dirección puede crear tareas desde las alertas." };
  if (!ES_ID(datos.dropshipperId) || !TIPOS.includes(datos.tipo) || !ES_ID(datos.responsableId)) return { error: "Datos no válidos." };
  if (!FECHA.test(datos.vence) || Number.isNaN(Date.parse(datos.vence))) return { error: "La fecha no es válida." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [{ data: d }, { data: resp }, { data: chat }] = await Promise.all([
    supabase.from("dropshippers").select("nombre").eq("id", datos.dropshipperId).maybeSingle(),
    supabase.from("perfiles").select("id, activo").eq("id", datos.responsableId).maybeSingle(),
    supabase.from("whatsapp_conversaciones").select("id").eq("dropshipper_id", datos.dropshipperId).is("oculta_en", null).order("ultimo_mensaje_en", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ]);
  if (!d) return { error: "Ese dropshipper ya no existe." };
  if (!resp?.activo) return { error: "Esa persona no está activa." };
  const titulo = `${ETIQUETA_ALERTA[datos.tipo]}: ${d.nombre}`.slice(0, 200);
  const detalle = `${datos.texto.trim().slice(0, 600)}\n${SUGERENCIA_ALERTA[datos.tipo]}`;
  const { data: tarea, error } = await supabase
    .from("tareas_dropshipper")
    .insert({ dropshipper_id: datos.dropshipperId, conversacion_id: chat?.id ?? null, titulo, detalle, vence: datos.vence, origen: "alerta", responsable_id: datos.responsableId, creado_por: u.id })
    .select("id")
    .single();
  if (error || !tarea) return { error: "No se pudo crear la tarea. ¿Falta correr la migración 0197?" };
  await supabase.from("crm_alertas_atendidas").insert({
    dropshipper_id: datos.dropshipperId,
    pais_id: pais.id,
    tipo: datos.tipo,
    como: "tarea",
    tarea_id: tarea.id,
    hasta: hastaDentroDe(DIAS_ATENDIDA),
    atendida_por: u.id,
    atendida_por_nombre: u.nombre || u.email,
  });
  if (datos.responsableId !== u.id)
    await avisarTarea(supabase, { usuarioId: datos.responsableId, titulo, cliente: d.nombre, conversacionId: chat?.id ?? null, motivo: "asignada", autor: { id: u.id, nombre: u.nombre ?? null } });
  await registrarAuditoria({ accion: "crear_tarea_crm", entidad: "dropshippers", entidadId: datos.dropshipperId, detalle: `${titulo} (desde Dirección, ${pais.codigo})` });
  revalidatePath(RUTA);
  revalidatePath("/crm-dropshippers/tareas");
  return { ok: true };
}

/**
 * «Lo lleva» (fase 2, 30 oct 2026): Dirección elige quién del equipo lleva a un dropshipper (`dropshippers.responsable_id`). De ahí sale la
 * cartera de cada persona en Dirección › Equipo; un caso escalado de ese dropshipper también le crea la tarea a esa persona. `null` lo quita.
 */
export async function asignarResponsable(dropshipperId: string, perfilId: string | null): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioDireccion();
  if (!u) return { error: "Solo Dirección puede asignar quién lleva a un dropshipper." };
  if (!ES_ID(dropshipperId) || (perfilId !== null && !ES_ID(perfilId))) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const [{ data: d }, { data: p }] = await Promise.all([
    supabase.from("dropshippers").select("nombre, responsable_id").eq("id", dropshipperId).maybeSingle(),
    perfilId ? supabase.from("perfiles").select("nombre, email, activo").eq("id", perfilId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!d) return { error: "Ese dropshipper ya no existe." };
  if (perfilId && !p?.activo) return { error: "Esa persona no está activa." };
  if (d.responsable_id === perfilId) return { ok: true };
  const { error } = await supabase.from("dropshippers").update({ responsable_id: perfilId }).eq("id", dropshipperId);
  if (error) return { error: "No se pudo guardar." };
  await registrarAuditoria({ accion: "crm_responsable_dropshipper", entidad: "dropshippers", entidadId: dropshipperId, detalle: `${d.nombre}: lo lleva ${p ? p.nombre || p.email : "nadie"}` });
  revalidatePath(RUTA);
  return { ok: true };
}

export interface ContactoLista {
  id: string;
  correo: string | null;
  /** Solo si quien la pide puede ver números (`puedeVerTelefonos`); si no, null. */
  telefono: string | null;
}

/**
 * La lista de un segmento para una difusión (fase 3, 30 oct 2026): el correo de cada dropshipper y su WhatsApp si quien la pide puede ver
 * números (los números no salen en ninguna pantalla para los demás). No envía nada: la pantalla arma el CSV. Queda en la auditoría.
 */
export async function contactosParaLista(ids: string[], segmento: string): Promise<{ contactos: ContactoLista[]; conTelefono: boolean } | { error: string }> {
  const u = await usuarioDireccion();
  if (!u) return { error: "Solo Dirección puede descargar listas." };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 3000 || !ids.every(ES_ID)) return { error: "Lista no válida." };
  const conTelefono = puedeVerTelefonos(u);
  const supabase = createServiceClient();
  const filas: { id: string; contacto_email: string | null; contacto_telefono: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("dropshippers").select("id, contacto_email, contacto_telefono").in("id", ids.slice(i, i + 200));
    if (error) return { error: "No se pudo armar la lista." };
    filas.push(...((data ?? []) as typeof filas));
  }
  await registrarAuditoria({
    accion: "crm_lista_difusion",
    entidad: "dropshippers",
    detalle: `Lista de ${filas.length} dropshippers (${String(segmento).slice(0, 120)})${conTelefono ? ", con WhatsApp" : ", sin WhatsApp"}`,
  });
  return { conTelefono, contactos: filas.map((f) => ({ id: f.id, correo: f.contacto_email, telefono: conTelefono ? f.contacto_telefono : null })) };
}
