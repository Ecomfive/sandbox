"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import type { UsuarioActual } from "@/lib/auth";
import { cargarEnCaminoDatos } from "@/lib/compras/en-camino-datos";
import { accesoCrm, escribeEnArea, type AreaCrm } from "@/lib/crm/areas";
import { esFechaTarea, grupoDeTarea, tituloAvisoLlegada, type EstadoTarea, type GrupoTarea } from "@/lib/crm/tareas";
import { activarTareasDeLlegada, avisarTarea } from "@/lib/crm/tareas-servidor";
import { hoyPanama } from "@/lib/proveedor/fechas";
import { cargarEnCamino } from "@/lib/publicaciones/en-camino-datos";
import { createServiceClient } from "@/lib/supabase/server";
import { asegurarBorradoresDeLlegada, enviarBorradoresDeLlegada } from "@/lib/whatsapp/plantillas-llegada";
import { areasDe, conversacionPermitida, usuarioBandeja } from "../bandeja/datos-bandeja";
import { paisDelChat } from "../bandeja/pais-chat";
import { NIVELES, etiquetaNivel } from "../def-crm";

// Tareas del CRM (29 oct 2026, pedido de Hernán): las del chat de WhatsApp (avisar una llegada, hablar con alguien en una fecha) y los
// seguimientos comerciales, en un solo panel. La tarea de un chat queda a cargo de quien lleva el chat (si nadie, de quien la crea).

const ES_ID = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export interface TareaVista {
  id: string;
  titulo: string;
  detalle: string | null;
  estado: EstadoTarea;
  grupo: GrupoTarea;
  vence: string | null;
  /** Lo que se le prometió al cliente mientras la tarea espera la llegada. */
  llegadaEstimada: string | null;
  origen: string;
  responsable: string | null;
  esMia: boolean;
  /** Quien la puede marcar hecha: su responsable o quien escribe en el área del chat. */
  puedeCompletar: boolean;
  cliente: string | null;
  vip: boolean;
  dropshipperId: string | null;
  conversacionId: string | null;
  producto: string | null;
  creadoEn: string;
}

const CAMPOS =
  "id, titulo, detalle, estado, vence, llegada_estimada, origen, responsable_id, dropshipper_id, conversacion_id, creado_en, hecha_en, perfiles:responsable_id(nombre), dropshippers(nombre, codigo, nivel), whatsapp_conversaciones(area, nombre_personalizado, nombre_perfil), skus_maestros(nombre)";

type Fila = {
  id: string;
  titulo: string;
  detalle: string | null;
  estado: EstadoTarea;
  vence: string | null;
  llegada_estimada: string | null;
  origen: string;
  responsable_id: string | null;
  dropshipper_id: string | null;
  conversacion_id: string | null;
  creado_en: string;
  hecha_en: string | null;
  perfiles: Uno<{ nombre: string | null }>;
  dropshippers: Uno<{ nombre: string | null; codigo: string | null; nivel: string | null }>;
  whatsapp_conversaciones: Uno<{ area: AreaCrm; nombre_personalizado: string | null; nombre_perfil: string | null }>;
  skus_maestros: Uno<{ nombre: string | null }>;
};

/** Si la persona ve la tarea: la tiene a cargo, ve el área de su chat o, sin chat, ve lo comercial (los seguimientos). */
function laVe(f: Fila, u: UsuarioActual): boolean {
  if (f.responsable_id === u.id) return true;
  const area = uno(f.whatsapp_conversaciones)?.area;
  if (area) return areasDe(u).includes(area);
  return accesoCrm(u).comercial;
}

function puedeCompletar(f: Fila, u: UsuarioActual): boolean {
  if (f.responsable_id === u.id) return true;
  const area = uno(f.whatsapp_conversaciones)?.area;
  const a = accesoCrm(u);
  return area ? escribeEnArea(a, area) : a.escribeComercial;
}

function vista(f: Fila, u: UsuarioActual, hoy: string): TareaVista {
  const d = uno(f.dropshippers);
  const c = uno(f.whatsapp_conversaciones);
  return {
    id: f.id,
    titulo: f.titulo,
    detalle: f.detalle,
    estado: f.estado,
    grupo: grupoDeTarea(f, hoy),
    vence: f.vence,
    llegadaEstimada: f.llegada_estimada,
    origen: f.origen,
    responsable: uno(f.perfiles)?.nombre ?? null,
    esMia: f.responsable_id === u.id,
    puedeCompletar: puedeCompletar(f, u),
    cliente: d?.nombre ?? c?.nombre_personalizado ?? c?.nombre_perfil ?? null,
    vip: d?.nivel === "vip" || d?.nivel === "black",
    dropshipperId: f.dropshipper_id,
    conversacionId: f.conversacion_id,
    producto: uno(f.skus_maestros)?.nombre ?? null,
    creadoEn: f.creado_en,
  };
}

/** El panel de tareas: las mías o todas las que veo. Antes, activa las que esperaban un producto que ya llegó. Las hechas, las de 30 días. */
export async function listarTareas(filtro: "mias" | "todas"): Promise<{ tareas: TareaVista[]; hoy: string } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  await activarTareasDeLlegada(supabase);
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString();
  let q = supabase.from("tareas_dropshipper").select(CAMPOS).or(`estado.neq.hecha,hecha_en.gte.${hace30}`);
  if (filtro === "mias") q = q.eq("responsable_id", u.id);
  const { data, error } = await q.order("vence", { ascending: true, nullsFirst: false }).order("creado_en", { ascending: false }).limit(1000);
  if (error) return { error: error.message.includes("conversacion_id") ? "Falta correr la migración 0188 (tareas del CRM) en la base." : "No se pudieron cargar las tareas." };
  const hoy = hoyPanama();
  return { hoy, tareas: ((data ?? []) as unknown as Fila[]).filter((f) => laVe(f, u)).map((f) => vista(f, u, hoy)) };
}

/** Las tareas abiertas de un chat (y de su dropshipper), para la ficha del chat. */
export async function tareasDelChat(conversacionId: string): Promise<{ tareas: TareaVista[] } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  await activarTareasDeLlegada(supabase);
  const filtro = c.dropshipperId ? `conversacion_id.eq.${c.id},dropshipper_id.eq.${c.dropshipperId}` : `conversacion_id.eq.${c.id}`;
  const { data, error } = await supabase.from("tareas_dropshipper").select(CAMPOS).or(filtro).neq("estado", "hecha").order("vence", { ascending: true, nullsFirst: false }).limit(50);
  if (error) return { error: "No se pudieron cargar las tareas." };
  const hoy = hoyPanama();
  return { tareas: ((data ?? []) as unknown as Fila[]).filter((f) => laVe(f, u)).map((f) => vista(f, u, hoy)) };
}

/** Quién queda a cargo de la tarea de un chat: quien lo lleva o, si nadie, quien la crea. Si es otra persona, le llega el aviso. */
async function crearDeChat(
  u: UsuarioActual,
  c: { id: string; dropshipperId: string | null; asignadaA: string | null },
  fila: Record<string, unknown> & { titulo: string },
): Promise<{ ok: true } | { error: string }> {
  const supabase = createServiceClient();
  const responsable = c.asignadaA ?? u.id;
  const { error } = await supabase.from("tareas_dropshipper").insert({ ...fila, conversacion_id: c.id, dropshipper_id: c.dropshipperId, responsable_id: responsable, creado_por: u.id });
  if (error) return { error: error.message.includes("conversacion_id") ? "Falta correr la migración 0188 (tareas del CRM) en la base." : "No se pudo crear la tarea." };
  if (responsable !== u.id) {
    const { data: conv } = await supabase.from("whatsapp_conversaciones").select("nombre_personalizado, nombre_perfil, dropshippers(nombre)").eq("id", c.id).maybeSingle();
    const cliente = uno(conv?.dropshippers as Uno<{ nombre: string | null }>)?.nombre ?? conv?.nombre_personalizado ?? conv?.nombre_perfil ?? null;
    await avisarTarea(supabase, { usuarioId: responsable, titulo: fila.titulo, cliente, conversacionId: c.id, motivo: "asignada", autor: { id: u.id, nombre: u.nombre ?? null } });
  }
  await registrarAuditoria({ accion: "crear_tarea_crm", entidad: "whatsapp_conversaciones", entidadId: c.id, detalle: fila.titulo });
  revalidatePath("/crm-dropshippers/tareas");
  return { ok: true };
}

/** «Tarea» en la ficha del chat: qué hay que hacer y para cuándo (por ejemplo, llamarlo el 23 de diciembre). */
export async function crearTareaChat(conversacionId: string, datos: { titulo: string; vence: string | null; detalle: string | null }): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para crear tareas." };
  const titulo = datos.titulo.trim();
  const detalle = datos.detalle?.trim() || null;
  if (!titulo) return { error: "Escribe qué hay que hacer." };
  if (titulo.length > 200) return { error: "El título es muy largo (máximo 200 caracteres)." };
  if (detalle && detalle.length > 2000) return { error: "El detalle es muy largo." };
  if (datos.vence && !esFechaTarea(datos.vence)) return { error: "La fecha no es válida." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u, true);
  if (!c) return { error: "No puedes escribir en ese chat." };
  return crearDeChat(u, c, { titulo, detalle, vence: datos.vence || null, origen: "chat" });
}

/**
 * «Avisarme cuando llegue» en un producto del chat: una tarea que espera las compras que vienen en camino de ese producto al país del chat y
 * se activa cuando una llega de verdad. Si ya hay una esperando ese producto en este chat, no se repite. **Al crearla quedan en el sistema, como borrador, las plantillas de aviso de
 * llegada** (las que falten): el aviso por WhatsApp pasadas las 24 h solo puede ir con una plantilla. Con `PLANTILLAS_LLEGADA_AUTO_META=1` además se mandan a Meta, una cada dos minutos.
 */
export async function avisarCuandoLlegue(conversacionId: string, skuId: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para crear tareas." };
  if (!ES_ID(skuId)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u, true);
  if (!c) return { error: "No puedes escribir en ese chat." };
  const { data: ya } = await supabase.from("tareas_dropshipper").select("id").eq("conversacion_id", c.id).eq("sku_id", skuId).eq("estado", "esperando").limit(1);
  if (ya?.length) return { ok: true };
  const pais = await paisDelChat(supabase, c.telefono, c.dropshipperId);
  if (!pais) return { error: "No se sabe de qué país es este chat: vincúlalo a un dropshipper con país." };
  const [{ porProducto }, { camino }, { data: sku }] = await Promise.all([
    cargarEnCaminoDatos(supabase, u, pais.id),
    cargarEnCamino(supabase, pais.id, u),
    supabase.from("skus_maestros").select("nombre").eq("id", skuId).maybeSingle(),
  ]);
  const compras = [...new Set((porProducto.get(skuId) ?? []).map((a) => a.compraId))];
  if (!compras.length) return { error: "Ese producto no tiene nada en camino a este país: no hay llegada que esperar." };
  const creada = await crearDeChat(u, c, {
    titulo: tituloAvisoLlegada(String(sku?.nombre ?? "el producto")),
    origen: "llegada",
    estado: "esperando",
    sku_id: skuId,
    pais_id: pais.id,
    compras_esperadas: compras,
    llegada_estimada: camino.get(skuId)?.llegada ?? null,
  });
  if ("error" in creada) return creada;
  // Las plantillas de aviso de llegada: borrador en el sistema y, si el envío automático está encendido, a Meta una cada dos minutos (después de responder, sin hacer esperar a la persona).
  const { creadas } = await asegurarBorradoresDeLlegada(supabase, { id: u.id, nombre: u.nombre || u.email });
  if (creadas.length) await registrarAuditoria({ accion: "crear_plantilla_whatsapp", entidad: "whatsapp_plantillas", detalle: `Borradores de aviso de llegada: ${creadas.join(", ")}` });
  after(async () => {
    await enviarBorradoresDeLlegada(supabase).catch(() => undefined);
  });
  return creada;
}

/** Marca una tarea hecha (o la vuelve a abrir). Una que esperaba una llegada y se marca hecha deja de esperar. */
export async function completarTarea(id: string, hecha: boolean): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  if (!ES_ID(id)) return { error: "Tarea no válida." };
  const supabase = createServiceClient();
  const { data } = await supabase.from("tareas_dropshipper").select(CAMPOS).eq("id", id).maybeSingle();
  const f = data as unknown as Fila | null;
  if (!f || !laVe(f, u) || !puedeCompletar(f, u)) return { error: "No puedes cambiar esa tarea." };
  const { error } = await supabase
    .from("tareas_dropshipper")
    .update(hecha ? { estado: "hecha", hecha_en: new Date().toISOString() } : { estado: "pendiente", hecha_en: null })
    .eq("id", id);
  if (error) return { error: "No se pudo actualizar la tarea." };
  if (hecha) await registrarAuditoria({ accion: "completar_tarea_crm", entidad: "tareas_dropshipper", entidadId: id, detalle: f.titulo });
  revalidatePath("/crm-dropshippers/tareas");
  return { ok: true };
}

/**
 * Cambia el «Tipo de cliente» de un dropshipper: ROOKIE, VIP o BLACK puesto a mano (queda fijo: el cálculo automático no lo toca), o `"auto"`, que lo
 * suelta y lo recalcula con el promedio de pedidos de los últimos 3 meses (migración 0196). Queda en la Actividad con lo de antes y lo de después.
 */
export async function cambiarTipoCliente(dropshipperId: string, nivel: string): Promise<{ ok: true; nivel: string; manual: boolean } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const a = accesoCrm(u);
  if (!a.escribeAtencion && !a.escribeComercial) return { error: "No tienes permiso para cambiar el tipo de cliente." };
  if (!ES_ID(dropshipperId)) return { error: "Dropshipper no válido." };
  const auto = nivel === "auto";
  if (!auto && !NIVELES.some((n) => n.valor === nivel)) return { error: "Elige ROOKIE, VIP o BLACK." };
  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase.from("dropshippers").select("nivel, nivel_manual").eq("id", dropshipperId).maybeSingle();
  if (errorAntes) return { error: "Falta correr en Supabase la migración 0196 (tipo de cliente automático)." };
  if (!antes) return { error: "No se encontró el dropshipper." };
  const { error } = await supabase.from("dropshippers").update(auto ? { nivel_manual: false } : { nivel, nivel_manual: true }).eq("id", dropshipperId);
  if (error) return { error: "No se pudo cambiar el tipo de cliente." };
  let final = nivel;
  if (auto) {
    // El cálculo automático deja su propia línea en la Actividad si cambia el tipo.
    await supabase.rpc("crm_recalcular_tipo_cliente");
    const { data } = await supabase.from("dropshippers").select("nivel").eq("id", dropshipperId).maybeSingle();
    final = (data?.nivel as string) ?? (antes.nivel as string);
  }
  await registrarAuditoria({
    accion: "tipo_cliente_dropshipper",
    entidad: "dropshippers",
    entidadId: dropshipperId,
    detalle: auto ? "Vuelve a calcularse solo con el promedio de pedidos" : "Fijado a mano",
    antes: { "Tipo de cliente": `${etiquetaNivel(antes.nivel as string)}${antes.nivel_manual ? " (a mano)" : " (automático)"}` },
    despues: { "Tipo de cliente": `${etiquetaNivel(final)}${auto ? " (automático)" : " (a mano)"}` },
  });
  revalidatePath("/crm-dropshippers", "layout");
  return { ok: true, nivel: final, manual: !auto };
}
