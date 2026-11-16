"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { claveCoincide } from "@/lib/confirmacion-ia/clave";
import { tiendasVisibles } from "@/lib/confirmacion-ia/acceso";
import { etiquetaDeZona, type Combinado, type ResultadoModelo } from "@/lib/confirmacion-ia/combinar";
import { MAX_INSTRUCCIONES } from "@/lib/confirmacion-ia/prompt";
import { analizarOrden, analizarPendientes, cargarConfig, evaluarDireccion, SIN_MIGRACION_CONFIRMACION } from "@/lib/confirmacion-ia/servidor";
import { errorDeRegla, normalizarTexto, ZONAS, type Zona } from "@/lib/confirmacion-ia/zonas";
import { getPaisActual } from "@/lib/pais";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { mismaTiendaUnidad } from "@/lib/tienda/ordenes-finanzas";

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
  revalidatePath("/tienda-confirmacion/ia");
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
  revalidatePath("/tienda-confirmacion/ia");
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
async function leerEjemplo(d: DatosEjemplo, distingueZona: boolean, tiendasOk: string[]): Promise<{ fila: { ciudad: string; direccion: string; completa: boolean; falta: string | null; zona: Zona | null; tienda_id: string | null } } | { error: string }> {
  const ciudad = String(d?.ciudad ?? "").replace(/\s+/g, " ").trim();
  if (ciudad.length < 2) return { error: "Escribe la ciudad o el corregimiento: es lo más importante para saber de dónde es." };
  if (ciudad.length > 120) return { error: "La ciudad o el corregimiento es muy largo (hasta 120 letras)." };
  const direccion = String(d?.direccion ?? "").replace(/\s+/g, " ").trim();
  if (direccion.length < 5) return { error: "Escribe la dirección completa tal como la dejó el cliente." };
  if (direccion.length > 600) return { error: "La dirección es muy larga (hasta 600 letras)." };
  if (typeof d.completa !== "boolean") return { error: "Elige si la dirección está completa o incompleta." };
  const falta = d.completa ? null : String(d.falta ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
  if (!d.completa && !falta) return { error: "Escribe qué le falta a la dirección." };
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
  const l = await leerEjemplo(d, config.distingueZona, tiendas.map((t) => t.id));
  if ("error" in l) return l;
  const { error } = await supabase.from("confirmacion_ia_ejemplos").insert({ ...l.fila, pais_id: pais.id, creado_por: usuario.id, creado_por_nombre: nombreDe(usuario) });
  if (error) return { error: /ciudad|schema cache/i.test(error.message) ? "Falta correr la migración 0301 (ciudad o corregimiento de los ejemplos) en Supabase." : "No se pudo guardar la dirección." };
  await registrarAuditoria({ accion: "agregar_ejemplo_confirmacion_ia", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: dirección ${l.fila.completa ? "completa" : "incompleta"} de ejemplo` });
  revalidatePath("/tienda-confirmacion/ejemplos");
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
  return { supabase, pais, tiendas };
}

export async function editarEjemplo(id: string, d: DatosEjemplo): Promise<Resultado> {
  await requireModuloEscritura(MODULO);
  if (!UUID.test(String(id))) return { error: "Ejemplo no válido." };
  const ctx = await ejemploPermitido(id);
  if (!ctx) return { error: "Ese ejemplo ya no está o no tienes acceso." };
  const { config } = await cargarConfig(ctx.supabase, ctx.pais.id);
  const l = await leerEjemplo(d, config.distingueZona, ctx.tiendas.map((t) => t.id));
  if ("error" in l) return l;
  const { error } = await ctx.supabase.from("confirmacion_ia_ejemplos").update(l.fila).eq("id", id);
  if (error) return { error: /ciudad|schema cache/i.test(error.message) ? "Falta correr la migración 0301 (ciudad o corregimiento de los ejemplos) en Supabase." : "No se pudo guardar." };
  await registrarAuditoria({ accion: "editar_ejemplo_confirmacion_ia", entidad: "paises", entidadId: ctx.pais.id, detalle: `${ctx.pais.nombre}: cambió una dirección de ejemplo` });
  revalidatePath("/tienda-confirmacion/ejemplos");
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
  revalidatePath("/tienda-confirmacion/ejemplos");
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
  const mal = errorDeRegla(texto);
  if (mal) return { error: mal };
  if (!(ZONAS as string[]).includes(resultado)) return { error: "Elige si es de ciudad o del interior." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { config, faltaMigracion } = await cargarConfig(supabase, pais.id);
  if (faltaMigracion) return { error: SIN_MIGRACION_CONFIRMACION };
  if (!config.distingueZona) return { error: `En ${pais.nombre} no se distingue ciudad e interior: todavía no se usan palabras de zona.` };
  const limpio = String(texto).replace(/\s+/g, " ").trim();
  const { error } = await supabase.from("confirmacion_ia_zonas").insert({ pais_id: pais.id, texto: limpio, clave: normalizarTexto(limpio), resultado, creado_por: usuario.id, creado_por_nombre: nombreDe(usuario) });
  if (error) return { error: error.code === "23505" ? "Esa palabra ya está en la lista." : "No se pudo guardar." };
  await registrarAuditoria({ accion: "agregar_palabra_zona_confirmacion_ia", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: «${limpio}» → ${resultado}` });
  revalidatePath("/tienda-confirmacion/zonas");
  return {};
}

export async function eliminarPalabraZona(id: string): Promise<Resultado> {
  await requireModuloEscritura(MODULO);
  if (!UUID.test(String(id))) return { error: "Palabra no válida." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data } = await supabase.from("confirmacion_ia_zonas").select("texto").eq("id", id).eq("pais_id", pais.id).maybeSingle();
  if (!data) return { error: "Esa palabra ya no está." };
  const { error } = await supabase.from("confirmacion_ia_zonas").delete().eq("id", id);
  if (error) return { error: "No se pudo borrar." };
  await registrarAuditoria({ accion: "eliminar_palabra_zona_confirmacion_ia", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: quitó «${data.texto}»` });
  revalidatePath("/tienda-confirmacion/zonas");
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
  revalidatePath("/tienda-confirmacion/ia");
  return { estado: r.estado };
}

/** Analiza los confirmados de los últimos días que todavía no tienen análisis (hasta 5 por vez). */
export async function analizarPendientesAhora(): Promise<Resultado & { analizadas?: number; pendientes?: number }> {
  const usuario = await requireModuloEscritura(MODULO);
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { config } = await cargarConfig(supabase, pais.id);
  if (!config.activa) return { error: "La confirmación automática está apagada: enciéndela para que analice los pedidos confirmados." };
  const r = await analizarPendientes(supabase, pais.id, 5, nombreDe(usuario));
  revalidatePath("/tienda-confirmacion/ia");
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

/** Guarda la dirección de un análisis como ejemplo (con lo correcto: completa o incompleta y su zona), para que la IA aprenda de lo que el equipo corrige. */
export async function guardarAnalisisComoEjemplo(analisisId: string, d: { ciudad: string; completa: boolean; falta?: string | null; zona?: Zona | null }): Promise<Resultado> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!UUID.test(String(analisisId))) return { error: "Análisis no válido." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: a } = await supabase.from("confirmacion_ia_analisis").select("direccion, ciudad, tienda_id").eq("id", analisisId).eq("pais_id", pais.id).maybeSingle();
  if (!a?.direccion) return { error: "Ese análisis no tiene dirección." };
  const [{ config }, { tiendas, limitado }] = await Promise.all([cargarConfig(supabase, pais.id), tiendasVisibles(supabase, pais.id)]);
  if (limitado && !tiendas.some((t) => t.id === a.tienda_id)) return { error: "Ese pedido no es de las tiendas que ves." };
  const l = await leerEjemplo({ ciudad: d.ciudad, direccion: a.direccion as string, completa: d.completa, falta: d.falta, zona: d.zona, tiendaId: (a.tienda_id as string | null) ?? null }, config.distingueZona, tiendas.map((t) => t.id));
  if ("error" in l) return l;
  const { error } = await supabase.from("confirmacion_ia_ejemplos").insert({ ...l.fila, pais_id: pais.id, creado_por: usuario.id, creado_por_nombre: nombreDe(usuario) });
  if (error) return { error: "No se pudo guardar." };
  await registrarAuditoria({ accion: "agregar_ejemplo_confirmacion_ia", entidad: "paises", entidadId: pais.id, detalle: `${pais.nombre}: guardó una dirección analizada como ejemplo` });
  revalidatePath("/tienda-confirmacion/ejemplos");
  return {};
}
