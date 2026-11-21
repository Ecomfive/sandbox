// Confirmación con IA (16 nov 2026, pedido de Hernán): lo que lee y escribe la base y lo que llama a las IA y a iComfly. Solo servidor, con el cliente de servicio; quien llama ya comprobó el
// permiso (la pantalla) o la firma (el webhook de Shopify). Las reglas puras están en `zonas.ts`, `prompt.ts` y `combinar.ts`.
//
// El camino: iComfly deja el pedido «Confirmada» en Shopify → el webhook (`orders/updated`) lo guarda y llama a `dispararDesdeWebhook` → `analizarOrden` mira la dirección con ChatGPT y
// Claude y las palabras de zona del país → guarda el análisis (la etiqueta que correspondería: CIUDAD o INTERIOR/SERVIENTREGA) y, si falta un dato de la dirección y el envío del
// WhatsApp está encendido, se lo pide al cliente por iComfly. Solo en una tienda con «La IA pone la etiqueta de zona» encendido (`poner-etiqueta.ts`) la pone en Shopify; en las demás solo propone.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pedirIAEn, proveedoresConectados, type ProveedorIA } from "@/lib/publicaciones/ia/proveedor";
import { esErrorDeVentana, telefonoParaIcomfly, ventana24 } from "@/lib/tienda/chat-tienda";
import { leerChat } from "@/lib/tienda/chat-tienda-datos";
import { herramientaIcomfly, conexionesIcomfly } from "@/lib/tienda/icomfly";
import { etiquetasDe, mismaTiendaUnidad, zonaDeEtiquetas } from "@/lib/tienda/ordenes-finanzas";
import { destinatariosDe } from "@/lib/compras/llegadas-servidor";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { cargarTiendas } from "@/lib/tienda/datos";
import { geografiaDe } from "./geografia";
import { tendenciaDeTienda, textoTendencia } from "./tendencias";
import { motivoDeAdelanto, zonasDeAdelanto } from "./adelanto";
import { combinar, etiquetaDeZona, faltaParaCliente, leerRespuesta, mensajePagoAdelantado, mensajePedirDetalle, type Combinado, type EstadoAnalisis, type ResultadoModelo } from "./combinar";
import { ponerEtiquetaDeZona } from "./poner-etiqueta";
import { armarEntrada, type EjemploPrompt } from "./prompt";
import { muestraBalanceada, type PedidoMuestra, type ResultadoPrueba } from "./prueba-historica";
import { resultadoFinal, seleccionarEjemplos, type RevisionPedido, type ResultadoPedido } from "./revision";
import { coincidencias, normalizarTexto, permiteAdelanto, zonaPorReglas, type ReglaZona, type Zona } from "./zonas";

export const SIN_MIGRACION_CONFIRMACION = "Falta correr la migración 0300 (confirmación con IA) en Supabase.";
/** Cuántos mensajes se le piden a un mismo pedido (el primero y, si contesta pero sigue incompleta, uno más). */
export const MAX_MENSAJES = 2;
/** Hasta cuántos días atrás se buscan pedidos confirmados sin analizar. */
const DIAS_PENDIENTES = 7;

export interface ConfigConfirmacion {
  paisId: string;
  activa: boolean;
  enviarMensajes: boolean;
  distingueZona: boolean;
  etiquetaCiudad: string | null;
  etiquetaInterior: string | null;
  /** Ya hay una contraseña definida para que quien no es administrador cambie los interruptores. */
  tieneClave: boolean;
  /** Instrucciones extra para la IA que escribió un administrador (las ve y las cambia solo un administrador). */
  instrucciones: string | null;
}

const configVacia = (paisId: string): ConfigConfirmacion => ({ paisId, activa: false, enviarMensajes: false, distingueZona: false, etiquetaCiudad: null, etiquetaInterior: null, tieneClave: false, instrucciones: null });

/** La configuración del país (todo apagado si todavía no hay). Con `faltaMigracion`, las tablas no existen. */
export async function cargarConfig(supabase: SupabaseClient, paisId: string): Promise<{ config: ConfigConfirmacion; faltaMigracion: boolean }> {
  const { data, error } = await supabase.from("confirmacion_ia_config").select("activa, enviar_mensajes, distingue_zona, etiqueta_ciudad, etiqueta_interior, clave_cambio_hash, instrucciones").eq("pais_id", paisId).maybeSingle();
  if (error) return { config: configVacia(paisId), faltaMigracion: /confirmacion_ia|schema cache|does not exist/i.test(error.message) };
  if (!data) return { config: configVacia(paisId), faltaMigracion: false };
  return {
    faltaMigracion: false,
    config: {
      paisId,
      activa: data.activa === true,
      enviarMensajes: data.enviar_mensajes === true,
      distingueZona: data.distingue_zona === true,
      etiquetaCiudad: (data.etiqueta_ciudad as string | null) ?? null,
      etiquetaInterior: (data.etiqueta_interior as string | null) ?? null,
      tieneClave: !!data.clave_cambio_hash,
      instrucciones: (data.instrucciones as string | null) ?? null,
    },
  };
}

export async function cargarReglas(supabase: SupabaseClient, paisId: string): Promise<ReglaZona[]> {
  const { data } = await supabase.from("confirmacion_ia_zonas").select("id, texto, clave, resultado").eq("pais_id", paisId).order("creado_en", { ascending: false }).limit(500);
  return (data ?? []).map((r) => ({ id: r.id as string, texto: r.texto as string, clave: r.clave as string, resultado: r.resultado as Zona }));
}

/** Los ejemplos que entran al pedido: los generales del país y los de esa tienda, los más recientes de cada tipo. */
export async function cargarEjemplos(supabase: SupabaseClient, paisId: string, tiendaId: string | null, porTipo = 20): Promise<EjemploPrompt[]> {
  // Con la migración 0301 trae también la ciudad o el corregimiento; sin ella, las columnas de siempre.
  const leer = (columnas: string) => {
    const q = supabase.from("confirmacion_ia_ejemplos").select(columnas).eq("pais_id", paisId);
    return (tiendaId ? q.or(`tienda_id.is.null,tienda_id.eq.${tiendaId}`) : q.is("tienda_id", null)).order("creado_en", { ascending: false }).limit(porTipo * 6);
  };
  let r = await leer("direccion, completa, falta, zona, ciudad");
  if (r.error) r = await leer("direccion, completa, falta, zona");
  const data = (r.data ?? []) as unknown as Record<string, unknown>[];
  const filas = (data ?? []).map((e) => ({ ciudad: (e.ciudad as string | null | undefined) ?? null, direccion: e.direccion as string, completa: e.completa === true, falta: (e.falta as string | null) ?? null, zona: (e.zona as Zona | null) ?? null }));
  // Las completas se reparten entre ciudad e interior (si no, la IA aprende solo del lado que más se corrige).
  return seleccionarEjemplos(filas, porTipo);
}

/** Lo que cambia si el cliente corrige su dirección: la dirección y la ciudad, sin acentos ni mayúsculas. */
export const huellaDireccion = (direccion: string | null, ciudad: string | null): string =>
  createHash("sha256").update(`${normalizarTexto(direccion ?? "")}|${normalizarTexto(ciudad ?? "")}`).digest("hex").slice(0, 32);

export const tieneEtiquetaConfirmada = (etiquetas: string | null): boolean => etiquetasDe(etiquetas).some((e) => /^confirmad[ao]$/i.test(e));
export const tieneEtiquetaDeZona = (etiquetas: string | null): boolean => zonaDeEtiquetas(etiquetas) !== null;

interface OrdenParaAnalizar {
  id: string;
  numero: string | null;
  etiquetas: string | null;
  origen: string | null;
  paisId: string;
  paisCodigo: string;
  paisNombre: string;
  tiendaId: string | null;
  tiendaNombre: string | null;
  cliente: { nombre: string | null; telefono: string | null; direccion: string | null; corregimiento: string | null };
}

async function cargarOrden(supabase: SupabaseClient, ordenId: string): Promise<OrdenParaAnalizar | null> {
  const { data: o } = await supabase.from("ven_ordenes").select("id, numero, etiquetas, origen, unidad_id, fin_unidades(nombre, pais_id, clase)").eq("id", ordenId).maybeSingle();
  if (!o) return null;
  const unidad = (Array.isArray(o.fin_unidades) ? o.fin_unidades[0] : o.fin_unidades) as { nombre: string; pais_id: string; clase: string } | null;
  if (!unidad || unidad.clase !== "tienda") return null;
  const [{ data: cliente }, { data: pais }, { data: tiendas }] = await Promise.all([
    supabase.from("ven_ordenes_clientes").select("nombre, telefono, direccion, corregimiento").eq("orden_id", ordenId).maybeSingle(),
    supabase.from("paises").select("codigo, nombre").eq("id", unidad.pais_id).maybeSingle(),
    supabase.from("tiendas").select("id, nombre").eq("pais_id", unidad.pais_id),
  ]);
  const tienda = (tiendas ?? []).find((t) => mismaTiendaUnidad(t.nombre as string, unidad.nombre));
  return {
    id: o.id as string,
    numero: (o.numero as string | null) ?? null,
    etiquetas: (o.etiquetas as string | null) ?? null,
    origen: (o.origen as string | null) ?? null,
    paisId: unidad.pais_id,
    paisCodigo: (pais?.codigo as string | undefined) ?? "",
    paisNombre: (pais?.nombre as string | undefined) ?? "el país",
    tiendaId: (tienda?.id as string | undefined) ?? null,
    tiendaNombre: (tienda?.nombre as string | undefined) ?? unidad.nombre,
    cliente: {
      nombre: (cliente?.nombre as string | null) ?? null,
      telefono: (cliente?.telefono as string | null) ?? null,
      direccion: (cliente?.direccion as string | null) ?? null,
      corregimiento: (cliente?.corregimiento as string | null) ?? null,
    },
  };
}

/** Qué pasó con el mensaje que pide el dato que falta. `manual`: una persona dijo que ya se lo mandó a mano. */
export type EstadoMensaje = "no_aplica" | "apagado" | "enviado" | "manual" | "pendiente_plantilla" | "sin_chat" | "error";

/**
 * Le pide al cliente por WhatsApp (iComfly) lo que falta de la dirección. Solo escribe libre con la ventana de 24 horas abierta; si no, queda pendiente de una plantilla (nunca escribe
 * libre fuera de ella). No pausa el bot del chat: el cliente va a contestar y esa respuesta le llega.
 */
async function pedirDatoPorWhatsapp(supabase: SupabaseClient, o: OrdenParaAnalizar, texto: string): Promise<{ estado: EstadoMensaje; error?: string }> {
  if (!o.tiendaId) return { estado: "error", error: "La tienda no está en Gestión de tienda." };
  const con = await conexionesIcomfly(supabase, [o.tiendaId]);
  if (!con?.get(o.tiendaId)?.conectado) return { estado: "error", error: "La tienda no está conectada a iComfly." };
  const telefono = telefonoParaIcomfly(o.cliente.telefono, o.paisCodigo);
  if (!telefono) return { estado: "error", error: "El pedido no tiene un teléfono válido." };
  const chat = await leerChat(supabase, o.tiendaId, telefono);
  if ("error" in chat) return { estado: "error", error: chat.error };
  if (!chat.mensajes.length) return { estado: "sin_chat" };
  if (ventana24(chat.mensajes, Date.now()) === "cerrada") return { estado: "pendiente_plantilla" };
  const r = await herramientaIcomfly(supabase, o.tiendaId, "enviar_mensaje_whatsapp", { telefono, mensaje: texto });
  if ("error" in r) return esErrorDeVentana(r.error) ? { estado: "pendiente_plantilla" } : { estado: "error", error: r.error };
  return { estado: "enviado" };
}

/** El aviso «Para ti» de un pedido en espera de pago, para las personas marcadas (ninguna de entrada: no se le avisa a nadie). Nunca lanza. */
async function avisarPagoAdelantado(supabase: SupabaseClient, d: { numero: string | null; tienda: string | null; ciudad: string | null; direccion: string }): Promise<void> {
  try {
    const personas = await destinatariosDe(supabase, "pago_adelantado");
    if (!personas.length) return;
    const titulo = `En espera de pago: pedido ${d.numero ?? ""}${d.tienda ? ` · ${d.tienda}` : ""}`.trim();
    const texto = `Es de una zona de pago por adelantado${d.ciudad ? ` (${d.ciudad})` : ""}. Avísale al cliente y espera su comprobante; la etiqueta de zona la pones tú cuando llegue el pago.`;
    await supabase.from("notificaciones_usuario").insert(personas.map((usuario_id) => ({ usuario_id, tipo: "adelanto", titulo: titulo.slice(0, 200), texto: texto.slice(0, 500), href: "/tienda-pedidos/confirmacion/ia", autor_nombre: "Sistema" })));
  } catch {
    // El análisis ya se guardó: un aviso que falla no lo deshace.
  }
}

/**
 * El mensaje que le avisa al cliente que su pedido es de pago por adelantado, con los métodos de pago de su tienda (los registra el equipo; sin ellos, el mensaje dice que un asesor le indica cómo pagar).
 * Sin escribirle a nadie: la pantalla se lo muestra al asesor, que decide si se envía o ya se lo mandó a mano.
 */
export async function armarMensajeAdelanto(supabase: SupabaseClient, ordenId: string): Promise<{ mensaje: string; sinMetodos: boolean } | { error: string }> {
  const o = await cargarOrden(supabase, ordenId);
  if (!o) return { error: "El pedido no es de una tienda." };
  let metodos: string | null = null;
  if (o.tiendaId) {
    const { data } = await supabase.from("tiendas").select("pago_adelantado_instrucciones").eq("id", o.tiendaId).maybeSingle();
    metodos = ((data?.pago_adelantado_instrucciones as string | null | undefined) ?? "").trim() || null;
  }
  return { mensaje: mensajePagoAdelantado({ nombre: o.cliente.nombre, numero: o.numero, tienda: o.tiendaNombre, metodos }), sinMetodos: !metodos };
}

/**
 * El mensaje que se le mandaría al cliente de un pedido para pedirle lo que falta (con su nombre, su pedido y su tienda). Sin escribirle a nadie: la pantalla se lo muestra a la persona, que decide
 * si se envía o si ya se le mandó a mano.
 */
export async function armarMensajeDato(supabase: SupabaseClient, ordenId: string, falta: string): Promise<{ mensaje: string } | { error: string }> {
  const o = await cargarOrden(supabase, ordenId);
  if (!o) return { error: "El pedido no es de una tienda." };
  return { mensaje: mensajePedirDetalle({ nombre: o.cliente.nombre, numero: o.numero, tienda: o.tiendaNombre, falta }) };
}

/** Manda ese mensaje por iComfly (solo con la ventana de 24 horas abierta; si no, queda pendiente de una plantilla). Lo llama una persona desde la pantalla, nunca el análisis. */
export async function enviarMensajeDato(supabase: SupabaseClient, ordenId: string, texto: string): Promise<{ estado: EstadoMensaje; error?: string }> {
  const o = await cargarOrden(supabase, ordenId);
  if (!o) return { estado: "error", error: "El pedido no es de una tienda." };
  return pedirDatoPorWhatsapp(supabase, o, texto);
}

async function pedirAlModelo(proveedor: ProveedorIA, entrada: ReturnType<typeof armarEntrada>, numero: string | null, conAdelanto = true): Promise<ResultadoModelo> {
  const r = await pedirIAEn(proveedor, entrada, { operacion: "confirmacion_direccion", modulo: "tienda-confirmacion", referencia: numero });
  if ("error" in r) return { proveedor, ok: false, error: r.error };
  const respuesta = leerRespuesta(r.texto);
  if (!respuesta) return { proveedor, ok: false, error: "La respuesta no se pudo leer." };
  // En un país sin pago por adelantado (Costa Rica) esa respuesta no existe: se toma como «no sé» y el pedido queda para que lo decida el equipo.
  return { proveedor, ok: true, respuesta: respuesta.zona === "adelantado" && !conAdelanto ? { ...respuesta, zona: "no_se" } : respuesta };
}

/**
 * Lo que dicen las palabras de zona y las dos IA de una dirección (sin guardar nada): la decisión junta, lo que contestó cada IA y las palabras de zona que salieron. Sirve para analizar
 * un pedido y para «Probar una dirección» de la pantalla.
 */
export async function evaluarDireccion(
  supabase: SupabaseClient,
  d: { paisId: string; paisNombre: string; paisCodigo: string; tiendaId: string | null; numero: string | null; direccion: string; ciudad: string | null; config: ConfigConfirmacion; /** Sin la tendencia histórica de la tienda: mide el prompt y los ejemplos solos (la tendencia sale de los mismos pedidos con que se compara). */ sinTendencia?: boolean },
): Promise<{ combinado: Combinado; modelos: ResultadoModelo[]; coinc: ReglaZona[] }> {
  const { direccion, ciudad, config } = d;
  const reglas = await cargarReglas(supabase, d.paisId);
  const coinc = coincidencias(`${direccion} ${ciudad ?? ""}`, reglas);
  const porReglas = config.distingueZona ? zonaPorReglas(coinc) : { zona: null, conflicto: false, reglas: [] };

  let modelos: ResultadoModelo[];
  if (!direccion.trim()) {
    // Sin dirección no hay nada que analizar: se pide completa.
    modelos = [{ proveedor: "openai", ok: true, respuesta: { zona: "no_se", completa: false, falta: "tu dirección de entrega: el sector, la calle y el número de casa o una referencia", motivo: "El pedido no trae dirección." } }];
  } else {
    const proveedores = proveedoresConectados();
    if (!proveedores.length) modelos = [{ proveedor: "openai", ok: false, error: "Falta conectar ChatGPT o Claude (las claves OPENAI_API_KEY o ANTHROPIC_API_KEY)." }];
    else {
      const ejemplos = await cargarEjemplos(supabase, d.paisId, d.tiendaId);
      // La tendencia histórica de la tienda (solo Panamá, por ahora): en las zonas dudosas la IA etiqueta como lo viene haciendo esa tienda.
      let tendencia: string | null = null;
      if (config.distingueZona && d.paisCodigo.toUpperCase() === "PA" && d.tiendaId && !d.sinTendencia) {
        const { data: tienda } = await supabase.from("tiendas").select("nombre").eq("id", d.tiendaId).maybeSingle();
        const t = tendenciaDeTienda((tienda?.nombre as string | undefined) ?? null);
        tendencia = t ? textoTendencia(t) : null;
      }
      const entrada = armarEntrada({ paisNombre: d.paisNombre, distingueZona: config.distingueZona, reglas, ejemplos, direccion, ciudad, coincidencias: coinc, instruccionesExtra: config.instrucciones, geografia: config.distingueZona ? geografiaDe(d.paisCodigo) : null, tendencia });
      modelos = await Promise.all(proveedores.map((p) => pedirAlModelo(p, entrada, d.numero, permiteAdelanto(d.paisCodigo))));
    }
  }
  return { combinado: combinar({ distingueZona: config.distingueZona, zonaReglas: porReglas.zona, modelos }), modelos, coinc };
}

export type ResultadoAnalisis = { resultado: "analizada"; estado: EstadoAnalisis } | { resultado: "omitida"; motivo: string };

/**
 * Analiza la dirección de un pedido y guarda el resultado. `forzar` (desde la pantalla) no mira si la confirmación automática está encendida, ni si ya estaba analizada, ni la etiqueta de
 * confirmada. Sin `forzar` (webhook y pendientes) solo analiza lo que el equipo de iComfly ya dejó «Confirmada», sin zona todavía y con la dirección nueva.
 */
export async function analizarOrden(supabase: SupabaseClient, ordenId: string, opciones: { origen: "webhook" | "pantalla" | "pendientes"; forzar?: boolean; por?: string }): Promise<ResultadoAnalisis> {
  const o = await cargarOrden(supabase, ordenId);
  if (!o) return { resultado: "omitida", motivo: "El pedido no es de una tienda." };
  if (o.origen !== "shopify") return { resultado: "omitida", motivo: "El pedido no vino de Shopify." };
  const { config, faltaMigracion } = await cargarConfig(supabase, o.paisId);
  if (faltaMigracion) return { resultado: "omitida", motivo: SIN_MIGRACION_CONFIRMACION };
  if (!opciones.forzar) {
    if (!config.activa) return { resultado: "omitida", motivo: "La confirmación automática está apagada." };
    if (!tieneEtiquetaConfirmada(o.etiquetas)) return { resultado: "omitida", motivo: "Todavía no está confirmado." };
    if (tieneEtiquetaDeZona(o.etiquetas)) return { resultado: "omitida", motivo: "Ya tiene etiqueta de zona." };
  }

  const direccion = (o.cliente.direccion ?? "").trim();
  const ciudad = (o.cliente.corregimiento ?? "").trim() || null;
  const huella = huellaDireccion(direccion, ciudad);
  const { data: previo } = await supabase.from("confirmacion_ia_analisis").select("huella, mensajes_enviados, actualizado_en, mensaje_estado, estado").eq("orden_id", ordenId).maybeSingle();
  if (!opciones.forzar && previo) {
    if (previo.huella === huella) return { resultado: "omitida", motivo: "Ya está analizada." };
    // Dos avisos casi a la vez no repiten el análisis ni el mensaje.
    if (Date.now() - Date.parse(String(previo.actualizado_en)) < 60_000) return { resultado: "omitida", motivo: "Se acaba de analizar." };
  }

  // Una zona de pago por adelantado (Bocas del Toro, Puerto Armuelles…) manda sobre todo: el pedido queda «en espera de pago», sin etiqueta y sin gastar las IA; el asesor le avisa al cliente y pone la etiqueta real cuando llega el pago.
  const adelanto = zonasDeAdelanto(direccion, ciudad, await cargarReglas(supabase, o.paisId));
  const { combinado: c, modelos, coinc } = adelanto.length
    ? { combinado: { estado: "adelantado", zona: null, zonaPor: null, completa: null, falta: null, acuerdo: null, motivo: motivoDeAdelanto(adelanto) } as Combinado, modelos: [] as ResultadoModelo[], coinc: [] as ReglaZona[] }
    : await evaluarDireccion(supabase, { paisId: o.paisId, paisNombre: o.paisNombre, paisCodigo: o.paisCodigo, tiendaId: o.tiendaId, numero: o.numero, direccion, ciudad, config });
  const etiqueta = c.estado === "listo" ? etiquetaDeZona(c.zona, config) : null;

  // El WhatsApp que pide el dato que falta.
  let mensaje: string | null = null;
  let mensajeEstado: EstadoMensaje = "no_aplica";
  let mensajeError: string | null = null;
  let enviados = Number(previo?.mensajes_enviados ?? 0);
  let enviadoEn: string | null = null;
  if (c.estado === "falta_dato" && c.falta) {
    // Lo que sale solo al cliente va en frases fijas, nunca con el texto libre de la IA (ver faltaParaCliente).
    mensaje = mensajePedirDetalle({ nombre: o.cliente.nombre, numero: o.numero, tienda: o.tiendaNombre, falta: faltaParaCliente(c.falta) });
    if (!config.enviarMensajes) mensajeEstado = "apagado";
    else if (enviados >= MAX_MENSAJES) mensajeEstado = (previo?.mensaje_estado as EstadoMensaje | undefined) ?? "enviado";
    else {
      const r = await pedirDatoPorWhatsapp(supabase, o, mensaje);
      mensajeEstado = r.estado;
      mensajeError = r.error ?? null;
      if (r.estado === "enviado") {
        enviados += 1;
        enviadoEn = new Date().toISOString();
      }
    }
  }

  const fila = {
    orden_id: ordenId,
    pais_id: o.paisId,
    tienda_id: o.tiendaId,
    origen: opciones.origen,
    direccion: direccion || null,
    ciudad,
    huella,
    estado: c.estado,
    zona: c.zona,
    zona_por: c.zonaPor,
    completa: c.completa,
    falta: c.falta,
    etiqueta,
    acuerdo: c.acuerdo,
    motivo: c.motivo || null,
    modelos: modelos.map((m) => ({ proveedor: m.proveedor, ok: m.ok, error: m.error ?? null, ...(m.respuesta ?? {}) })),
    reglas: coinc.map((r) => ({ texto: r.texto, resultado: r.resultado })),
    mensaje,
    mensaje_estado: mensajeEstado,
    mensaje_error: mensajeError,
    mensajes_enviados: enviados,
    ...(enviadoEn ? { mensaje_enviado_en: enviadoEn } : {}),
    analizado_por: opciones.por ?? (opciones.origen === "pantalla" ? null : "Sistema"),
    actualizado_en: new Date().toISOString(),
  };
  // Si el cliente corrigió su dirección, lo que el equipo había marcado era de la dirección anterior: ya no vale.
  const sinRevision = previo && previo.huella !== huella ? { rev_completa: null, rev_zona: null, rev_falta: null, rev_ok: null, rev_por: null, rev_por_nombre: null, rev_en: null } : null;
  let { error } = await supabase.from("confirmacion_ia_analisis").upsert(sinRevision ? { ...fila, ...sinRevision } : fila, { onConflict: "orden_id" });
  // Sin la migración 0307 (revisión del equipo) esas columnas no existen: se guarda igual, sin ellas.
  if (error && sinRevision && /rev_|schema cache/i.test(error.message)) ({ error } = await supabase.from("confirmacion_ia_analisis").upsert(fila, { onConflict: "orden_id" }));
  if (error) return { resultado: "omitida", motivo: /confirmacion_ia|schema cache/i.test(error.message) ? SIN_MIGRACION_CONFIRMACION : "No se pudo guardar el análisis." };
  // Un pedido que entra a «en espera de pago» (no uno que ya lo estaba) se le avisa a quienes estén marcados en Configuración › Avisos a personas (nadie de entrada).
  if (c.estado === "adelantado" && previo?.estado !== "adelantado") await avisarPagoAdelantado(supabase, { numero: o.numero, tienda: o.tiendaNombre, ciudad, direccion });
  // La etiqueta de zona en Shopify (21 nov 2026, prueba controlada): solo cuando el pedido acaba de confirmarse (aviso de Shopify), nunca desde la pantalla ni desde los pendientes viejos, y solo
  // en una tienda con «La IA pone la etiqueta de zona» encendido (`ponerEtiquetaDeZona` lo comprueba y nunca lanza).
  if (opciones.origen === "webhook" && !opciones.forzar && c.estado === "listo" && etiqueta) {
    const r = await ponerEtiquetaDeZona(supabase, { ordenId, numero: o.numero, tiendaId: o.tiendaId, etiqueta, zonaYaPuesta: tieneEtiquetaDeZona });
    if (r.estado === "puesta") await supabase.from("confirmacion_ia_analisis").update({ etiqueta_puesta: r.etiqueta, etiqueta_puesta_en: new Date().toISOString(), etiqueta_error: null }).eq("orden_id", ordenId);
    else if (r.estado === "error") await supabase.from("confirmacion_ia_analisis").update({ etiqueta_error: r.motivo }).eq("orden_id", ordenId);
  }
  return { resultado: "analizada", estado: c.estado };
}

/**
 * Lo que llama el webhook de Shopify después de guardar la orden: si quedó «Confirmada» y sin zona, la analiza. Nunca lanza (el aviso de Shopify ya se guardó); lo que falle lo recoge
 * `analizarPendientes` la próxima vez que se abra la pantalla.
 */
export async function dispararDesdeWebhook(supabase: SupabaseClient, origenClave: string, etiquetas: string | null): Promise<void> {
  try {
    if (!tieneEtiquetaConfirmada(etiquetas) || tieneEtiquetaDeZona(etiquetas)) return;
    const { data } = await supabase.from("ven_ordenes").select("id").eq("origen_clave", origenClave).maybeSingle();
    if (data?.id) await analizarOrden(supabase, data.id as string, { origen: "webhook" });
  } catch {
    // El análisis se reintenta desde la pantalla.
  }
}

/** Los pedidos confirmados de los últimos días que todavía no se analizaron (por si un aviso de Shopify se perdió o la confirmación estaba apagada). Hasta `max` por vez. */
export async function analizarPendientes(supabase: SupabaseClient, paisId: string, max: number, por?: string): Promise<{ analizadas: number; pendientes: number }> {
  const { config, faltaMigracion } = await cargarConfig(supabase, paisId);
  if (faltaMigracion || !config.activa) return { analizadas: 0, pendientes: 0 };
  const { data: unidades } = await supabase.from("fin_unidades").select("id").eq("pais_id", paisId).eq("clase", "tienda");
  const ids = (unidades ?? []).map((u) => u.id as string);
  if (!ids.length) return { analizadas: 0, pendientes: 0 };
  const desde = new Date(Date.now() - DIAS_PENDIENTES * 86_400_000).toISOString().slice(0, 10);
  const { data: ordenes } = await supabase.from("ven_ordenes").select("id, etiquetas").in("unidad_id", ids).eq("origen", "shopify").gte("fecha", desde).ilike("etiquetas", "%confirmad%").order("fecha", { ascending: false }).limit(300);
  const candidatas = (ordenes ?? []).filter((o) => tieneEtiquetaConfirmada(o.etiquetas as string | null) && !tieneEtiquetaDeZona(o.etiquetas as string | null)).map((o) => o.id as string);
  if (!candidatas.length) return { analizadas: 0, pendientes: 0 };
  const { data: hechas } = await supabase.from("confirmacion_ia_analisis").select("orden_id").in("orden_id", candidatas);
  const yaHechas = new Set((hechas ?? []).map((h) => h.orden_id as string));
  const faltan = candidatas.filter((id) => !yaHechas.has(id));
  let analizadas = 0;
  for (const id of faltan.slice(0, max)) {
    const r = await analizarOrden(supabase, id, { origen: "pendientes", por });
    if (r.resultado === "analizada") analizadas += 1;
  }
  return { analizadas, pendientes: Math.max(0, faltan.length - analizadas) };
}

export interface FilaAnalisis {
  id: string;
  ordenId: string;
  numero: string | null;
  tiendaId: string | null;
  tienda: string | null;
  fecha: string | null;
  direccion: string | null;
  ciudad: string | null;
  estado: EstadoAnalisis;
  zona: Zona | null;
  zonaPor: "regla" | "ia" | null;
  completa: boolean | null;
  falta: string | null;
  etiqueta: string | null;
  /** La etiqueta de zona que el pedido ya tiene en Shopify (la puso el equipo); null si no tiene. */
  etiquetaActual: string | null;
  acuerdo: boolean | null;
  motivo: string | null;
  modelos: { proveedor: string; ok: boolean; error: string | null; zona?: string; completa?: boolean; falta?: string | null; motivo?: string }[];
  reglas: { texto: string; resultado: Zona }[];
  mensaje: string | null;
  mensajeEstado: EstadoMensaje;
  mensajeError: string | null;
  mensajesEnviados: number;
  analizadoPor: string | null;
  actualizadoEn: string;
  /** Lo que el equipo marcó como correcto (null si nadie lo revisó). */
  revision: RevisionPedido | null;
  /** Lo que vale para el pedido: lo que dijo el equipo si lo revisó; si no, lo que propuso el sistema. */
  final: ResultadoPedido;
}

/** Los últimos análisis del país (de las tiendas dadas, o de todas si es null), del más nuevo al más viejo. */
export async function cargarAnalisis(
  supabase: SupabaseClient,
  paisId: string,
  tiendaIds: string[] | null,
  config: { etiquetaCiudad: string | null; etiquetaInterior: string | null },
  limite = 120,
): Promise<{ filas: FilaAnalisis[]; faltaMigracion: boolean }> {
  const COLUMNAS = "id, orden_id, tienda_id, direccion, ciudad, estado, zona, zona_por, completa, falta, etiqueta, acuerdo, motivo, modelos, reglas, mensaje, mensaje_estado, mensaje_error, mensajes_enviados, analizado_por, actualizado_en";
  const leer = (columnas: string) => {
    let q = supabase.from("confirmacion_ia_analisis").select(columnas).eq("pais_id", paisId);
    if (tiendaIds) q = q.in("tienda_id", tiendaIds.length ? tiendaIds : ["00000000-0000-0000-0000-000000000000"]);
    return q.order("actualizado_en", { ascending: false }).limit(limite);
  };
  // Con la migración 0307 trae también lo que el equipo marcó como correcto; sin ella, lo de siempre.
  let r = await leer(`${COLUMNAS}, rev_completa, rev_zona, rev_falta, rev_ok, rev_por_nombre, rev_en`);
  if (r.error) r = await leer(COLUMNAS);
  const data = r.data as unknown as Record<string, unknown>[] | null;
  const error = r.error;
  if (error) return { filas: [], faltaMigracion: /confirmacion_ia|schema cache|does not exist/i.test(error.message) };
  const ordenIds = (data ?? []).map((a) => a.orden_id as string);
  const tiendaIdsUsados = [...new Set((data ?? []).map((a) => a.tienda_id as string | null).filter((x): x is string => !!x))];
  const [{ data: ordenes }, { data: tiendas }] = await Promise.all([
    ordenIds.length ? supabase.from("ven_ordenes").select("id, numero, fecha, etiquetas").in("id", ordenIds) : Promise.resolve({ data: [] as { id: string; numero: string | null; fecha: string | null; etiquetas: string | null }[] }),
    tiendaIdsUsados.length ? supabase.from("tiendas").select("id, nombre").in("id", tiendaIdsUsados) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ]);
  const porOrden = new Map((ordenes ?? []).map((o) => [o.id as string, o]));
  const nombreTienda = new Map((tiendas ?? []).map((t) => [t.id as string, t.nombre as string]));
  const filas = (data ?? []).map((a) => {
    const o = porOrden.get(a.orden_id as string);
    const actual = etiquetasDe((o?.etiquetas as string | null) ?? null).find((e) => /^(ciudad|interior)\b/i.test(e)) ?? null;
    const revision: RevisionPedido | null =
      typeof a.rev_completa === "boolean" && a.rev_en
        ? { completa: a.rev_completa, zona: (a.rev_zona as Zona | null) ?? null, falta: (a.rev_falta as string | null) ?? null, ok: typeof a.rev_ok === "boolean" ? a.rev_ok : null, por: (a.rev_por_nombre as string | null) ?? null, en: String(a.rev_en) }
        : null;
    const estado = a.estado as EstadoAnalisis;
    const zona = (a.zona as Zona | null) ?? null;
    const etiqueta = (a.etiqueta as string | null) ?? null;
    const falta = (a.falta as string | null) ?? null;
    return {
      id: a.id as string,
      ordenId: a.orden_id as string,
      numero: (o?.numero as string | null) ?? null,
      tiendaId: (a.tienda_id as string | null) ?? null,
      tienda: a.tienda_id ? (nombreTienda.get(a.tienda_id as string) ?? null) : null,
      fecha: (o?.fecha as string | null) ?? null,
      direccion: (a.direccion as string | null) ?? null,
      ciudad: (a.ciudad as string | null) ?? null,
      estado,
      zona,
      zonaPor: (a.zona_por as "regla" | "ia" | null) ?? null,
      completa: (a.completa as boolean | null) ?? null,
      falta,
      etiqueta,
      etiquetaActual: actual,
      acuerdo: (a.acuerdo as boolean | null) ?? null,
      motivo: (a.motivo as string | null) ?? null,
      modelos: Array.isArray(a.modelos) ? (a.modelos as FilaAnalisis["modelos"]) : [],
      reglas: Array.isArray(a.reglas) ? (a.reglas as FilaAnalisis["reglas"]) : [],
      mensaje: (a.mensaje as string | null) ?? null,
      mensajeEstado: (a.mensaje_estado as EstadoMensaje) ?? "no_aplica",
      mensajeError: (a.mensaje_error as string | null) ?? null,
      mensajesEnviados: Number(a.mensajes_enviados ?? 0),
      analizadoPor: (a.analizado_por as string | null) ?? null,
      actualizadoEn: a.actualizado_en as string,
      revision,
      final: resultadoFinal({ estado, zona, etiqueta, falta, revision }, config, !!actual),
    } satisfies FilaAnalisis;
  });
  return { filas, faltaMigracion: false };
}


// --- Probar con pedidos reales (19 nov 2026, pedido de Jhokser): ver `prueba-historica.ts`. --------------------------------------------------------------------------------------------------------

/**
 * La muestra de pedidos de Shopify de los últimos `dias` que ya tienen etiqueta de zona (CIUDAD o INTERIOR), repartida entre tiendas y zonas. Solo lee. Devuelve cuántos había en total para
 * que se vea qué parte se está probando.
 */
export async function listarMuestraHistorica(supabase: SupabaseClient, d: { paisId: string; tiendaId: string | null; dias: number; max: number }): Promise<{ pedidos: PedidoMuestra[]; disponibles: number }> {
  const [{ tiendas }, { data: unidades }] = await Promise.all([cargarTiendas(supabase, d.paisId), supabase.from("fin_unidades").select("id, nombre").eq("pais_id", d.paisId).eq("clase", "tienda")]);
  const tiendaDeUnidad = new Map<string, string>();
  for (const u of unidades ?? []) {
    const t = tiendas.find((x) => mismaTiendaUnidad(x.nombre, u.nombre as string));
    if (t && (!d.tiendaId || t.id === d.tiendaId)) tiendaDeUnidad.set(u.id as string, t.id);
  }
  if (!tiendaDeUnidad.size) return { pedidos: [], disponibles: 0 };
  const desde = new Date(Date.now() - d.dias * 86_400_000).toISOString().slice(0, 10);
  const ids = [...tiendaDeUnidad.keys()];
  const filas = await traerTodasLasFilas<{ id: string; etiquetas: string | null; unidad_id: string }>((a, b) =>
    supabase.from("ven_ordenes").select("id, etiquetas, unidad_id").eq("origen", "shopify").in("unidad_id", ids).gte("fecha", desde).order("id").range(a, b),
  );
  const candidatos: PedidoMuestra[] = [];
  for (const f of filas) {
    const zona = zonaDeEtiquetas(f.etiquetas);
    if (zona !== "Ciudad" && zona !== "Interior") continue;
    candidatos.push({ id: f.id, tiendaId: tiendaDeUnidad.get(f.unidad_id) ?? null, real: zona === "Ciudad" ? "ciudad" : "interior" });
  }
  return { pedidos: muestraBalanceada(candidatos, d.max), disponibles: candidatos.length };
}

/** Analiza un pedido ya etiquetado con el mismo análisis del sistema y lo deja junto a su zona real. Null si el pedido no sirve (sin dirección, sin etiqueta de zona o de otro país). No guarda nada. */
export async function probarPedidoHistorico(supabase: SupabaseClient, ordenId: string, paisId: string, config: ConfigConfirmacion, opciones: { sinTendencia: boolean }): Promise<ResultadoPrueba | null> {
  const o = await cargarOrden(supabase, ordenId);
  if (!o || o.paisId !== paisId) return null;
  const zona = zonaDeEtiquetas(o.etiquetas);
  if (zona !== "Ciudad" && zona !== "Interior") return null;
  const direccion = (o.cliente.direccion ?? "").trim();
  const ciudad = (o.cliente.corregimiento ?? "").trim() || null;
  if (direccion.length < 5) return null;
  // Misma regla que el análisis real: una zona de pago por adelantado no pasa por las IA.
  const adelanto = zonasDeAdelanto(direccion, ciudad, await cargarReglas(supabase, o.paisId));
  const { combinado: c, modelos, coinc } = adelanto.length
    ? { combinado: { estado: "adelantado", zona: null, zonaPor: null, completa: null, falta: null, acuerdo: null, motivo: motivoDeAdelanto(adelanto) } as Combinado, modelos: [] as ResultadoModelo[], coinc: [] as ReglaZona[] }
    : await evaluarDireccion(supabase, { paisId: o.paisId, paisNombre: o.paisNombre, paisCodigo: o.paisCodigo, tiendaId: o.tiendaId, numero: o.numero, direccion, ciudad, config, sinTendencia: opciones.sinTendencia });
  return {
    id: o.id,
    numero: o.numero,
    tienda: o.tiendaNombre ?? "—",
    tiendaId: o.tiendaId,
    ciudad,
    direccion,
    real: zona === "Ciudad" ? "ciudad" : "interior",
    estado: c.estado,
    zona: c.zona,
    zonaPor: c.zonaPor,
    falta: c.falta,
    motivo: c.motivo,
    modelos: modelos.map((m) => ({ proveedor: m.proveedor, ok: m.ok, zona: m.respuesta?.zona ?? null, completa: m.respuesta?.completa ?? null, motivo: m.respuesta?.motivo ?? m.error ?? null })),
    reglas: coinc.map((r) => `${r.texto} (${r.resultado})`),
  };
}
