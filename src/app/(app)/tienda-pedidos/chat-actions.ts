"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import {
  esErrorDeVentana,
  telefonoParaIcomfly,
  type ChatPendiente,
  type MensajeChat,
} from "@/lib/tienda/chat-tienda";
import {
  chatsPendientes,
  enviarPlantilla,
  enviarTexto,
  leerChat,
  marcarLeido,
  notaInterna,
  pausarBot,
  plantillasAprobadas,
  SIN_MIGRACION_CHATS,
  type PlantillaChat,
} from "@/lib/tienda/chat-tienda-datos";
import { conexionesIcomfly } from "@/lib/tienda/icomfly";
import { cargarOrdenTienda } from "@/lib/tienda/orden-detalle";

// Chat de WhatsApp del cliente con iComfly (13 nov 2026, prototipo aprobado): va en la ficha del pedido de tienda, sin apartado propio (pedido de Hernán).
// Leer pide el módulo Pedidos de tienda; escribir, poder modificarlo. El teléfono del cliente nunca llega del navegador: sale del pedido.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODULO = "tienda-pedidos";

/** A quién se le habla: el cliente de un pedido (su tienda y su teléfono). */
export type DestinoChat = { pedido: string };

type Resuelto = { tiendaId: string; tiendaNombre: string; telefono: string };

async function resolver(
  destino: DestinoChat,
): Promise<
  | Resuelto
  | {
      estado: "sin_conexion" | "sin_telefono" | "no_existe";
      tiendaNombre?: string;
    }
> {
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!UUID.test(String(destino?.pedido))) return { estado: "no_existe" };
  const orden = await cargarOrdenTienda(supabase, destino.pedido, pais.id);
  if (!orden) return { estado: "no_existe" };
  const { data: t } = await supabase
    .from("tiendas")
    .select("id, nombre")
    .eq("pais_id", pais.id)
    .ilike("nombre", orden.tienda)
    .limit(1)
    .maybeSingle();
  if (!t) return { estado: "sin_conexion", tiendaNombre: orden.tienda };
  const con = await conexionesIcomfly(supabase, [t.id as string]);
  if (!con?.get(t.id as string)?.conectado)
    return { estado: "sin_conexion", tiendaNombre: t.nombre as string };
  const telefono = telefonoParaIcomfly(
    orden.cliente?.telefono ?? null,
    pais.codigo,
  );
  if (!telefono)
    return { estado: "sin_telefono", tiendaNombre: t.nombre as string };
  return {
    tiendaId: t.id as string,
    tiendaNombre: t.nombre as string,
    telefono,
  };
}

export interface EstadoChat {
  estado: "ok" | "sin_conexion" | "sin_telefono" | "no_existe" | "error";
  tiendaNombre: string | null;
  conversacionId: number | null;
  mensajes: MensajeChat[];
  botPausado: boolean;
  pausadoPor: string | null;
  /** Se puede escribir (hay teléfono a quién mandar). */
  puedeEnviar: boolean;
  /** El último mensaje con el que el chat quedó marcado leído en iComfly (lo devuelve el navegador en la siguiente lectura). */
  leidoHasta?: number | null;
  error?: string;
}

const vacio = (
  estado: EstadoChat["estado"],
  tiendaNombre: string | null = null,
  error?: string,
): EstadoChat => ({
  estado,
  tiendaNombre,
  conversacionId: null,
  mensajes: [],
  botPausado: false,
  pausadoPor: null,
  puedeEnviar: false,
  ...(error ? { error } : {}),
});

/**
 * El chat (se pide al abrir y cada pocos segundos mientras está abierto). Si hay un mensaje más nuevo que `leidoHasta` (el que el navegador ya marcó), lo marca
 * leído en iComfly: abrir el chat en el sistema borra el numerito de la lista. Solo quien puede escribir (marcar leído es un cambio en iComfly).
 */
export async function leerChatTienda(
  destino: DestinoChat,
  leidoHasta: number | null = null,
): Promise<EstadoChat> {
  const usuario = await requireModulo(MODULO);
  const r = await resolver(destino);
  if ("estado" in r) return vacio(r.estado, r.tiendaNombre ?? null);
  const supabase = createServiceClient();
  const c = await leerChat(supabase, r.tiendaId, r.telefono);
  if ("error" in c)
    return vacio(
      "error",
      r.tiendaNombre,
      /tienda_chat|schema cache/i.test(c.error) ? SIN_MIGRACION_CHATS : c.error,
    );
  const ultimo = c.mensajes.at(-1)?.id ?? null;
  let marcado = typeof leidoHasta === "number" ? leidoHasta : null;
  if (
    c.conversacionId !== null &&
    ultimo !== null &&
    ultimo !== marcado &&
    !usuario.modulosSoloLectura.includes(MODULO)
  ) {
    await marcarLeido(supabase, r.tiendaId, c.conversacionId).catch(
      () => undefined,
    );
    marcado = ultimo;
  }
  return {
    estado: "ok",
    tiendaNombre: r.tiendaNombre,
    conversacionId: c.conversacionId,
    mensajes: c.mensajes,
    botPausado: c.botPausado,
    pausadoPor: c.pausadoPor,
    puedeEnviar: true,
    leidoHasta: marcado,
  };
}

/** Resuelve el destino para escribir. */
async function paraEscribir(
  destino: DestinoChat,
): Promise<Resuelto | { error: string }> {
  const r = await resolver(destino);
  if ("estado" in r)
    return {
      error:
        r.estado === "sin_conexion"
          ? "La tienda no está conectada a iComfly."
          : r.estado === "sin_telefono"
            ? "El pedido no tiene un teléfono válido."
            : "No se encontró.",
    };
  return r;
}

export async function enviarTextoChat(
  destino: DestinoChat,
  texto: string,
): Promise<{ error?: string; necesitaPlantilla?: boolean }> {
  const usuario = await requireModuloEscritura(MODULO);
  const limpio = String(texto ?? "").trim();
  if (!limpio) return { error: "Escribe el mensaje." };
  if (limpio.length > 4000)
    return {
      error: "El mensaje es demasiado largo (máximo 4,000 caracteres).",
    };
  const d = await paraEscribir(destino);
  if ("error" in d) return d;
  const nombre = usuario.nombre || usuario.email;
  const r = await enviarTexto(
    createServiceClient(),
    d.tiendaId,
    d.telefono,
    limpio,
    { id: usuario.id, nombre },
  );
  if (r.error)
    return {
      error: esErrorDeVentana(r.error)
        ? "Pasaron más de 24 horas desde el último mensaje del cliente: WhatsApp solo deja mandar una plantilla."
        : r.error,
      necesitaPlantilla: esErrorDeVentana(r.error),
    };
  await registrarAuditoria({
    accion: "chat_tienda_mensaje",
    entidad: "tiendas",
    entidadId: d.tiendaId,
    detalle: `${d.tiendaNombre}: mensaje por WhatsApp (iComfly) desde la ficha del pedido`,
  });
  return {};
}

export async function plantillasChat(
  destino: DestinoChat,
): Promise<{ plantillas: PlantillaChat[] } | { error: string }> {
  await requireModulo(MODULO);
  const r = await resolver(destino);
  if ("estado" in r) return { error: "La tienda no está conectada a iComfly." };
  const p = await plantillasAprobadas(createServiceClient(), r.tiendaId);
  return Array.isArray(p) ? { plantillas: p } : p;
}

export async function enviarPlantillaChat(
  destino: DestinoChat,
  plantilla: { nombre: string; idioma: string; valores: string[] },
): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const d = await paraEscribir(destino);
  if ("error" in d) return d;
  const supabase = createServiceClient();
  const lista = await plantillasAprobadas(supabase, d.tiendaId);
  if (!Array.isArray(lista)) return lista;
  const p = lista.find(
    (x) => x.nombre === plantilla.nombre && x.idioma === plantilla.idioma,
  );
  if (!p) return { error: "Esa plantilla no está aprobada en la tienda." };
  const valores = (Array.isArray(plantilla.valores) ? plantilla.valores : [])
    .slice(0, p.variables.length)
    .map((v) =>
      String(v ?? "")
        .trim()
        .slice(0, 300),
    );
  if (valores.length < p.variables.length || valores.some((v) => !v))
    return { error: "Completa todas las variables de la plantilla." };
  const r = await enviarPlantilla(
    supabase,
    d.tiendaId,
    d.telefono,
    { nombre: p.nombre, idioma: p.idioma, valores, cuerpo: p.cuerpo },
    { id: usuario.id, nombre: usuario.nombre || usuario.email },
  );
  if (r.error) return r;
  await registrarAuditoria({
    accion: "chat_tienda_plantilla",
    entidad: "tiendas",
    entidadId: d.tiendaId,
    detalle: `${d.tiendaNombre}: plantilla «${p.nombre}» por WhatsApp (iComfly)`,
  });
  return {};
}

export async function pausarBotChat(
  destino: DestinoChat,
  pausar: boolean,
): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const d = await resolver(destino);
  if ("estado" in d) return { error: "La tienda no está conectada a iComfly." };
  const supabase = createServiceClient();
  const c = await leerChat(supabase, d.tiendaId, d.telefono);
  const conversacionId = "error" in c ? null : c.conversacionId;
  const r = await pausarBot(
    supabase,
    d.tiendaId,
    d.telefono,
    conversacionId,
    pausar === true,
    usuario.nombre || usuario.email,
  );
  if (!r.error)
    await registrarAuditoria({
      accion: pausar ? "chat_tienda_pausar_bot" : "chat_tienda_reanudar_bot",
      entidad: "tiendas",
      entidadId: d.tiendaId,
      detalle: `${d.tiendaNombre}: ${pausar ? "pausó" : "reanudó"} el bot de iComfly en un chat`,
    });
  return r;
}

export async function notaChat(
  destino: DestinoChat,
  texto: string,
): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const limpio = String(texto ?? "")
    .trim()
    .slice(0, 1000);
  if (!limpio) return { error: "Escribe la nota." };
  const d = await resolver(destino);
  if ("estado" in d) return { error: "La tienda no está conectada a iComfly." };
  const supabase = createServiceClient();
  const c = await leerChat(supabase, d.tiendaId, d.telefono);
  const conversacionId = "error" in c ? null : c.conversacionId;
  if (conversacionId === null)
    return { error: "El cliente todavía no tiene conversación." };
  return notaInterna(
    supabase,
    d.tiendaId,
    conversacionId,
    limpio,
    usuario.nombre || usuario.email,
  );
}

/** Los chats con mensajes pendientes de una tienda conectada, para el numerito de WhatsApp de la lista de pedidos (vacío si no está conectada). */
export async function pendientesWhatsapp(
  tiendaId: string,
): Promise<ChatPendiente[]> {
  await requireModulo(MODULO);
  if (!UUID.test(String(tiendaId))) return [];
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: t } = await supabase
    .from("tiendas")
    .select("id")
    .eq("id", tiendaId)
    .eq("pais_id", pais.id)
    .maybeSingle();
  if (!t) return [];
  const con = await conexionesIcomfly(supabase, [tiendaId]);
  if (!con?.get(tiendaId)?.conectado) return [];
  const r = await chatsPendientes(supabase, tiendaId);
  return Array.isArray(r) ? r : [];
}
