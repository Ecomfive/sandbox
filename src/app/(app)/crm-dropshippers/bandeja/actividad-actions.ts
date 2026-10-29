"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import type { UsuarioActual } from "@/lib/auth";
import type { ProductoParaCruzar } from "@/lib/crm/productos-chat";
import { modeloDeTexto, pedirIA, proveedorTexto } from "@/lib/publicaciones/ia/proveedor";
import { createServiceClient } from "@/lib/supabase/server";
import {
  agruparPorDia,
  diasPorAnalizar,
  frecuenciaDeMotivos,
  interesPorProducto,
  normalizarAnalisis,
  normalizarPerfil,
  pedidoActividad,
  pedidoPerfil,
  productosDelAnalisis,
  situacionDelCliente,
  tramosDeDias,
  VERSION_ANALISIS,
  type AnalisisDia,
  type DiaGuardado,
  type EstadoDia,
  type FrecuenciaMotivo,
  type InteresEnProducto,
  type MensajeActividad,
  type PerfilCliente,
  type SituacionCliente,
} from "@/lib/whatsapp/actividad";
import { mensajesOcultos } from "@/lib/whatsapp/ocultos";
import { areasDe, conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

// Actividad del cliente (29 oct 2026): por qué escribió un dropshipper cada día y por qué productos preguntó, entendido por la IA a partir de sus mensajes y guardado en
// `whatsapp_actividad` (migraciones 0182 y 0183). Se analiza **toda la conversación** que esté sin analizar, en tramos de días; solo se analizan los días nuevos, cambiados o de una versión
// anterior del análisis: lo ya analizado no se vuelve a pagar. A la IA no llegan teléfonos, correos ni enlaces (`textoParaIA`).

type Supabase = ReturnType<typeof createServiceClient>;

/** Cuántos días se muestran en la ficha. */
const DIAS_EN_FICHA = 60;
/** Cuántos tramos de días se piden a la IA a la vez dentro de un chat. */
const TRAMOS_A_LA_VEZ = 3;
/** Tiempo que se le da a analizar un chat desde su ficha; si la conversación es muy larga, la ficha vuelve a pedir lo que falta. */
const PRESUPUESTO_FICHA_MS = 90_000;
/** Tiempo de todo «Analizar chats recientes» en una llamada. */
const PRESUPUESTO_LOTE_MS = 200_000;
/** Lo que tarda como mucho un pedido a la IA: no se empieza otra tanda si no queda al menos esto. */
const MARGEN_PEDIDO_MS = 45_000;

export interface DiaDelCliente {
  dia: string;
  motivos: string[];
  productos: string[];
  resumen: string;
  estado: EstadoDia;
}

/** El análisis completo de un cliente (migración 0187) con cuándo y quién lo hizo. */
export interface PerfilGuardado extends PerfilCliente {
  analizadoEn: string;
  analizadoPor: string | null;
  /** Con cuántos días analizados se hizo. */
  dias: number;
}

export interface ActividadCliente {
  /** La lectura completa del cliente; null si todavía no se hizo o falta la migración 0187. */
  perfil: PerfilGuardado | null;
  dias: DiaDelCliente[];
  frecuentes: FrecuenciaMotivo[];
  /** Los productos por los que más preguntó este cliente. */
  productos: { nombre: string; dias: number }[];
  situacion: SituacionCliente;
  /** Cuántos días tienen mensajes nuevos, nunca se analizaron o se analizaron con una versión anterior. */
  porAnalizar: number;
  /** Falta correr la migración 0183. */
  falta: boolean;
  /** Hay una clave de IA conectada para analizar. */
  iaConectada: boolean;
}

/** Todos los mensajes del chat, sin los que se autorizó ocultar. Con `conTexto` también el texto (para el análisis). */
async function mensajesDelChat(supabase: Supabase, id: string, conTexto: boolean): Promise<MensajeActividad[]> {
  const ocultos = await mensajesOcultos(supabase, id);
  const todos: MensajeActividad[] = [];
  for (let desde = 0; desde < 40_000; desde += 1000) {
    const base = () => supabase.from("whatsapp_mensajes");
    const { data, error } = conTexto
      ? await base().select("id, direccion, tipo, texto, momento").eq("conversacion_id", id).order("momento", { ascending: true }).range(desde, desde + 999)
      : await base().select("id, direccion, tipo, momento").eq("conversacion_id", id).order("momento", { ascending: true }).range(desde, desde + 999);
    if (error) break;
    const filas = (data ?? []) as { id: string; direccion: string; tipo: string; texto?: string | null; momento: string }[];
    for (const m of filas) if (!ocultos.has(m.id)) todos.push({ id: m.id, direccion: m.direccion, tipo: m.tipo, texto: m.texto ?? null, momento: m.momento });
    if (filas.length < 1000) break;
  }
  return todos;
}

type FilaGuardada = DiaDelCliente & { firma: string; version: number };

async function guardados(supabase: Supabase, id: string): Promise<{ filas: FilaGuardada[]; falta: boolean }> {
  const { data, error } = await supabase
    .from("whatsapp_actividad")
    .select("dia, motivos, productos, resumen, estado, firma, version")
    .eq("conversacion_id", id)
    .order("dia", { ascending: false })
    .limit(2000);
  if (error) return { filas: [], falta: true };
  return {
    filas: (data ?? []).map((f) => ({
      dia: f.dia as string,
      motivos: (f.motivos as string[]) ?? [],
      productos: (f.productos as string[]) ?? [],
      resumen: f.resumen as string,
      estado: f.estado as EstadoDia,
      firma: f.firma as string,
      version: Number(f.version ?? 1),
    })),
    falta: false,
  };
}

/** El análisis completo guardado de un chat. `falta`: todavía no se corrió la migración 0187. */
async function perfilGuardado(supabase: Supabase, id: string): Promise<{ perfil: PerfilGuardado | null; falta: boolean }> {
  const { data, error } = await supabase.from("whatsapp_actividad_cliente").select("datos, dias_analizados, analizado_en, analizado_por").eq("conversacion_id", id).maybeSingle();
  if (error) return { perfil: null, falta: true };
  if (!data) return { perfil: null, falta: false };
  const d = (data.datos ?? {}) as Record<string, unknown>;
  // Se vuelve a validar lo guardado con las mismas reglas que lo que devuelve la IA.
  const perfil = normalizarPerfil(JSON.stringify({ ...d, proxima_accion: d.proximaAccion }));
  if (!perfil) return { perfil: null, falta: false };
  return { perfil: { ...perfil, analizadoEn: data.analizado_en as string, analizadoPor: (data.analizado_por as string | null) ?? null, dias: Number(data.dias_analizados ?? 0) }, falta: false };
}

const mapaDeGuardados = (filas: FilaGuardada[]): Map<string, DiaGuardado> => new Map(filas.map((f) => [f.dia, { firma: f.firma, version: f.version }]));

/** Los productos del catálogo (simples, no descontinuados) para darle a los nombres que escribe la IA el nombre de siempre. */
async function catalogoDeProductos(supabase: Supabase): Promise<ProductoParaCruzar[]> {
  const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre").is("padre_id", null).eq("tipo", "simple").neq("clase", "descontinuado").limit(3000);
  return (data ?? []).map((p) => ({ id: p.id as string, nombre: p.nombre as string, codigo: (p.codigo as string | null) ?? null }));
}

/** La actividad ya analizada de un chat y cuánto falta por analizar. Basta poder abrir el chat. */
export async function actividadDelCliente(conversacionId: string): Promise<ActividadCliente | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  const [msgs, g, conv, pf] = await Promise.all([
    mensajesDelChat(supabase, c.id, false),
    guardados(supabase, c.id),
    supabase.from("whatsapp_conversaciones").select("ultimo_de, ultimo_mensaje_en").eq("id", c.id).maybeSingle(),
    perfilGuardado(supabase, c.id),
  ]);
  const dias = diasPorAnalizar(agruparPorDia(msgs), mapaDeGuardados(g.filas));
  const ultimo = g.filas[0] ?? null;
  const interes = interesPorProducto(g.filas.map((f) => ({ cliente: c.id, productos: f.productos })));
  return {
    perfil: pf.perfil,
    dias: g.filas.slice(0, DIAS_EN_FICHA).map((f) => ({ dia: f.dia, motivos: f.motivos, productos: f.productos, resumen: f.resumen, estado: f.estado })),
    frecuentes: frecuenciaDeMotivos(g.filas),
    productos: interes.map((p) => ({ nombre: p.nombre, dias: p.dias })).slice(0, 8),
    situacion: situacionDelCliente((conv.data?.ultimo_de as string | null) ?? null, (conv.data?.ultimo_mensaje_en as string | null) ?? null, ultimo ? { dia: ultimo.dia, estado: ultimo.estado, resumen: ultimo.resumen } : null),
    porAnalizar: g.falta ? 0 : dias.length,
    falta: g.falta,
    iaConectada: proveedorTexto() !== null,
  };
}

/**
 * Analiza con la IA los días de un chat que faltan, **toda la conversación**: los días sin analizar se parten en tramos y se piden de a `TRAMOS_A_LA_VEZ`, primero los más nuevos.
 * Se detiene al acabarse el tiempo (`limiteMs`): lo que falte lo cuenta `faltan` y se pide otra vez.
 */
async function analizarChat(supabase: Supabase, u: UsuarioActual, id: string, limiteMs: number): Promise<{ analizados: number; faltan: number } | { error: string }> {
  const inicio = Date.now();
  const [msgs, g, catalogo] = await Promise.all([mensajesDelChat(supabase, id, true), guardados(supabase, id), catalogoDeProductos(supabase)]);
  if (g.falta) return { error: "Falta correr la migración 0183 (productos y versión de la actividad del cliente)." };
  const pendientes = diasPorAnalizar(agruparPorDia(msgs), mapaDeGuardados(g.filas));
  if (!pendientes.length) return { analizados: 0, faltan: 0 };
  const tramos = tramosDeDias(pendientes);
  let analizados = 0;
  let primerError: string | null = null;
  const modelo = modeloDeTexto();

  const hacerTramo = async (tramo: typeof pendientes): Promise<number> => {
    const pedido = pedidoActividad(tramo);
    const r = await pedirIA({ instrucciones: pedido.instrucciones, texto: pedido.texto, imagenes: [] }, false, {
      operacion: "actividad_cliente",
      modulo: "crm-dropshippers",
      usuario: { id: u.id, nombre: u.nombre ?? null, email: u.email },
      referencia: id,
    });
    if ("error" in r) {
      primerError ??= r.error;
      return 0;
    }
    const analisis: AnalisisDia[] = normalizarAnalisis(r.texto, tramo.map((d) => d.dia));
    if (!analisis.length) {
      primerError ??= "La IA no devolvió un análisis que se pueda guardar. Inténtalo de nuevo.";
      return 0;
    }
    const porDia = new Map(tramo.map((d) => [d.dia, d]));
    const filas = analisis.map((a) => ({
      conversacion_id: id,
      dia: a.dia,
      motivos: a.motivos,
      productos: productosDelAnalisis(a.productos, catalogo),
      resumen: a.resumen,
      estado: a.estado,
      mensajes: porDia.get(a.dia)?.mensajes.length ?? 0,
      firma: porDia.get(a.dia)?.firma ?? "",
      version: VERSION_ANALISIS,
      modelo,
      analizado_por: u.nombre || u.email,
      analizado_en: new Date().toISOString(),
    }));
    const { error } = await supabase.from("whatsapp_actividad").upsert(filas, { onConflict: "conversacion_id,dia" });
    if (error) {
      primerError ??= "No se pudo guardar el análisis.";
      return 0;
    }
    return filas.length;
  };

  for (let i = 0; i < tramos.length; i += TRAMOS_A_LA_VEZ) {
    if (i > 0 && Date.now() - inicio + MARGEN_PEDIDO_MS > limiteMs) break;
    const ola = await Promise.all(tramos.slice(i, i + TRAMOS_A_LA_VEZ).map(hacerTramo));
    analizados += ola.reduce((a, b) => a + b, 0);
    if (primerError && !analizados) break;
  }
  if (!analizados && primerError) return { error: primerError };
  return { analizados, faltan: Math.max(0, pendientes.length - analizados) };
}

/**
 * El análisis completo del cliente: la IA mira el historial de todos los días ya analizados y los mensajes de los últimos días y arma una lectura más amplia (trato, tono, urgencia,
 * riesgo, compromisos del equipo sin cumplir, oportunidades y qué hacer ahora). Se rehace cada vez: lo que cambió desde la última vez (mensajes nuevos) entra en la lectura nueva.
 */
async function analizarPerfil(supabase: Supabase, u: UsuarioActual, id: string): Promise<{ hecho: true } | { omitido: string } | { error: string }> {
  const [msgs, g] = await Promise.all([mensajesDelChat(supabase, id, true), guardados(supabase, id)]);
  if (g.falta || !g.filas.length) return { omitido: "Todavía no hay días analizados." };
  const pedido = pedidoPerfil(g.filas, agruparPorDia(msgs));
  const r = await pedirIA({ instrucciones: pedido.instrucciones, texto: pedido.texto, imagenes: [] }, false, {
    operacion: "actividad_cliente_completo",
    modulo: "crm-dropshippers",
    usuario: { id: u.id, nombre: u.nombre ?? null, email: u.email },
    referencia: id,
  });
  if ("error" in r) return { error: r.error };
  const perfil = normalizarPerfil(r.texto);
  if (!perfil) return { error: "La IA no devolvió un análisis completo que se pueda guardar. Vuelve a intentarlo." };
  const { error } = await supabase.from("whatsapp_actividad_cliente").upsert(
    { conversacion_id: id, datos: perfil, dias_analizados: g.filas.length, modelo: modeloDeTexto(), analizado_por: u.nombre || u.email, analizado_en: new Date().toISOString() },
    { onConflict: "conversacion_id" },
  );
  if (error) return { error: error.code === "42P01" ? "Falta correr la migración 0187 (análisis completo del cliente)." : "No se pudo guardar el análisis completo." };
  return { hecho: true };
}

/**
 * «Analizar con IA» en la ficha del chat: todos los días sin analizar de la conversación. No hace falta intervenir el chat ni poder escribir en su área (solo mira y guarda el
 * análisis): basta poder escribir en el CRM, porque **cuesta crédito de IA**. Si la conversación es muy larga, devuelve `faltan` y la ficha lo vuelve a pedir.
 */
export async function analizarActividadDelCliente(conversacionId: string): Promise<(ActividadCliente & { analizados: number; faltan: number; aviso: string | null }) | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  const r = await analizarChat(supabase, u, c.id, PRESUPUESTO_FICHA_MS);
  if ("error" in r) return r;
  // El análisis completo se hace al terminar de leer los días; un fallo aquí no tira lo ya analizado, solo se avisa.
  let aviso: string | null = null;
  let completo = false;
  if (!r.faltan) {
    const pf = await analizarPerfil(supabase, u, c.id);
    if ("error" in pf) aviso = pf.error;
    else completo = "hecho" in pf;
  }
  if (r.analizados || completo) {
    const partes = [r.analizados ? `${r.analizados} ${r.analizados === 1 ? "día" : "días"}` : null, completo ? "análisis completo" : null].filter(Boolean);
    await registrarAuditoria({ accion: "analizar_actividad_whatsapp", entidad: "whatsapp_conversaciones", entidadId: c.id, detalle: `Analizó con IA: ${partes.join(" y ")}` });
  }
  const a = await actividadDelCliente(c.id);
  if ("error" in a) return a;
  return { ...a, analizados: r.analizados, faltan: r.faltan, aviso };
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
  /** Los productos por los que más preguntan, de más a menos clientes. */
  productos: InteresEnProducto[];
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

/** Los motivos y los productos por los que más escriben los dropshippers en los últimos `dias` días, solo de los chats que la persona puede ver y que ya se analizaron. */
export async function motivosRecurrentes(dias: number): Promise<MotivosRecurrentes | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const n = [7, 30, 90].includes(dias) ? dias : 30;
  const desde = new Date(Date.now() - n * 86_400_000 - 5 * 3600_000).toISOString().slice(0, 10);
  const supabase = createServiceClient();
  const filas: { conversacion_id: string; dia: string; motivos: string[]; productos: string[]; resumen: string; estado: EstadoDia }[] = [];
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabase
      .from("whatsapp_actividad")
      .select("conversacion_id, dia, motivos, productos, resumen, estado")
      .gte("dia", desde)
      .order("dia", { ascending: false })
      .range(d, d + 999);
    if (error) return { desde, chats: 0, dias: 0, sinResolver: 0, motivos: [], productos: [], falta: true, iaConectada: proveedorTexto() !== null };
    filas.push(...((data ?? []) as typeof filas));
    if ((data ?? []).length < 1000 || filas.length >= 20_000) break;
  }
  const visibles = await chatsVisibles(supabase, u, [...new Set(filas.map((f) => f.conversacion_id))]);
  const mias = filas.filter((f) => visibles.has(f.conversacion_id));
  const motivos: MotivoRecurrente[] = frecuenciaDeMotivos(mias).map((f) => {
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
    productos: interesPorProducto(mias.map((f) => ({ cliente: f.conversacion_id, productos: f.productos ?? [] }))).slice(0, 25),
    falta: false,
    iaConectada: proveedorTexto() !== null,
  };
}

/** Analiza los chats con actividad de los últimos 30 días que tengan días sin analizar, hasta `max` de una vez y mientras alcance el tiempo (cada uno es uno o más pedidos a la IA). */
export async function analizarChatsRecientes(max: number): Promise<{ chats: number; dias: number; quedan: boolean } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const inicio = Date.now();
  const tope = Math.min(Math.max(1, Math.floor(max) || 1), 10);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("whatsapp_conversaciones")
    .select("id, area")
    .in("area", areasDe(u))
    .is("oculta_en", null)
    .gte("ultimo_mensaje_en", new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order("ultimo_mensaje_en", { ascending: false })
    .limit(150);
  if (error) return { error: "No se pudo leer la lista de chats." };
  let chats = 0;
  let dias = 0;
  let quedan = false;
  for (const c of data ?? []) {
    const id = c.id as string;
    if (chats >= tope || Date.now() - inicio + MARGEN_PEDIDO_MS > PRESUPUESTO_LOTE_MS) {
      // Se llegó al tope o al tiempo: si hay otro chat con días sin analizar, quedan más.
      const [msgs, g] = await Promise.all([mensajesDelChat(supabase, id, false), guardados(supabase, id)]);
      if (diasPorAnalizar(agruparPorDia(msgs), mapaDeGuardados(g.filas)).length) {
        quedan = true;
        break;
      }
      continue;
    }
    const r = await analizarChat(supabase, u, id, Math.max(MARGEN_PEDIDO_MS, PRESUPUESTO_LOTE_MS - (Date.now() - inicio)));
    if ("error" in r) return chats ? { chats, dias, quedan: true } : r;
    if (r.analizados) {
      chats += 1;
      dias += r.analizados;
    }
    if (r.faltan) {
      quedan = true;
      break;
    }
  }
  if (chats) await registrarAuditoria({ accion: "analizar_actividad_whatsapp", entidad: "whatsapp_conversaciones", detalle: `Analizó ${dias} días de ${chats} chats con IA` });
  revalidatePath("/crm-dropshippers/motivos");
  return { chats, dias, quedan };
}
