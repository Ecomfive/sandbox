"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import type { UsuarioActual } from "@/lib/auth";

import { modeloDeTexto, pedirIA, proveedorTexto } from "@/lib/publicaciones/ia/proveedor";
import { createServiceClient } from "@/lib/supabase/server";
import {
  agruparPorDia,
  diasPorAnalizar,
  frecuenciaDeMotivos,
  MAX_DIAS_POR_PEDIDO,
  normalizarAnalisis,
  pedidoActividad,
  situacionDelCliente,
  type AnalisisDia,
  type EstadoDia,
  type FrecuenciaMotivo,
  type MensajeActividad,
  type SituacionCliente,
} from "@/lib/whatsapp/actividad";
import { mensajesOcultos } from "@/lib/whatsapp/ocultos";
import { areasDe, conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

// Actividad del cliente (29 oct 2026): por qué escribió un dropshipper cada día, entendido por la IA a partir de sus mensajes y guardado en `whatsapp_actividad` (migración 0182).
// Solo se analizan los días nuevos o que cambiaron; lo ya analizado no se vuelve a pagar. A la IA no llegan teléfonos, correos ni enlaces (`textoParaIA`).

type Supabase = ReturnType<typeof createServiceClient>;

/** Cuántos días hacia atrás se miran los mensajes de un chat. */
const VENTANA_DIAS = 90;
/** Cuántos días se muestran en la ficha. */
const DIAS_EN_FICHA = 60;

export interface DiaDelCliente {
  dia: string;
  motivos: string[];
  resumen: string;
  estado: EstadoDia;
}

export interface ActividadCliente {
  dias: DiaDelCliente[];
  frecuentes: FrecuenciaMotivo[];
  situacion: SituacionCliente;
  /** Cuántos días tienen mensajes nuevos o nunca se analizaron. */
  porAnalizar: number;
  /** Falta correr la migración 0182. */
  falta: boolean;
  /** Hay una clave de IA conectada para analizar. */
  iaConectada: boolean;
}

const desdeVentana = () => new Date(Date.now() - VENTANA_DIAS * 86_400_000).toISOString();

/** Los mensajes del chat de la ventana, sin los que se autorizó ocultar. Con `conTexto` también el texto (para el análisis). */
async function mensajesDelChat(supabase: Supabase, id: string, conTexto: boolean): Promise<MensajeActividad[]> {
  const base = () => supabase.from("whatsapp_mensajes");
  const [{ data, error }, ocultos] = await Promise.all([
    conTexto
      ? base().select("id, direccion, tipo, texto, momento").eq("conversacion_id", id).gte("momento", desdeVentana()).order("momento", { ascending: true }).limit(4000)
      : base().select("id, direccion, tipo, momento").eq("conversacion_id", id).gte("momento", desdeVentana()).order("momento", { ascending: true }).limit(4000),
    mensajesOcultos(supabase, id),
  ]);
  if (error) return [];
  return ((data ?? []) as { id: string; direccion: string; tipo: string; texto?: string | null; momento: string }[])
    .filter((m) => !ocultos.has(m.id))
    .map((m) => ({ id: m.id, direccion: m.direccion, tipo: m.tipo, texto: m.texto ?? null, momento: m.momento }));
}

async function guardados(supabase: Supabase, id: string): Promise<{ filas: (DiaDelCliente & { firma: string })[]; falta: boolean }> {
  const { data, error } = await supabase.from("whatsapp_actividad").select("dia, motivos, resumen, estado, firma").eq("conversacion_id", id).order("dia", { ascending: false }).limit(200);
  if (error) return { filas: [], falta: true };
  return { filas: (data ?? []).map((f) => ({ dia: f.dia as string, motivos: (f.motivos as string[]) ?? [], resumen: f.resumen as string, estado: f.estado as EstadoDia, firma: f.firma as string })), falta: false };
}

/** La actividad ya analizada de un chat y cuánto falta por analizar. Basta poder abrir el chat. */
export async function actividadDelCliente(conversacionId: string): Promise<ActividadCliente | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  const [msgs, g, conv] = await Promise.all([
    mensajesDelChat(supabase, c.id, false),
    guardados(supabase, c.id),
    supabase.from("whatsapp_conversaciones").select("ultimo_de, ultimo_mensaje_en").eq("id", c.id).maybeSingle(),
  ]);
  const dias = diasPorAnalizar(agruparPorDia(msgs), new Map(g.filas.map((f) => [f.dia, f.firma])));
  const ultimo = g.filas[0] ?? null;
  return {
    dias: g.filas.slice(0, DIAS_EN_FICHA).map((f) => ({ dia: f.dia, motivos: f.motivos, resumen: f.resumen, estado: f.estado })),
    frecuentes: frecuenciaDeMotivos(g.filas),
    situacion: situacionDelCliente((conv.data?.ultimo_de as string | null) ?? null, (conv.data?.ultimo_mensaje_en as string | null) ?? null, ultimo ? { dia: ultimo.dia, estado: ultimo.estado, resumen: ultimo.resumen } : null),
    porAnalizar: g.falta ? 0 : dias.length,
    falta: g.falta,
    iaConectada: proveedorTexto() !== null,
  };
}

/** Analiza con la IA los días nuevos de un chat (hasta `MAX_DIAS_POR_PEDIDO`, los más recientes) y los guarda. */
async function analizarChat(supabase: Supabase, u: UsuarioActual, id: string): Promise<{ analizados: number; faltan: number } | { error: string }> {
  const msgs = await mensajesDelChat(supabase, id, true);
  const g = await guardados(supabase, id);
  if (g.falta) return { error: "Falta correr la migración 0182 (actividad del cliente)." };
  const pendientes = diasPorAnalizar(agruparPorDia(msgs), new Map(g.filas.map((f) => [f.dia, f.firma])));
  if (!pendientes.length) return { analizados: 0, faltan: 0 };
  const lote = pendientes.slice(-MAX_DIAS_POR_PEDIDO);
  const pedido = pedidoActividad(lote);
  const r = await pedirIA({ instrucciones: pedido.instrucciones, texto: pedido.texto, imagenes: [] }, false, {
    operacion: "actividad_cliente",
    modulo: "crm-dropshippers",
    usuario: { id: u.id, nombre: u.nombre ?? null, email: u.email },
    referencia: id,
  });
  if ("error" in r) return { error: r.error };
  const analisis: AnalisisDia[] = normalizarAnalisis(r.texto, lote.map((d) => d.dia));
  if (!analisis.length) return { error: "La IA no devolvió un análisis que se pueda guardar. Inténtalo de nuevo." };
  const porDia = new Map(lote.map((d) => [d.dia, d]));
  const filas = analisis.map((a) => ({
    conversacion_id: id,
    dia: a.dia,
    motivos: a.motivos,
    resumen: a.resumen,
    estado: a.estado,
    mensajes: porDia.get(a.dia)?.mensajes.length ?? 0,
    firma: porDia.get(a.dia)?.firma ?? "",
    modelo: modeloDeTexto(),
    analizado_por: u.nombre || u.email,
    analizado_en: new Date().toISOString(),
  }));
  const { error } = await supabase.from("whatsapp_actividad").upsert(filas, { onConflict: "conversacion_id,dia" });
  if (error) return { error: "No se pudo guardar el análisis." };
  return { analizados: filas.length, faltan: Math.max(0, pendientes.length - filas.length) };
}

/** «Analizar con IA» en la ficha del chat: los días con mensajes nuevos. Hay que poder escribir en el área del chat (cuesta crédito de IA). */
export async function analizarActividadDelCliente(conversacionId: string): Promise<(ActividadCliente & { analizados: number }) | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u, true);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  const r = await analizarChat(supabase, u, c.id);
  if ("error" in r) return r;
  if (r.analizados) await registrarAuditoria({ accion: "analizar_actividad_whatsapp", entidad: "whatsapp_conversaciones", entidadId: c.id, detalle: `Analizó ${r.analizados} ${r.analizados === 1 ? "día" : "días"} con IA` });
  const a = await actividadDelCliente(c.id);
  if ("error" in a) return a;
  return { ...a, analizados: r.analizados };
}

export interface MotivoRecurrente extends FrecuenciaMotivo {
  /** Cuántos clientes distintos lo tuvieron. */
  clientes: number;
  /** Lo más reciente que se resumió de ese motivo. */
  ejemplos: { dia: string; resumen: string }[];
}

export interface MotivosRecurrentes {
  desde: string;
  chats: number;
  dias: number;
  /** Chats cuya última consulta analizada quedó sin resolver. */
  sinResolver: number;
  motivos: MotivoRecurrente[];
  falta: boolean;
  iaConectada: boolean;
}

const porTandas = <T,>(lista: T[], n: number): T[][] => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

/** Los ids de los chats de las áreas de la persona que no están ocultos, entre los pedidos. */
async function chatsVisibles(supabase: Supabase, u: UsuarioActual, ids: string[]): Promise<Set<string>> {
  const visibles = new Set<string>();
  const areas = areasDe(u);
  for (const tanda of porTandas(ids, 150)) {
    const { data } = await supabase.from("whatsapp_conversaciones").select("id, area, oculta_en").in("id", tanda);
    for (const c of data ?? []) if (areas.includes(c.area as never) && !c.oculta_en) visibles.add(c.id as string);
  }
  return visibles;
}

/** Los motivos por los que más escriben los dropshippers en los últimos `dias` días, solo de los chats que la persona puede ver y que ya se analizaron. */
export async function motivosRecurrentes(dias: number): Promise<MotivosRecurrentes | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const n = [7, 30, 90].includes(dias) ? dias : 30;
  const desde = new Date(Date.now() - n * 86_400_000 - 5 * 3600_000).toISOString().slice(0, 10);
  const supabase = createServiceClient();
  const filas: { conversacion_id: string; dia: string; motivos: string[]; resumen: string; estado: EstadoDia }[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabase.from("whatsapp_actividad").select("conversacion_id, dia, motivos, resumen, estado").gte("dia", desde).order("dia", { ascending: false }).range(d, d + 999);
    if (error) return { desde, chats: 0, dias: 0, sinResolver: 0, motivos: [], falta: true, iaConectada: proveedorTexto() !== null };
    filas.push(...((data ?? []) as typeof filas));
    if ((data ?? []).length < 1000 || filas.length >= 20_000) break;
  }
  const visibles = await chatsVisibles(supabase, u, [...new Set(filas.map((f) => f.conversacion_id))]);
  const mias = filas.filter((f) => visibles.has(f.conversacion_id));
  const frecuencias = frecuenciaDeMotivos(mias);
  const motivos: MotivoRecurrente[] = frecuencias.map((f) => {
    const con = mias.filter((x) => x.estado !== "sin_consulta" && x.motivos.includes(f.id));
    return { ...f, clientes: new Set(con.map((x) => x.conversacion_id)).size, ejemplos: con.slice(0, 3).map((x) => ({ dia: x.dia, resumen: x.resumen })) };
  });
  const ultimoDeCada = new Map<string, (typeof mias)[number]>();
  for (const f of mias) if (!ultimoDeCada.has(f.conversacion_id)) ultimoDeCada.set(f.conversacion_id, f);
  return {
    desde,
    chats: visibles.size,
    dias: mias.length,
    sinResolver: [...ultimoDeCada.values()].filter((f) => f.estado === "pendiente").length,
    motivos,
    falta: false,
    iaConectada: proveedorTexto() !== null,
  };
}

/** Analiza los chats con actividad de los últimos 30 días que tengan días sin analizar, hasta `max` de una vez (cada uno es un pedido a la IA). */
export async function analizarChatsRecientes(max: number): Promise<{ chats: number; dias: number; quedan: boolean } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const tope = Math.min(Math.max(1, Math.floor(max) || 1), 10);
  const supabase = createServiceClient();
  const areas = areasDe(u);
  const { data, error } = await supabase
    .from("whatsapp_conversaciones")
    .select("id, area")
    .in("area", areas)
    .is("oculta_en", null)
    .gte("ultimo_mensaje_en", new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order("ultimo_mensaje_en", { ascending: false })
    .limit(150);
  if (error) return { error: "No se pudo leer la lista de chats." };
  let chats = 0;
  let dias = 0;
  let quedan = false;
  for (const c of data ?? []) {
    if (chats >= tope) {
      // Se llegó al tope: si hay otro chat con días sin analizar, quedan más.
      const msgs = await mensajesDelChat(supabase, c.id as string, false);
      const g = await guardados(supabase, c.id as string);
      if (diasPorAnalizar(agruparPorDia(msgs), new Map(g.filas.map((f) => [f.dia, f.firma]))).length) {
        quedan = true;
        break;
      }
      continue;
    }
    const r = await analizarChat(supabase, u, c.id as string);
    if ("error" in r) return chats ? { chats, dias, quedan: true } : r;
    if (r.analizados) {
      chats += 1;
      dias += r.analizados;
    }
  }
  if (chats) await registrarAuditoria({ accion: "analizar_actividad_whatsapp", entidad: "whatsapp_conversaciones", detalle: `Analizó ${dias} días de ${chats} chats con IA` });
  revalidatePath("/crm-dropshippers/motivos");
  return { chats, dias, quedan };
}

