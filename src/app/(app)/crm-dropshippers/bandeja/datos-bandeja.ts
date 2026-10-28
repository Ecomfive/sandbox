import type { SupabaseClient } from "@supabase/supabase-js";
import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { accesoCrm, areasVisibles, escribeEnArea, MODULO_ATENCION, MODULO_COMERCIAL, type AreaCrm, type PermisosCrm } from "@/lib/crm/areas";
import { borradosPendientes, conversacionesOcultas, mensajesOcultos } from "@/lib/whatsapp/ocultos";

/** Un número de WhatsApp de la empresa (Atención, Comercial…). */
export interface NumeroVista {
  id: string;
  nombre: string;
  numero: string;
  area: AreaCrm;
}

/** Una conversación de la bandeja: con quién es, en qué número, quién la lleva y su último mensaje. */
export interface ConversacionVista {
  id: string;
  numeroId: string;
  telefono: string;
  /** El nombre del dropshipper en el CRM o, si no está, el de su perfil de WhatsApp (o el teléfono). */
  nombre: string;
  nombrePerfil: string | null;
  dropshipperId: string | null;
  codigo: string | null;
  tiendas: string[];
  asignadaA: string | null;
  asignadaAId: string | null;
  estado: "abierta" | "resuelta";
  noLeidos: number;
  ultimoEntranteEn: string | null;
  ultimoMensajeEn: string | null;
  ultimoTexto: string | null;
  ultimoDe: "entrante" | "saliente" | "nota" | null;
  /** El área del chat (migración 0168): decide quién lo ve. Se cambia con «Pasar a otra área». */
  area: AreaCrm;
  /** Alguien marcó que este chat se borró en la app de WhatsApp Business (migración 0171). El historial se conserva aquí igual. */
  borradaEnApp: { por: string | null; en: string } | null;
  /** Hay una petición de borrar este chat esperando autorización (migración 0172). */
  borradoPendiente: boolean;
}

export interface MensajeVista {
  id: string;
  direccion: "entrante" | "saliente" | "nota";
  tipo: string;
  texto: string | null;
  mediaNombre: string | null;
  conArchivo: boolean;
  estado: string;
  error: string | null;
  autor: string | null;
  momento: string;
  /** Vino de un chat exportado desde el celular («Importar chat», wa_id «import:…»), no por el webhook. */
  importado: boolean;
  /** Su autor lo borró «para todos» en WhatsApp: aquí se conserva y se marca (migración 0171). */
  eliminadoEnWhatsapp: boolean;
  /** Hay una petición de borrar este mensaje esperando autorización (migración 0172). */
  borradoPendiente: boolean;
}

/** Lo que se ve del dropshipper junto al chat. */
export interface ResumenDropshipper {
  id: string;
  nombre: string;
  codigo: string | null;
  estado: string;
  tiendas: string[];
  cuentas: string[];
  casos: { codigo: string; titulo: string; prioridad: string }[];
}

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Quien abre el CRM (Atención o Comercial); con `escribe`, además puede escribir en alguna de las dos áreas. */
export async function usuarioBandeja(escribe: boolean): Promise<UsuarioActual | null> {
  const u = await getUsuarioActual();
  if (!u || !(u.modulos.includes(MODULO_ATENCION) || u.modulos.includes(MODULO_COMERCIAL))) return null;
  if (escribe) {
    const a = accesoCrm(u);
    if (!a.escribeAtencion && !a.escribeComercial && !a.escribeDireccion) return null;
  }
  return u;
}

/** Las áreas cuyos números ve esta persona: Atención ve el suyo; Comercial ve los dos. */
export const areasDe = (u: PermisosCrm): AreaCrm[] => areasVisibles(accesoCrm(u));

/**
 * Los números de la empresa y las conversaciones (las 300 más recientes) que esta persona puede ver: las de las áreas que ve. El área es
 * de cada conversación desde la migración 0168, así un solo número sirve a todo el equipo. `null` si falta la migración 0158.
 */
export async function cargarBandeja(supabase: SupabaseClient, usuario: PermisosCrm): Promise<{ numeros: NumeroVista[]; conversaciones: ConversacionVista[] } | null> {
  const areas = areasDe(usuario);
  const numerosR = await supabase.from("whatsapp_numeros").select("id, nombre, numero, area").eq("activo", true).order("nombre");
  if (numerosR.error) return null;
  const numeros = (numerosR.data ?? []) as NumeroVista[];
  if (!numeros.length) return { numeros, conversaciones: [] };
  const { data } = await supabase
    .from("whatsapp_conversaciones")
    .select(
      "id, numero_id, area, telefono, nombre_perfil, dropshipper_id, asignada_a, estado, no_leidos, ultimo_entrante_en, ultimo_mensaje_en, ultimo_texto, ultimo_de, dropshippers(nombre, codigo, tiendas, tienda), perfiles:asignada_a(nombre)",
    )
    .in("area", areas)
    // Solo los chats de los números activos: uno desactivado (el de prueba del sandbox, 28 oct 2026) sale de la bandeja con sus chats.
    .in("numero_id", numeros.map((n) => n.id))
    .order("ultimo_mensaje_en", { ascending: false, nullsFirst: false })
    .limit(300);
  const conversaciones: ConversacionVista[] = (data ?? []).map((c) => {
    const d = uno(c.dropshippers as Uno<{ nombre: string; codigo: string | null; tiendas: string[] | null; tienda: string | null }>);
    return {
      id: c.id as string,
      numeroId: c.numero_id as string,
      telefono: c.telefono as string,
      nombre: d?.nombre ?? (c.nombre_perfil as string | null) ?? (c.telefono as string),
      nombrePerfil: (c.nombre_perfil as string | null) ?? null,
      dropshipperId: (c.dropshipper_id as string | null) ?? null,
      codigo: d?.codigo ?? null,
      tiendas: d?.tiendas?.length ? d.tiendas : d?.tienda ? [d.tienda] : [],
      asignadaA: uno(c.perfiles as Uno<{ nombre: string | null }>)?.nombre ?? null,
      asignadaAId: (c.asignada_a as string | null) ?? null,
      estado: c.estado as "abierta" | "resuelta",
      noLeidos: Number(c.no_leidos ?? 0),
      ultimoEntranteEn: (c.ultimo_entrante_en as string | null) ?? null,
      ultimoMensajeEn: (c.ultimo_mensaje_en as string | null) ?? null,
      ultimoTexto: (c.ultimo_texto as string | null) ?? null,
      ultimoDe: (c.ultimo_de as ConversacionVista["ultimoDe"]) ?? null,
      area: c.area as AreaCrm,
      borradaEnApp: null,
      borradoPendiente: false,
    };
  });
  // Las que alguien marcó como borradas en la app de WhatsApp Business (migración 0171). Sin la columna, ninguna.
  const marcadas = await supabase.from("whatsapp_conversaciones").select("id, borrada_en_app_en, borrada_en_app_por").not("borrada_en_app_en", "is", null);
  if (!marcadas.error) {
    const porId = new Map((marcadas.data ?? []).map((x) => [x.id as string, { por: (x.borrada_en_app_por as string | null) ?? null, en: x.borrada_en_app_en as string }]));
    for (const c of conversaciones) c.borradaEnApp = porId.get(c.id) ?? null;
  }
  // Lo que se autorizó borrar se oculta y se marca lo que espera autorización (migración 0172). Sin ella, nada.
  const [ocultas, pendientes] = await Promise.all([conversacionesOcultas(supabase), borradosPendientes(supabase)]);
  for (const c of conversaciones) c.borradoPendiente = pendientes.chats.has(c.id);
  return { numeros, conversaciones: conversaciones.filter((c) => !ocultas.has(c.id)) };
}

/**
 * La conversación si esta persona la puede ver (su número es de un área suya), con el teléfono, el número de la empresa (su id en
 * Meta) y el último mensaje del dropshipper; `null` si no.
 */
export async function conversacionPermitida(
  supabase: SupabaseClient,
  id: string,
  usuario: PermisosCrm,
  /** Para mandar, anotar, resolver o tomar: además, poder escribir en el área del número (auditoría del 27 oct 2026). */
  escribe = false,
): Promise<{ id: string; area: AreaCrm; telefono: string; dropshipperId: string | null; asignadaA: string | null; ultimoEntranteEn: string | null; phoneNumberId: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase
    .from("whatsapp_conversaciones")
    .select("id, area, telefono, dropshipper_id, asignada_a, ultimo_entrante_en, whatsapp_numeros(phone_number_id)")
    .eq("id", id)
    .maybeSingle();
  const numero = uno(data?.whatsapp_numeros as Uno<{ phone_number_id: string }>);
  const area = data?.area as AreaCrm | undefined;
  if (!data || !numero || !area || !areasDe(usuario).includes(area)) return null;
  if (escribe && !escribeEnArea(accesoCrm(usuario), area)) return null;
  return {
    id: data.id as string,
    area,
    telefono: data.telefono as string,
    dropshipperId: (data.dropshipper_id as string | null) ?? null,
    asignadaA: (data.asignada_a as string | null) ?? null,
    ultimoEntranteEn: (data.ultimo_entrante_en as string | null) ?? null,
    phoneNumberId: numero.phone_number_id,
  };
}

/** Cuántos mensajes se traen de una vez; si vinieron todos, hay más viejos para «Ver mensajes anteriores». */
export const MENSAJES_POR_VEZ = 300;

/**
 * Los mensajes de una conversación (los 300 más recientes, del más viejo al más nuevo; con `antesDe`, los 300 anteriores a esa hora) y
 * el resumen de su dropshipper.
 */
export async function cargarConversacion(
  supabase: SupabaseClient,
  id: string,
  dropshipperId: string | null,
  antesDe?: string,
): Promise<{ mensajes: MensajeVista[]; hayAnteriores: boolean; dropshipper: ResumenDropshipper | null }> {
  let consulta = supabase
    .from("whatsapp_mensajes")
    .select("id, direccion, tipo, texto, media_id, media_nombre, estado, error, autor_nombre, momento, wa_id")
    .eq("conversacion_id", id);
  if (antesDe) consulta = consulta.lt("momento", antesDe);
  const [mensajesR, dsR, casosR, eliminadosR] = await Promise.all([
    consulta.order("momento", { ascending: false }).limit(MENSAJES_POR_VEZ),
    dropshipperId
      ? supabase.from("dropshippers").select("id, nombre, codigo, estado, tiendas, tienda, dropshipper_cuentas(plataformas(nombre), paises(codigo))").eq("id", dropshipperId).maybeSingle()
      : Promise.resolve({ data: null }),
    dropshipperId
      ? supabase.from("casos_dropshipper").select("numero, titulo, prioridad").eq("dropshipper_id", dropshipperId).neq("estado", "resuelto").order("abierto_en", { ascending: false }).limit(5)
      : Promise.resolve({ data: null }),
    // Los que su autor borró «para todos» en WhatsApp (migración 0171): se muestran con su marca. Sin la columna, ninguno.
    supabase.from("whatsapp_mensajes").select("id").eq("conversacion_id", id).not("eliminado_en_whatsapp_en", "is", null),
  ]);
  const [ocultos, pendientes] = await Promise.all([mensajesOcultos(supabase, id), borradosPendientes(supabase)]);
  const eliminados = new Set((eliminadosR.error ? [] : (eliminadosR.data ?? [])).map((x) => x.id as string));
  const traidos = mensajesR.data ?? [];
  const mensajes: MensajeVista[] = traidos
    .filter((m) => !ocultos.has(m.id as string))
    .map((m) => ({
      id: m.id as string,
      direccion: m.direccion as MensajeVista["direccion"],
      tipo: m.tipo as string,
      texto: (m.texto as string | null) ?? null,
      mediaNombre: (m.media_nombre as string | null) ?? null,
      conArchivo: !!m.media_id,
      estado: m.estado as string,
      error: (m.error as string | null) ?? null,
      autor: (m.autor_nombre as string | null) ?? null,
      momento: m.momento as string,
      importado: String(m.wa_id ?? "").startsWith("import:"),
      eliminadoEnWhatsapp: eliminados.has(m.id as string),
      borradoPendiente: pendientes.mensajes.has(m.id as string),
    }))
    .reverse();
  const d = dsR.data as {
    id: string;
    nombre: string;
    codigo: string | null;
    estado: string;
    tiendas: string[] | null;
    tienda: string | null;
    dropshipper_cuentas?: { plataformas: Uno<{ nombre: string }>; paises: Uno<{ codigo: string }> }[];
  } | null;
  const dropshipper: ResumenDropshipper | null = d
    ? {
        id: d.id,
        nombre: d.nombre,
        codigo: d.codigo,
        estado: d.estado,
        tiendas: d.tiendas?.length ? d.tiendas : d.tienda ? [d.tienda] : [],
        cuentas: [...new Set((d.dropshipper_cuentas ?? []).map((c) => `${uno(c.plataformas)?.nombre ?? "—"} ${uno(c.paises)?.codigo ?? ""}`.trim()))],
        casos: ((casosR.data ?? []) as { numero: number; titulo: string; prioridad: string }[]).map((c) => ({ codigo: `CAS-${String(c.numero).padStart(4, "0")}`, titulo: c.titulo, prioridad: c.prioridad })),
      }
    : null;
  return { mensajes, hayAnteriores: traidos.length === MENSAJES_POR_VEZ, dropshipper };
}
