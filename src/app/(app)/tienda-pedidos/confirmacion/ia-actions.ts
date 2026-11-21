"use server";

import { soloSinLimite } from "@/lib/tienda/acceso";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { claveCoincide } from "@/lib/confirmacion-ia/clave";
import { tiendasVisibles } from "@/lib/confirmacion-ia/acceso";
import { etiquetaDeZona, type Combinado, type EstadoAnalisis, type ResultadoModelo } from "@/lib/confirmacion-ia/combinar";
import { coincideConPropuesta, faltaVigente, revisarVeredicto, type DecisionRevision, type Veredicto } from "@/lib/confirmacion-ia/revision";
import { MAX_INSTRUCCIONES } from "@/lib/confirmacion-ia/prompt";
import type { PedidoMuestra, ResultadoPrueba } from "@/lib/confirmacion-ia/prueba-historica";
import { listarMuestraHistorica, probarPedidoHistorico, analizarOrden, analizarPendientes, armarMensajeAdelanto, armarMensajeDato, cargarConfig, enviarMensajeDato as mandarMensajeDato, evaluarDireccion, MAX_MENSAJES, revisarChatDelPedido, SIN_MIGRACION_CONFIRMACION, type EstadoMensaje } from "@/lib/confirmacion-ia/servidor";
import { errorDeRegla, normalizarTexto, permiteAdelanto, ZONAS, type Zona } from "@/lib/confirmacion-ia/zonas";
import { getPaisActual } from "@/lib/pais";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { etiquetasDe, mismaTiendaUnidad } from "@/lib/tienda/ordenes-finanzas";

// Gestión de tienda › Confirmación › Con IA, Direcciones de ejemplo y Palabras de zona (16 nov 2026, pedido de Hernán). Todo es del país elegido arriba y de las tiendas que la persona puede ver.
// Ver pide el módulo Confirmación; agregar, cambiar y analizar, poder modificarlo; encender o apagar la confirmación automática, ser administrador o saber la contraseña.
// Las acciones devuelven el error como valor.

const MODULO = "tienda-confirmacion";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Resultado = { error?: string };
const nombreDe = (u: { nombre: string | null; email: string }) => u.nombre || u.email;

// --- Los interruptores ------------------------------------------------------------------------------------------------------------------------------

export type InterruptorConfirmacion = "activa" | "enviar_mensajes";
const COLUMNA: Record<InterruptorConfirmacion, string> = { activa: "activa", enviar_mensajes: "enviar_mensajes" };
const NOMBRE_INTERRUPTOR: Record<InterruptorConfirmacion, string> = { activa: "la confirmación automática", enviar_mensajes: "el WhatsApp que pide el dato que falta" };

/**
 * Enciende o apaga la confirmación automática (o el WhatsApp que pide el dato que falta). Solo un administrador; quien no lo es tiene que escribir una contraseña
 * (que se define más adelante: mientras no exista, solo un administrador puede cambiarlo).
 */
export async function cambiarInterruptor(campo: InterruptorConfirmacion, valor: boolean, clave?: string): Promise<Resultado> {
  const usuario = await requireModulo(MODULO);
  // Es del país entero (17 nov 2026): quien tiene tiendas limitadas no lo cambia.
  const limite = await soloSinLimite();
  if (limite) return { error: limite };
  if (!(campo in COLUMNA)) return { error: "Interruptor no válido." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { config, faltaMigracion } = await cargarConfig(supabase, pais.id);
  if (faltaMigracion) return { error: SIN_MIGRACION_CONFIRMACION };
  if (!esAdministrador(usuario)) {
    if (!config.tieneClave) return { error: "Solo un administrador puede encender o apagarla. La contraseña para otras personas todavía no está definida." };
    const { data } = await supabase.from("confirmacion_ia_config").select("clave_cambio_hash").eq("pais_id", pais.id).maybeSingle();
    if (!claveCoincide(String(clave ?? ""), (data?.clave_cambio_hash as string | null) ?? null)) return { error: "La contraseña no es correcta." };
  }
  const { error } = await supabase.from("confirmacion_ia_config").upsert({ pais_id: pais.id, [COLUMNA[campo]]: valor === true, actualizado_en: new Date().toISOString(), actualizado_por: nombreDe(usuario) }, { onConflict: "pais_id" });
  if (error) return { error: "No se pudo guardar." };
  await registrarAuditoria({
    accion: "cambiar_confirmacion_ia",
    entidad: "paises",
    entidadId: pais.id,
    detalle: `${pais.nombre}: ${valor ? "encendió" : "apagó"} ${NOMBRE_INTERRUPTOR[campo]}${esAdministrador(usuario) ? "" : " (con la contraseña)"}`,
  });
  revalidatePath("/tienda-pedidos/confirmacion/ia");
  return {};
}

// --- Instrucciones de la IA (solo administradores) ------------------------------------------------------------------------------------------------

/** Guarda las instrucciones extra que se suman a las internas de la IA en este país. Solo un administrador. */
export async function guardarInstrucciones(texto: string): Promise<Resultado> {
  const usuario = await requireModulo(MODULO);
  if (!esAdministrador(usuario)) return { error: "Solo un administrador puede cambiar las instrucciones de la IA." };
  const limpio = String(texto ?? "").replace(/\r\n/g, "\n").trim();
  if (limpio.length > MAX_INSTRUCCIONES) return { error: `Son muchas letras: el máximo es ${MAX_INSTRUCCIONES}.` };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { faltaMigracion } = await cargarConfig(supabase, pais.id);
  if (faltaMigracion) return { error: SIN_MIGRACION_CONFIRMACION };
  const { error } = await supabase.from("confirmacion_ia_config").upsert({ pais_id: pais.id, instrucciones: limpio || null, actualizado_en: new Date().toISOString(), actualizado_por: nombreDe(usuario) }, { onConflict: "pais_id" });
  if (error) return { error: "No se pudo guardar." };
  await registrarAuditoria({ accion: "cambiar_instrucciones_confirmacion_ia", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: cambió las instrucciones de la IA (${limpio.length} letras)` });
  revalidatePath("/tienda-pedidos/confirmacion/ia");
  return {};
}

// --- Direcciones de ejemplo ---------------------------------------------------------------------------------------------------------------------------

export interface EjemploDireccion {
  id: string;
  /** La ciudad o el corregimiento que puso el cliente. */
  ciudad: string | null;
  direccion: string;
  completa: boolean;
  falta: string | null;
  zona: Zona | null;
  tiendaId: string | null;
  tienda: string | null;
  creadoPor: string | null;
  /** Lo agregó quien está viendo la lista. */
  mio: boolean;
  creadoEn: string;
}

export interface DatosEjemplo {
  ciudad: string;
  direccion: string;
  completa: boolean;
  falta?: string | null;
  zona?: Zona | null;
  tiendaId?: string | null;
}

/** Valida lo que manda el navegador y lo deja listo para guardar (la tienda debe ser del país y de las que la persona ve). */
async function leerEjemplo(d: DatosEjemplo, distingueZona: boolean, tiendasOk: string[], conAdelanto = true): Promise<{ fila: { ciudad: string; direccion: string; completa: boolean; falta: string | null; zona: Zona | null; tienda_id: string | null } } | { error: string }> {
  const ciudad = String(d?.ciudad ?? "").replace(/\s+/g, " ").trim();
  if (ciudad.length < 2) return { error: "Escribe la ciudad o el corregimiento: es lo más importante para saber de dónde es." };
  if (ciudad.length > 120) return { error: "La ciudad o el corregimiento es muy largo (hasta 120 letras)." };
  const direccion = String(d?.direccion ?? "").replace(/\s+/g, " ").trim();
  if (direccion.length < 5) return { error: "Escribe la dirección completa tal como la dejó el cliente." };
  if (direccion.length > 600) return { error: "La dirección es muy larga (hasta 600 letras)." };
  if (typeof d.completa !== "boolean") return { error: "Elige si la dirección está completa o incompleta." };
  const falta = d.completa ? null : String(d.falta ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
  if (!d.completa && !falta) return { error: "Escribe qué le falta a la dirección." };
  if (d.zona === "adelantado" && !conAdelanto) return { error: "En este país no hay pago por adelantado: elige ciudad o interior." };
  const zona = distingueZona && d.zona && (ZONAS as string[]).includes(d.zona) ? d.zona : null;
  const tienda = d.tiendaId ? String(d.tiendaId) : null;
  if (tienda && (!UUID.test(tienda) || !tiendasOk.includes(tienda))) return { error: "Esa tienda no es de este país o no tienes acceso a ella." };
  return { fila: { ciudad, direccion, completa: d.completa, falta, zona, tienda_id: tienda } };
}

/** Las últimas direcciones de ejemplo agregadas (de las tiendas que la persona ve y las generales del país), del más nuevo al más viejo. `solo: "mios"` deja las que agregó ella. */
export async function listarEjemplos(solo: "todos" | "mios" = "todos", limite = 20): Promise<{ ejemplos: EjemploDireccion[]; total: number; error?: string }> {
  const usuario = await requireModulo(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, limitado } = await tiendasVisibles(supabase, pais.id);
  let q = supabase.from("confirmacion_ia_ejemplos").select("id, ciudad, direccion, completa, falta, zona, tienda_id, creado_por, creado_por_nombre, creado_en", { count: "exact" }).eq("pais_id", pais.id);
  if (limitado) q = tiendas.length ? q.in("tienda_id", tiendas.map((t) => t.id)) : q.eq("tienda_id", "00000000-0000-0000-0000-000000000000");
  if (solo === "mios") q = q.eq("creado_por", usuario.id);
  const { data, count, error } = await q.order("creado_en", { ascending: false }).limit(Math.min(Math.max(1, limite), 100));
  if (error) return { ejemplos: [], total: 0, error: /confirmacion_ia|schema cache/i.test(error.message) ? SIN_MIGRACION_CONFIRMACION : "No se pudieron leer los ejemplos." };
  const nombre = new Map(tiendas.map((t) => [t.id, t.nombre]));
  return {
    total: count ?? (data ?? []).length,
    ejemplos: (data ?? []).map((e) => ({
      id: e.id as string,
      ciudad: (e.ciudad as string | null) ?? null,
      direccion: e.direccion as string,
      completa: e.completa === true,
      falta: (e.falta as string | null) ?? null,
      zona: (e.zona as Zona | null) ?? null,
      tiendaId: (e.tienda_id as string | null) ?? null,
      tienda: e.tienda_id ? (nombre.get(e.tienda_id as string) ?? null) : null,
      creadoPor: (e.creado_por_nombre as string | null) ?? null,
      mio: e.creado_por === usuario.id,
      creadoEn: e.creado_en as string,
    })),
  };
}

/** Cuántos ejemplos hay en total (sin traerlos): el número que se ve en la pantalla. */
export async function contarEjemplos(): Promise<number> {
  await requireModulo(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, limitado } = await tiendasVisibles(supabase, pais.id);
  let q = supabase.from("confirmacion_ia_ejemplos").select("id", { count: "exact", head: true }).eq("pais_id", pais.id);
  if (limitado) q = tiendas.length ? q.in("tienda_id", tiendas.map((t) => t.id)) : q.eq("tienda_id", "00000000-0000-0000-0000-000000000000");
  const { count } = await q;
  return count ?? 0;
}

export async function agregarEjemplo(d: DatosEjemplo): Promise<Resultado> {
  const usuario = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [{ config, faltaMigracion }, { tiendas, limitado }] = await Promise.all([cargarConfig(supabase, pais.id), tiendasVisibles(supabase, pais.id)]);
  if (faltaMigracion) return { error: SIN_MIGRACION_CONFIRMACION };
  // Quien ve solo algunas tiendas agrega solo para ellas (no «para todas»).
  if (limitado && !d?.tiendaId) return { error: "Elige la tienda de la dirección." };
  const l = await leerEjemplo(d, config.distingueZona, tiendas.map((t) => t.id), permiteAdelanto(pais.codigo));
  if ("error" in l) return l;
  const { error } = await supabase.from("confirmacion_ia_ejemplos").insert({ ...l.fila, pais_id: pais.id, creado_por: usuario.id, creado_por_nombre: nombreDe(usuario) });
  if (error) return { error: /ciudad|schema cache/i.test(error.message) ? "Falta correr la migración 0301 (ciudad o corregimiento de los ejemplos) en Supabase." : "No se pudo guardar la dirección." };
  await registrarAuditoria({ accion: "agregar_ejemplo_confirmacion_ia", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: dirección ${l.fila.completa ? "completa" : "incompleta"} de ejemplo` });
  revalidatePath("/tienda-pedidos/confirmacion/ejemplos");
  return {};
}

/** Un ejemplo que la persona puede cambiar: del país y de una tienda que ve (o general, si no tiene límite). */
async function ejemploPermitido(id: string) {
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data } = await supabase.from("confirmacion_ia_ejemplos").select("id, tienda_id").eq("id", id).eq("pais_id", pais.id).maybeSingle();
  if (!data) return null;
  const { tiendas, limitado } = await tiendasVisibles(supabase, pais.id);
  if (limitado && !(data.tienda_id && tiendas.some((t) => t.id === data.tienda_id))) return null;
  return { supabase, pais, tiendas, limitado };
}

export async function editarEjemplo(id: string, d: DatosEjemplo): Promise<Resultado> {
  await requireModuloEscritura(MODULO);
  if (!UUID.test(String(id))) return { error: "Ejemplo no válido." };
  const ctx = await ejemploPermitido(id);
  if (!ctx) return { error: "Ese ejemplo ya no está o no tienes acceso." };
  // Igual que al agregar: con límite no se puede pasar a «para todas» (un ejemplo general entra en las demás tiendas del país;
  // auditoría de seguridad, 18 nov 2026).
  if (ctx.limitado && !d?.tiendaId) return { error: "Elige la tienda de la dirección." };
  const { config } = await cargarConfig(ctx.supabase, ctx.pais.id);
  const l = await leerEjemplo(d, config.distingueZona, ctx.tiendas.map((t) => t.id), permiteAdelanto(ctx.pais.codigo));
  if ("error" in l) return l;
  const { error } = await ctx.supabase.from("confirmacion_ia_ejemplos").update(l.fila).eq("id", id);
  if (error) return { error: /ciudad|schema cache/i.test(error.message) ? "Falta correr la migración 0301 (ciudad o corregimiento de los ejemplos) en Supabase." : "No se pudo guardar." };
  await registrarAuditoria({ accion: "editar_ejemplo_confirmacion_ia", entidad: "paises", entidadId: ctx.pais.id, detalle: `${ctx.pais.nombre}: cambió una dirección de ejemplo` });
  revalidatePath("/tienda-pedidos/confirmacion/ejemplos");
  return {};
}

export async function eliminarEjemplo(id: string): Promise<Resultado> {
  await requireModuloEscritura(MODULO);
  if (!UUID.test(String(id))) return { error: "Ejemplo no válido." };
  const ctx = await ejemploPermitido(id);
  if (!ctx) return { error: "Ese ejemplo ya no está o no tienes acceso." };
  const { error } = await ctx.supabase.from("confirmacion_ia_ejemplos").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar." };
  await registrarAuditoria({ accion: "eliminar_ejemplo_confirmacion_ia", entidad: "paises", entidadId: ctx.pais.id, detalle: `${ctx.pais.nombre}: borró una dirección de ejemplo` });
  revalidatePath("/tienda-pedidos/confirmacion/ejemplos");
  return {};
}

// --- Palabras de zona ---------------------------------------------------------------------------------------------------------------------------------

export interface PalabraZona {
  id: string;
  texto: string;
  resultado: Zona;
  /** Una sola palabra o varias juntas. */
  compuesta: boolean;
  creadoPor: string | null;
  creadoEn: string;
}

export async function listarPalabrasZona(): Promise<{ palabras: PalabraZona[]; error?: string }> {
  await requireModulo(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data, error } = await supabase.from("confirmacion_ia_zonas").select("id, texto, clave, resultado, creado_por_nombre, creado_en").eq("pais_id", pais.id).order("texto").limit(1000);
  if (error) return { palabras: [], error: /confirmacion_ia|schema cache/i.test(error.message) ? SIN_MIGRACION_CONFIRMACION : "No se pudieron leer las palabras." };
  return {
    palabras: (data ?? []).map((p) => ({
      id: p.id as string,
      texto: p.texto as string,
      resultado: p.resultado as Zona,
      compuesta: (p.clave as string).includes(" "),
      creadoPor: (p.creado_por_nombre as string | null) ?? null,
      creadoEn: p.creado_en as string,
    })),
  };
}

export async function agregarPalabraZona(texto: string, resultado: Zona): Promise<Resultado> {
  const usuario = await requireModuloEscritura(MODULO);
  // Es del país entero (17 nov 2026): quien tiene tiendas limitadas no lo cambia.
  const limite = await soloSinLimite();
  if (limite) return { error: limite };
  const mal = errorDeRegla(texto);
  if (mal) return { error: mal };
  if (!(ZONAS as string[]).includes(resultado)) return { error: "Elige si es de ciudad, del interior o de pago por adelantado." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (resultado === "adelantado" && !permiteAdelanto(pais.codigo)) return { error: "En este país no hay pago por adelantado: elige ciudad o interior." };
  const { config, faltaMigracion } = await cargarConfig(supabase, pais.id);
  if (faltaMigracion) return { error: SIN_MIGRACION_CONFIRMACION };
  if (!config.distingueZona) return { error: `En ${pais.nombre} no se distingue ciudad e interior: todavía no se usan palabras de zona.` };
  const limpio = String(texto).replace(/\s+/g, " ").trim();
  const { error } = await supabase.from("confirmacion_ia_zonas").insert({ pais_id: pais.id, texto: limpio, clave: normalizarTexto(limpio), resultado, creado_por: usuario.id, creado_por_nombre: nombreDe(usuario) });
  if (error) return { error: error.code === "23505" ? "Esa palabra ya está en la lista." : "No se pudo guardar." };
  await registrarAuditoria({ accion: "agregar_palabra_zona_confirmacion_ia", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: «${limpio}» → ${resultado}` });
  revalidatePath("/tienda-pedidos/confirmacion/zonas");
  return {};
}

export async function eliminarPalabraZona(id: string): Promise<Resultado> {
  await requireModuloEscritura(MODULO);
  // Es del país entero (17 nov 2026): quien tiene tiendas limitadas no lo cambia.
  const limite = await soloSinLimite();
  if (limite) return { error: limite };
  if (!UUID.test(String(id))) return { error: "Palabra no válida." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data } = await supabase.from("confirmacion_ia_zonas").select("texto").eq("id", id).eq("pais_id", pais.id).maybeSingle();
  if (!data) return { error: "Esa palabra ya no está." };
  const { error } = await supabase.from("confirmacion_ia_zonas").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar." };
  await registrarAuditoria({ accion: "eliminar_palabra_zona_confirmacion_ia", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: quitó «${data.texto}»` });
  revalidatePath("/tienda-pedidos/confirmacion/zonas");
  return {};
}

// --- Pago por adelantado: cómo paga el cliente, por tienda (las zonas son «palabras de zona») ----------------------------------------------------------------------------------------------

const SIN_MIGRACION_ADELANTO = "Falta correr la migración 0312 (pago por adelantado) en Supabase.";

export interface MetodosPagoTienda {
  tiendaId: string;
  tienda: string;
  /** Cómo paga el cliente en esa tienda (Yappy, cuenta…), tal como va en el mensaje; vacío si todavía no se registró. */
  texto: string;
}

/** Los métodos de pago por adelantado de las tiendas que la persona ve (cada tienda tiene los suyos). Sin la migración, la lista sale vacía. */
export async function listarMetodosPago(): Promise<{ metodos: MetodosPagoTienda[]; error?: string }> {
  await requireModulo(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas } = await tiendasVisibles(supabase, pais.id);
  if (!tiendas.length) return { metodos: [] };
  const { data, error } = await supabase.from("tiendas").select("id, pago_adelantado_instrucciones").in("id", tiendas.map((t) => t.id));
  if (error) return { metodos: tiendas.map((t) => ({ tiendaId: t.id, tienda: t.nombre, texto: "" })), error: SIN_MIGRACION_ADELANTO };
  const porId = new Map((data ?? []).map((t) => [t.id as string, ((t.pago_adelantado_instrucciones as string | null) ?? "").trim()]));
  return { metodos: tiendas.map((t) => ({ tiendaId: t.id, tienda: t.nombre, texto: porId.get(t.id) ?? "" })) };
}

/** Guarda cómo paga el cliente por adelantado en una tienda (vacío lo quita): va tal cual en el mensaje que el asesor le manda. */
export async function guardarMetodosPago(tiendaId: string, texto: string): Promise<Resultado> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!UUID.test(String(tiendaId))) return { error: "Tienda no válida." };
  const limpio = String(texto ?? "").replace(/\r\n/g, "\n").trim();
  if (limpio.length > 1000) return { error: "Es muy largo: el máximo es 1000 letras." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas } = await tiendasVisibles(supabase, pais.id);
  const tienda = tiendas.find((t) => t.id === tiendaId);
  if (!tienda) return { error: "Esa tienda no es de este país o no tienes acceso a ella." };
  const { error } = await supabase.from("tiendas").update({ pago_adelantado_instrucciones: limpio || null }).eq("id", tiendaId);
  if (error) return { error: /pago_adelantado|schema cache|column/i.test(error.message) ? SIN_MIGRACION_ADELANTO : "No se pudo guardar." };
  await registrarAuditoria({ accion: "cambiar_metodos_pago_adelanto", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: ${nombreDe(usuario)} ${limpio ? "cambió" : "quitó"} los métodos de pago por adelantado de ${tienda.nombre}` });
  revalidatePath("/tienda-pedidos/confirmacion/ia");
  return {};
}

// --- Analizar ------------------------------------------------------------------------------------------------------------------------------------------------

/** Un pedido de las tiendas que la persona ve (y del país elegido). */
async function pedidoPermitido(ordenId: string) {
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: o } = await supabase.from("ven_ordenes").select("id, fin_unidades(nombre, pais_id)").eq("id", ordenId).maybeSingle();
  const unidad = (Array.isArray(o?.fin_unidades) ? o?.fin_unidades[0] : o?.fin_unidades) as { nombre: string; pais_id: string } | null | undefined;
  if (!o || !unidad || unidad.pais_id !== pais.id) return null;
  const { tiendas, limitado } = await tiendasVisibles(supabase, pais.id);
  if (limitado) {
    if (!tiendas.some((t) => mismaTiendaUnidad(t.nombre, unidad.nombre))) return null;
  }
  return { supabase, pais };
}

/** Analiza un pedido ahora (aunque la confirmación automática esté apagada), o lo vuelve a analizar. */
export async function analizarPedidoAhora(ordenId: string): Promise<Resultado & { estado?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!UUID.test(String(ordenId))) return { error: "Pedido no válido." };
  const ctx = await pedidoPermitido(ordenId);
  if (!ctx) return { error: "Ese pedido no es de las tiendas que ves." };
  const r = await analizarOrden(ctx.supabase, ordenId, { origen: "pantalla", forzar: true, por: nombreDe(usuario) });
  if (r.resultado === "omitida") return { error: r.motivo };
  await registrarAuditoria({ accion: "analizar_direccion_confirmacion_ia", entidad: "ven_ordenes", entidadId: ordenId, detalle: `Analizó la dirección del pedido: ${r.estado}` });
  revalidatePath("/tienda-pedidos/confirmacion/ia");
  return { estado: r.estado };
}

/** Analiza los confirmados de los últimos días que todavía no tienen análisis (hasta 5 por vez). */
export async function analizarPendientesAhora(): Promise<Resultado & { analizadas?: number; pendientes?: number }> {
  const usuario = await requireModuloEscritura(MODULO);
  // Es del país entero (17 nov 2026): quien tiene tiendas limitadas no lo cambia.
  const limite = await soloSinLimite();
  if (limite) return { error: limite };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { config } = await cargarConfig(supabase, pais.id);
  if (!config.activa) return { error: "La confirmación automática está apagada: enciéndela para que analice los pedidos confirmados." };
  const r = await analizarPendientes(supabase, pais.id, 5, nombreDe(usuario));
  revalidatePath("/tienda-pedidos/confirmacion/ia");
  return r;
}

/** Prueba una dirección escrita a mano (no se guarda ni se manda nada): qué diría el sistema. */
export async function probarDireccion(direccion: string, ciudad: string, tiendaId: string | null): Promise<Resultado & { combinado?: Combinado; modelos?: ResultadoModelo[]; palabras?: { texto: string; resultado: Zona }[]; etiqueta?: string | null }> {
  await requireModuloEscritura(MODULO);
  const texto = String(direccion ?? "").replace(/\s+/g, " ").trim();
  if (texto.length < 3) return { error: "Escribe la dirección que quieres probar." };
  if (String(ciudad ?? "").trim().length < 2) return { error: "Escribe la ciudad o el corregimiento: es lo más importante para saber de dónde es." };
  if (texto.length > 600) return { error: "La dirección es muy larga (hasta 600 letras)." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const [{ config, faltaMigracion }, { tiendas }] = await Promise.all([cargarConfig(supabase, pais.id), tiendasVisibles(supabase, pais.id)]);
  if (faltaMigracion) return { error: SIN_MIGRACION_CONFIRMACION };
  const tienda = tiendaId && UUID.test(tiendaId) && tiendas.some((t) => t.id === tiendaId) ? tiendaId : null;
  const r = await evaluarDireccion(supabase, { paisId: pais.id, paisNombre: pais.nombre, paisCodigo: pais.codigo, tiendaId: tienda, numero: null, direccion: texto, ciudad: String(ciudad ?? "").trim().slice(0, 120) || null, config });
  return { combinado: r.combinado, modelos: r.modelos, palabras: r.coinc.map((p) => ({ texto: p.texto, resultado: p.resultado })), etiqueta: r.combinado.estado === "listo" ? etiquetaDeZona(r.combinado.zona, config) : null };
}

/**
 * Lo que el equipo marca como correcto en un pedido analizado (16 nov 2026, pedido de Hernán). Tres casos con los mismos botones: resolver uno que las IA no pudieron decidir («Para revisar»),
 * corregir uno que salió «listo» o «falta un dato», o dar el visto bueno (`{ acierto: true }`) a lo que propuso el sistema. Lo marcado manda sobre lo que dijo la IA para ese pedido y, si no es un
 * simple visto bueno, se guarda además como dirección de ejemplo (de origen «revision») para que la IA aprenda; si se vuelve a marcar, el ejemplo se cambia, no se repite.
 */
export async function revisarAnalisis(
  analisisId: string,
  d: DecisionRevision,
): Promise<Resultado & { pedirDato?: PedirDato }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!UUID.test(String(analisisId))) return { error: "Análisis no válido." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: a, error: errLeer } = await supabase
    .from("confirmacion_ia_analisis")
    .select("id, direccion, ciudad, tienda_id, estado, zona, completa, falta, rev_ejemplo_id")
    .eq("id", analisisId)
    .eq("pais_id", pais.id)
    .maybeSingle();
  if (errLeer) return { error: /rev_|schema cache|column/i.test(errLeer.message) ? "Falta correr la migración 0307 (revisión de la confirmación con IA) en Supabase." : "No se pudo leer el análisis." };
  if (!a) return { error: "Ese análisis ya no existe." };
  const [{ config }, { tiendas, limitado }] = await Promise.all([cargarConfig(supabase, pais.id), tiendasVisibles(supabase, pais.id)]);
  if (limitado && !tiendas.some((t) => t.id === a.tienda_id)) return { error: "Ese pedido no es de las tiendas que ves." };
  const estado = a.estado as EstadoAnalisis;
  const nombre = nombreDe(usuario);
  const ahora = new Date().toISOString();
  const propuesta = { estado, zona: (a.zona as Zona | null) ?? null };

  let veredicto: Veredicto;
  let ok: boolean | null;
  if ("acierto" in d) {
    // «Está bien»: solo tiene sentido cuando el sistema había propuesto algo.
    if (estado !== "listo" && estado !== "falta_dato") return { error: "Este pedido no tiene una propuesta que confirmar: elige lo correcto." };
    veredicto = { completa: estado === "listo", zona: estado === "listo" ? propuesta.zona : null, falta: estado === "falta_dato" ? ((a.falta as string | null) ?? null) : null };
    ok = true;
  } else {
    const v = revisarVeredicto(d, config.distingueZona, permiteAdelanto(pais.codigo));
    if ("error" in v) return v;
    veredicto = v.veredicto;
    ok = coincideConPropuesta(propuesta, veredicto, config.distingueZona);
  }

  // El ejemplo para la IA: solo cuando el equipo cambió o decidió algo (un visto bueno no enseña nada nuevo y llenaría la lista).
  let ejemploId: string | null = null;
  const direccion = String(a.direccion ?? "").replace(/\s+/g, " ").trim();
  if (!("acierto" in d)) {
    const ciudad = String(("ciudad" in d ? d.ciudad : null) ?? a.ciudad ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (veredicto.completa && ciudad.length < 2) return { error: "Escribe la ciudad o el corregimiento: es lo más importante para saber de dónde es." };
    if (direccion.length >= 5) {
      const fila = {
        pais_id: pais.id,
        tienda_id: (a.tienda_id as string | null) ?? null,
        ciudad: ciudad.length >= 2 ? ciudad : null,
        direccion: direccion.slice(0, 600),
        completa: veredicto.completa,
        falta: veredicto.completa ? null : veredicto.falta,
        zona: veredicto.completa ? veredicto.zona : null,
        origen: "revision",
        creado_por: usuario.id,
        creado_por_nombre: nombre,
      };
      const previoId = (a.rev_ejemplo_id as string | null) ?? null;
      if (previoId) {
        const { error } = await supabase.from("confirmacion_ia_ejemplos").update(fila).eq("id", previoId);
        if (!error) ejemploId = previoId;
      }
      if (!ejemploId) {
        const { data: nuevo, error } = await supabase.from("confirmacion_ia_ejemplos").insert(fila).select("id").single();
        if (error) return { error: /origen|schema cache|column/i.test(error.message) ? "Falta correr la migración 0307 (revisión de la confirmación con IA) en Supabase." : "No se pudo guardar el ejemplo." };
        ejemploId = nuevo.id as string;
      }
    }
  } else if (a.rev_ejemplo_id) {
    // Antes se había corregido y ahora se deja «está bien»: ese ejemplo ya no vale.
    await supabase.from("confirmacion_ia_ejemplos").delete().eq("id", a.rev_ejemplo_id as string);
  }

  const { error } = await supabase
    .from("confirmacion_ia_analisis")
    .update({ rev_completa: veredicto.completa, rev_zona: veredicto.zona, rev_falta: veredicto.falta, rev_ok: ok, rev_por: usuario.id, rev_por_nombre: nombre, rev_en: ahora, rev_ejemplo_id: ejemploId })
    .eq("id", analisisId);
  if (error) return { error: /rev_|schema cache|column/i.test(error.message) ? "Falta correr la migración 0307 (revisión de la confirmación con IA) en Supabase." : "No se pudo guardar." };
  await registrarAuditoria({
    accion: "revisar_confirmacion_ia",
    entidad: "paises",
    entidadId: pais.id,
    detalle: `${pais.nombre}: ${"acierto" in d ? "dio el visto bueno a" : "marcó como correcto"} un pedido (${veredicto.completa ? `completa${veredicto.zona ? ` · ${veredicto.zona}` : ""}` : `falta ${veredicto.falta}`})`,
  });
  revalidatePath("/tienda-pedidos/confirmacion/ia");
  revalidatePath("/tienda-pedidos/confirmacion/ejemplos");
  // Falta un dato: la pantalla le pregunta a la persona si le manda el mensaje al cliente o si ya se lo mandó a mano (no se manda solo).
  if (!veredicto.completa && veredicto.falta) {
    const p = await prepararPedirDato(supabase, analisisId);
    if (!("error" in p)) return { pedirDato: await conLoDelChat(supabase, analisisId, p) };
  }
  return {};
}

// --- Pedirle al cliente el dato que falta (lo decide una persona) ----------------------------------------------------------------------------------

/** Lo que la pantalla muestra para preguntar si se le manda el mensaje al cliente. */
export interface PedirDato {
  analisisId: string;
  numero: string | null;
  /** `dato`: falta algo de la dirección; `adelanto`: es una zona de pago por adelantado y se le pide el pago. */
  tipo: "dato" | "adelanto";
  /** Lo que falta de la dirección, como se le pediría («pago por adelantado» si es de esa zona). */
  falta: string;
  /** El mensaje que se le mandaría. */
  mensaje: string;
  /** Solo en pago por adelantado: la tienda todavía no tiene métodos de pago registrados (el mensaje sale sin ellos). */
  sinMetodos?: boolean;
  /** Qué pasó antes con el mensaje de este pedido (por ejemplo «enviado»: ya se le había pedido). */
  estado: EstadoMensaje;
  enviados: number;
  /** Lo que dice el chat de iComfly: `ya` true = el bot o un asesor ya se lo pidió; false = todavía no; null = no se pudo saber. Ausente si no hay chat o no se revisó. */
  chat?: { ya: boolean | null; motivo: string };
}

/** Lee el análisis (del país y de las tiendas que la persona ve) y arma la pregunta. Sin migración 0307, lo que falta se toma de lo que dijo la IA. */
async function prepararPedirDato(supabase: ReturnType<typeof createServiceClient>, analisisId: string): Promise<PedirDato | { error: string }> {
  const pais = await getPaisActual(supabase);
  const leer = (columnas: string) => supabase.from("confirmacion_ia_analisis").select(columnas).eq("id", analisisId).eq("pais_id", pais.id).maybeSingle();
  let r = await leer("id, orden_id, tienda_id, estado, falta, mensaje_estado, mensajes_enviados, rev_completa, rev_zona, rev_falta, rev_en");
  if (r.error) r = await leer("id, orden_id, tienda_id, estado, falta, mensaje_estado, mensajes_enviados");
  const a = r.data as unknown as Record<string, unknown> | null;
  if (r.error || !a) return { error: "Ese análisis ya no existe." };
  const { tiendas, limitado } = await tiendasVisibles(supabase, pais.id);
  if (limitado && !tiendas.some((t) => t.id === a.tienda_id)) return { error: "Ese pedido no es de las tiendas que ves." };
  const { data: o } = await supabase.from("ven_ordenes").select("numero, etiquetas").eq("id", a.orden_id as string).maybeSingle();
  const base = { analisisId, numero: (o?.numero as string | null) ?? null, estado: (a.mensaje_estado as EstadoMensaje) ?? "no_aplica", enviados: Number(a.mensajes_enviados ?? 0) };
  // Pedido de una zona de pago por adelantado (por las palabras de zona o porque el equipo lo marcó así): se le avisa del pago, no se le pide un dato. Manda sobre «falta un dato» (18 nov 2026):
  // mientras el pago no llegue (el pedido no trae todavía la etiqueta de zona) solo se cobra; la dirección se pide después.
  const pagado = etiquetasDe((o?.etiquetas as string | null) ?? null).some((e) => /^(ciudad|interior)\b/i.test(e));
  if ((a.estado === "adelantado" && (!a.rev_en || (a.rev_completa === false && !pagado))) || (a.rev_en && a.rev_completa && a.rev_zona === "adelantado")) {
    const adelanto = await armarMensajeAdelanto(supabase, a.orden_id as string);
    if ("error" in adelanto) return adelanto;
    return { ...base, tipo: "adelanto", falta: "pago por adelantado", mensaje: adelanto.mensaje, sinMetodos: adelanto.sinMetodos };
  }
  const falta = faltaVigente(a);
  if (!falta) return { error: "A este pedido ya no le falta ningún dato." };
  const m = await armarMensajeDato(supabase, a.orden_id as string, falta);
  if ("error" in m) return m;
  return { ...base, tipo: "dato", falta, mensaje: m.mensaje };
}

/** Le agrega a la pregunta lo que dice el chat de iComfly (si ya se lo pidieron). Nunca falla: sin chat o sin IA, la pregunta queda como estaba. */
async function conLoDelChat(supabase: ReturnType<typeof createServiceClient>, analisisId: string, p: PedirDato): Promise<PedirDato> {
  try {
    const { data: a } = await supabase.from("confirmacion_ia_analisis").select("orden_id").eq("id", analisisId).maybeSingle();
    if (!a) return p;
    const v = await revisarChatDelPedido(supabase, a.orden_id as string, { tipo: p.tipo, falta: p.tipo === "dato" ? p.falta : null });
    return v ? { ...p, chat: v } : p;
  } catch {
    return p;
  }
}

/** La pregunta «¿le mando el mensaje?» de un pedido que falta un dato (para pedirlo desde su ficha). */
export async function vistaPreviaMensajeDato(analisisId: string): Promise<{ error?: string; pedirDato?: PedirDato }> {
  await requireModuloEscritura(MODULO);
  if (!UUID.test(String(analisisId))) return { error: "Análisis no válido." };
  const supabase = createServiceClient();
  const p = await prepararPedirDato(supabase, analisisId);
  return "error" in p ? p : { pedirDato: await conLoDelChat(supabase, analisisId, p) };
}

/**
 * Manda por iComfly el mensaje que pide el dato que falta. Lo pide una persona con un botón (no depende del interruptor del WhatsApp automático) y se manda lo mismo que vio en pantalla.
 * Solo con la ventana de 24 horas abierta: si no, devuelve `pendiente_plantilla` y no se manda nada. Como mucho `MAX_MENSAJES` veces por pedido.
 */
export async function enviarMensajeDato(analisisId: string): Promise<{ error?: string; estado?: EstadoMensaje }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!UUID.test(String(analisisId))) return { error: "Análisis no válido." };
  const supabase = createServiceClient();
  const p = await prepararPedirDato(supabase, analisisId);
  if ("error" in p) return p;
  if (p.enviados >= MAX_MENSAJES) return { error: `A este cliente ya se le pidió el dato ${MAX_MENSAJES} veces.` };
  const { data: a } = await supabase.from("confirmacion_ia_analisis").select("orden_id").eq("id", analisisId).maybeSingle();
  if (!a) return { error: "Ese análisis ya no existe." };
  const r = await mandarMensajeDato(supabase, a.orden_id as string, p.mensaje);
  const { error } = await supabase
    .from("confirmacion_ia_analisis")
    .update({
      mensaje: p.mensaje,
      mensaje_estado: r.estado,
      mensaje_error: r.error ?? null,
      ...(r.estado === "enviado" ? { mensajes_enviados: p.enviados + 1, mensaje_enviado_en: new Date().toISOString() } : {}),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", analisisId);
  if (error) return { error: "El mensaje salió, pero no se pudo anotar. Revisa el pedido." };
  const pais = await getPaisActual(supabase);
  await registrarAuditoria({ accion: "enviar_mensaje_dato_confirmacion_ia", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: pidió el dato que falta al cliente de un pedido (${r.estado}) por ${nombreDe(usuario)}` });
  revalidatePath("/tienda-pedidos/confirmacion/ia");
  return r.estado === "error" ? { error: r.error ?? "No se pudo enviar el mensaje.", estado: r.estado } : { estado: r.estado };
}

/** «Ya se le envió»: la persona le escribió al cliente a mano; se anota para no volver a preguntar ni a mandarlo. */
export async function marcarMensajeManual(analisisId: string): Promise<Resultado> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!UUID.test(String(analisisId))) return { error: "Análisis no válido." };
  const supabase = createServiceClient();
  const p = await prepararPedirDato(supabase, analisisId);
  if ("error" in p) return p;
  const { error } = await supabase
    .from("confirmacion_ia_analisis")
    .update({ mensaje: p.mensaje, mensaje_estado: "manual", mensaje_error: null, mensajes_enviados: p.enviados + 1, mensaje_enviado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() })
    .eq("id", analisisId);
  if (error) return { error: /mensaje_estado|check|constraint/i.test(error.message) ? "Falta correr la migración 0308 (mensaje enviado a mano) en Supabase." : "No se pudo guardar." };
  const pais = await getPaisActual(supabase);
  await registrarAuditoria({ accion: "marcar_mensaje_manual_confirmacion_ia", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: ${nombreDe(usuario)} marcó que ya le pidió el dato al cliente de un pedido` });
  revalidatePath("/tienda-pedidos/confirmacion/ia");
  return {};
}


// --- Probar con pedidos reales (19 nov 2026, pedido de Jhokser): ver `src/lib/confirmacion-ia/prueba-historica.ts`. Solo un administrador. Gasta crédito de las IA (dos llamadas por pedido) y no guarda nada. ---

const SOLO_ADMIN_PRUEBA = "Solo un administrador puede probar con pedidos reales (gasta crédito de las IA).";

/** La muestra de pedidos con zona real de los últimos `dias` (hasta `max`), de una tienda o de todas las del país. */
export async function listarPedidosParaProbar(d: { tiendaId: string | null; dias: number; max: number }): Promise<{ error: string } | { pedidos: PedidoMuestra[]; disponibles: number }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!esAdministrador(usuario)) return { error: SOLO_ADMIN_PRUEBA };
  const dias = Math.min(Math.max(Math.trunc(Number(d?.dias)) || 30, 1), 120);
  const max = Math.min(Math.max(Math.trunc(Number(d?.max)) || 40, 1), 400);
  const tiendaId = d?.tiendaId && UUID.test(String(d.tiendaId)) ? String(d.tiendaId) : null;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { config, faltaMigracion } = await cargarConfig(supabase, pais.id);
  if (faltaMigracion) return { error: SIN_MIGRACION_CONFIRMACION };
  if (!config.distingueZona) return { error: `En ${pais.nombre} no se distingue ciudad e interior: no hay zona real con qué comparar.` };
  return listarMuestraHistorica(supabase, { paisId: pais.id, tiendaId, dias, max });
}

/** Analiza hasta 6 pedidos de la muestra con el mismo análisis del sistema y devuelve cada uno junto a su zona real. */
export async function probarPedidosReales(ids: string[], opciones: { sinTendencia: boolean }): Promise<{ error: string } | { resultados: ResultadoPrueba[]; omitidos: number }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!esAdministrador(usuario)) return { error: SOLO_ADMIN_PRUEBA };
  const lista = (Array.isArray(ids) ? ids : []).filter((x) => UUID.test(String(x))).slice(0, 6);
  if (!lista.length) return { resultados: [], omitidos: 0 };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { config, faltaMigracion } = await cargarConfig(supabase, pais.id);
  if (faltaMigracion) return { error: SIN_MIGRACION_CONFIRMACION };
  const hechos = await Promise.all(lista.map((id) => probarPedidoHistorico(supabase, id, pais.id, config, { sinTendencia: !!opciones?.sinTendencia }).catch(() => null)));
  const resultados = hechos.filter((r): r is ResultadoPrueba => r !== null);
  return { resultados, omitidos: lista.length - resultados.length };
}
