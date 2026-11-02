import type { SupabaseClient } from "@supabase/supabase-js";
import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { esTelefonoInterno } from "@/lib/crm/chat-interno";
import { accesoCrm, areasVisibles, escribeEnArea, MODULO_ATENCION, MODULO_COMERCIAL, MODULO_DIRECCION, numerosDeAreas, pierdeLoBorrado, type AreaCrm, type PermisosCrm } from "@/lib/crm/areas";
import { chatVisibleParaAtencion, mensajeVisibleParaAtencion } from "@/lib/whatsapp/borrados-atencion";
import { areaDeModulos, cargoDePersona } from "@/lib/crm/respondieron";
import { personasConModulos } from "@/lib/whatsapp/personas-crm";
import { borradosPendientes, conversacionesOcultas, corteDeBorradoEnApp, mensajesOcultos } from "@/lib/whatsapp/ocultos";
import { esGrupo, type GrupoMotivo } from "@/lib/whatsapp/prioridad";
import { dondeVende, paisDeNumeroEmpresa, paisesDondeVende, type VendeEn } from "@/lib/whatsapp/origen-chat";
import { nombreSinNumero } from "@/lib/whatsapp/telefono-oculto";

/** Un número de WhatsApp de la empresa (Atención, Comercial…). */
export interface NumeroVista {
  id: string;
  nombre: string;
  numero: string;
  area: AreaCrm;
  /** El país del número (código ISO, «PA»), migración 0209: cada chat lleva su bandera y la bandeja filtra por él. null = sin elegir. */
  pais: string | null;
}

/** Una conversación de la bandeja: con quién es, en qué número, quién la lleva y su último mensaje. */
export interface ConversacionVista {
  id: string;
  numeroId: string;
  /** El nombre con que se ve el chat: el que le puso el equipo, el del dropshipper en el CRM, el de su perfil de WhatsApp o «Contacto XXXX». El número nunca viaja a la pantalla. */
  nombre: string;
  /** El nombre que le puso el equipo (migración 0179), si lo hay: manda sobre los demás. */
  nombrePersonalizado: string | null;
  nombrePerfil: string | null;
  dropshipperId: string | null;
  codigo: string | null;
  /** Su dropshipper es VIP (de los que más pedidos mueven; se marca en el CRM o en «Más» de la ficha del chat). */
  vip: boolean;
  /** Su tipo de cliente (Rookie `regular`, VIP o Black), del dropshipper vinculado. */
  tipoCliente: string | null;
  tiendas: string[];
  asignadaA: string | null;
  asignadaAId: string | null;
  /** La foto (Usuarios) y el cargo de quien lo lleva, para su globito. */
  asignadaFoto: string | null;
  asignadaCargo: string | null;
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
  /** Dónde vende (códigos ISO): los países de su dropshipper en el CRM y de sus cuentas. No sale del prefijo del número (alguien de Colombia vende en Costa Rica). */
  paises: string[];
  /** Dónde vende: plataforma y país, de sus cuentas vinculadas y lo puesto a mano en el chat (migración 0193). */
  vendeEn: VendeEn[];
  /** Es un chat entre dos números de la empresa («WhatsApp interno»): no es un cliente y no sale en la lista ni en los conteos. */
  interno: boolean;
  /** Sus etiquetas, como en ClickUp: las del dropshipper si el chat tiene uno; si no, las del chat (migración 0185). */
  etiquetas: string[];
  /** Desde cuándo espera respuesta: su primer mensaje sin contestar (migración 0189). Sin la migración, null y se usa `ultimoEntranteEn`. */
  esperandoDesde: string | null;
  /** El motivo del chat (migración 0189): lo lee la IA o lo corrige el equipo. Decide el plazo y el orden de la lista. */
  motivo: MotivoVista | null;
}

export interface MotivoVista {
  grupo: GrupoMotivo;
  resumen: string | null;
  por: "ia" | "persona";
  porNombre: string | null;
}

/** Lo que carga la Bandeja: los números, los chats y el color elegido de cada etiqueta (por su nombre). */
export interface DatosBandeja {
  numeros: NumeroVista[];
  /** Todos los números activos de la empresa (sin el número), para el «WhatsApp interno» entre áreas. */
  numerosEmpresa: { id: string; nombre: string; area: AreaCrm }[];
  conversaciones: ConversacionVista[];
  colores: Record<string, string>;
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
  /** El cargo de quien lo mandó: su puesto en Puestos o, sin puesto, su área del CRM («Líder comercial», «Atención»…); null si no se sabe. */
  autorCargo: string | null;
  /** La foto del autor en el sistema (Usuarios), para su globito. */
  autorFoto: string | null;
  momento: string;
  /** Vino de un chat exportado desde el celular («Importar chat», wa_id «import:…»), no por el webhook. */
  importado: boolean;
  /** Su autor lo borró «para todos» en WhatsApp: aquí se conserva y se marca (migración 0171). */
  eliminadoEnWhatsapp: boolean;
  /** Hay una petición de borrar este mensaje esperando autorización (migración 0172). */
  borradoPendiente: boolean;
  /** Su id en WhatsApp («wamid…»): las reacciones apuntan a él. */
  waId?: string | null;
  /** En una reacción, el `waId` del mensaje reaccionado (migración 0186): la bandeja la dibuja sobre ese mensaje. */
  reaccionA?: string | null;
  /** Su autor lo editó en WhatsApp (migración 0191): el texto ya es el nuevo y se marca «editado». */
  editado?: boolean;
  /** En un audio, lo que dice, ya transcrito con la IA (migración 0200); null hasta que alguien lo transcribe. */
  transcripcion?: string | null;
}

/** Un mensaje de la vista previa que se despliega al pasar el cursor por la lista de chats. */
export interface VistaPreviaMensaje {
  id: string;
  direccion: "entrante" | "saliente" | "nota";
  texto: string;
  momento: string;
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

/** Los números activos de la empresa con su país (migración 0209; sin ella, sin país). null si falta la migración 0158. */
export async function numerosActivos(supabase: SupabaseClient): Promise<NumeroVista[] | null> {
  const conPais = await supabase.from("whatsapp_numeros").select("id, nombre, numero, area, paises(codigo)").eq("activo", true).order("nombre");
  if (!conPais.error)
    return (conPais.data ?? []).map((n) => ({
      id: n.id as string,
      nombre: n.nombre as string,
      numero: n.numero as string,
      area: n.area as AreaCrm,
      // El elegido en «Números»; si no hay, el de su prefijo (+506 Costa Rica…), así un número recién llegado ya trae su bandera.
      pais: uno(n.paises as Uno<{ codigo: string }>)?.codigo ?? paisDeNumeroEmpresa(n.numero as string),
    }));
  const sinPais = await supabase.from("whatsapp_numeros").select("id, nombre, numero, area").eq("activo", true).order("nombre");
  if (sinPais.error) return null;
  return ((sinPais.data ?? []) as Omit<NumeroVista, "pais">[]).map((n) => ({ ...n, pais: paisDeNumeroEmpresa(n.numero) }));
}

/**
 * Los números de la empresa y las conversaciones (las 300 más recientes) que esta persona puede ver: las de las áreas que ve. El área es
 * de cada conversación desde la migración 0168, así un solo número sirve a todo el equipo. `null` si falta la migración 0158.
 */
export async function cargarBandeja(supabase: SupabaseClient, usuario: PermisosCrm): Promise<DatosBandeja | null> {
  const areas = areasDe(usuario);
  const sinBorrados = pierdeLoBorrado(accesoCrm(usuario));
  const numeros = await numerosActivos(supabase);
  if (numeros === null) return null;
  if (!numeros.length) return { numeros, numerosEmpresa: [], conversaciones: [], colores: {} };
  const { data } = await supabase
    .from("whatsapp_conversaciones")
    .select(
      "id, numero_id, area, telefono, nombre_perfil, dropshipper_id, asignada_a, estado, no_leidos, ultimo_entrante_en, ultimo_mensaje_en, ultimo_texto, ultimo_de, dropshippers(nombre, codigo, tiendas, tienda, nivel, etiquetas, dropshipper_paises(paises(codigo)), dropshipper_cuentas(plataformas(nombre), paises(codigo))), perfiles:asignada_a(nombre, avatar_url)",
    )
    .in("area", areas)
    // Solo los chats de los números activos: uno desactivado (el de prueba del sandbox, 28 oct 2026) sale de la bandeja con sus chats.
    .in("numero_id", numeros.map((n) => n.id))
    .order("ultimo_mensaje_en", { ascending: false, nullsFirst: false })
    .limit(300);
  // Los números de la empresa, en dígitos: un chat con uno de ellos es interno (el número de la otra área). El teléfono no viaja a la pantalla.
  const digitos = (t: unknown) => String(t ?? "").replace(/\D/g, "");
  const empresa = new Map(numeros.filter((n) => digitos(n.numero).length >= 7).map((n) => [digitos(n.numero), n]));
  const conversaciones: ConversacionVista[] = (data ?? []).map((c) => {
    const d = uno(c.dropshippers as Uno<{ nombre: string; codigo: string | null; tiendas: string[] | null; tienda: string | null; nivel: string | null; etiquetas: string[] | null;
      dropshipper_paises?: { paises: Uno<{ codigo: string }> }[];
      dropshipper_cuentas?: { plataformas: Uno<{ nombre: string }>; paises: Uno<{ codigo: string }> }[];
    }>);
    const cuentas = (d?.dropshipper_cuentas ?? []).map((x) => ({ plataforma: uno(x.plataformas)?.nombre ?? null, pais: uno(x.paises)?.codigo ?? null }));
    return {
      id: c.id as string,
      numeroId: c.numero_id as string,
      nombre: empresa.get(digitos(c.telefono))?.nombre ?? d?.nombre ?? (c.nombre_perfil as string | null) ?? nombreSinNumero(c.id as string),
      nombrePerfil: (c.nombre_perfil as string | null) ?? null,
      dropshipperId: (c.dropshipper_id as string | null) ?? null,
      codigo: d?.codigo ?? null,
      // Black cuenta como VIP para el plazo de respuesta.
      vip: d?.nivel === "vip" || d?.nivel === "black",
      tipoCliente: d?.nivel ?? null,
      tiendas: d?.tiendas?.length ? d.tiendas : d?.tienda ? [d.tienda] : [],
      asignadaA: uno(c.perfiles as Uno<{ nombre: string | null }>)?.nombre ?? null,
      asignadaAId: (c.asignada_a as string | null) ?? null,
      asignadaFoto: uno(c.perfiles as Uno<{ avatar_url: string | null }>)?.avatar_url ?? null,
      asignadaCargo: null,
      estado: c.estado as "abierta" | "resuelta",
      noLeidos: Number(c.no_leidos ?? 0),
      ultimoEntranteEn: (c.ultimo_entrante_en as string | null) ?? null,
      ultimoMensajeEn: (c.ultimo_mensaje_en as string | null) ?? null,
      ultimoTexto: (c.ultimo_texto as string | null) ?? null,
      ultimoDe: (c.ultimo_de as ConversacionVista["ultimoDe"]) ?? null,
      area: c.area as AreaCrm,
      borradaEnApp: null,
      borradoPendiente: false,
      nombrePersonalizado: null,
      // Con dropshipper, las etiquetas son las suyas (las mismas de su ficha del CRM); sin él, las del chat.
      etiquetas: d ? (d.etiquetas ?? []) : [],
      esperandoDesde: null,
      motivo: null,
      interno: empresa.has(digitos(c.telefono)),
      vendeEn: dondeVende(cuentas, []),
      paises: paisesDondeVende((d?.dropshipper_paises ?? []).map((x) => uno(x.paises)?.codigo ?? null), cuentas.filter((x): x is { plataforma: string | null; pais: string } => !!x.pais)),
    };
  });
  // Las salas de notas del chat interno (30 oct 2026, ya no se usan; el chat interno volvió a ser por WhatsApp) quedan guardadas pero no se muestran.
  const salasViejas = new Set((data ?? []).filter((c) => esTelefonoInterno(c.telefono as string)).map((c) => c.id as string));
  // Las que alguien marcó como borradas en la app de WhatsApp Business (migración 0171). Sin la columna, ninguna.
  const marcadas = await supabase.from("whatsapp_conversaciones").select("id, borrada_en_app_en, borrada_en_app_por").not("borrada_en_app_en", "is", null);
  if (!marcadas.error) {
    const porId = new Map((marcadas.data ?? []).map((x) => [x.id as string, { por: (x.borrada_en_app_por as string | null) ?? null, en: x.borrada_en_app_en as string }]));
    for (const c of conversaciones) c.borradaEnApp = porId.get(c.id) ?? null;
  }
  // Los nombres que el equipo les puso a los chats (migración 0179). Sin la columna, ninguno.
  const nombrados = await supabase.from("whatsapp_conversaciones").select("id, nombre_personalizado").not("nombre_personalizado", "is", null);
  if (!nombrados.error) {
    const alias = new Map((nombrados.data ?? []).map((x) => [x.id as string, x.nombre_personalizado as string]));
    for (const c of conversaciones) {
      const a = alias.get(c.id);
      if (a) {
        c.nombrePersonalizado = a;
        c.nombre = a;
      }
    }
  }
  // El cargo de quien lleva cada chat, para su globito (los cargos se guardan 5 minutos).
  if (conversaciones.some((c) => c.asignadaAId)) {
    const cargos = await cargosDelEquipo(supabase);
    for (const c of conversaciones) if (c.asignadaAId) c.asignadaCargo = cargos.get(c.asignadaAId) ?? null;
  }
  // Dónde vende cada dropshipper, puesto a mano o quitado (migraciones 0193 y 0194). Sin ellas, solo lo de sus cuentas.
  const conDs = [...new Set(conversaciones.map((c) => c.dropshipperId).filter((x): x is string => !!x))];
  if (conDs.length) {
    const manual = await supabase.from("dropshipper_vende_en").select("dropshipper_id, oculto, crm_plataformas_venta(nombre), paises(codigo)").in("dropshipper_id", conDs);
    if (!manual.error) {
      const porDs = new Map<string, { plataforma: string; pais: string; oculto: boolean }[]>();
      for (const m of manual.data ?? []) {
        const plataforma = uno(m.crm_plataformas_venta as Uno<{ nombre: string }>)?.nombre;
        const pais = uno(m.paises as Uno<{ codigo: string }>)?.codigo;
        if (!plataforma || !pais) continue;
        porDs.set(m.dropshipper_id as string, [...(porDs.get(m.dropshipper_id as string) ?? []), { plataforma, pais, oculto: !!m.oculto }]);
      }
      for (const c of conversaciones) {
        const extra = c.dropshipperId ? porDs.get(c.dropshipperId) : undefined;
        if (!extra) continue;
        c.vendeEn = dondeVende(c.vendeEn, extra);
        c.paises = [...new Set([...c.paises, ...c.vendeEn.map((e) => e.pais)])];
      }
    }
  }
  // Las etiquetas de los chats y el color de cada una (migración 0185). Sin ella, ninguna.
  const colores: Record<string, string> = {};
  const [etiquetadas, coloresR] = await Promise.all([
    supabase.from("whatsapp_conversaciones").select("id, etiquetas").neq("etiquetas", "{}"),
    supabase.from("whatsapp_etiquetas").select("nombre, color"),
  ]);
  if (!etiquetadas.error) {
    const porId = new Map((etiquetadas.data ?? []).map((x) => [x.id as string, (x.etiquetas as string[] | null) ?? []]));
    for (const c of conversaciones) if (!c.dropshipperId) c.etiquetas = porId.get(c.id) ?? [];
  }
  if (!coloresR.error) for (const x of coloresR.data ?? []) colores[x.nombre as string] = x.color as string;
  // La espera y el motivo de cada chat (migración 0189). Sin ella, la bandeja ordena y mide como antes.
  const conMotivo = await supabase
    .from("whatsapp_conversaciones")
    .select("id, esperando_desde, motivo_grupo, motivo_resumen, motivo_por, motivo_por_nombre")
    .or("esperando_desde.not.is.null,motivo_grupo.not.is.null")
    .limit(5000);
  if (!conMotivo.error) {
    const porId = new Map((conMotivo.data ?? []).map((x) => [x.id as string, x]));
    for (const c of conversaciones) {
      const x = porId.get(c.id);
      if (!x) continue;
      c.esperandoDesde = (x.esperando_desde as string | null) ?? null;
      if (esGrupo(x.motivo_grupo))
        c.motivo = { grupo: x.motivo_grupo, resumen: (x.motivo_resumen as string | null) ?? null, por: x.motivo_por === "persona" ? "persona" : "ia", porNombre: (x.motivo_por_nombre as string | null) ?? null };
    }
  }
  // Lo que se autorizó borrar se oculta y se marca lo que espera autorización (migración 0172). Sin ella, nada.
  const [ocultas, pendientes] = await Promise.all([conversacionesOcultas(supabase), borradosPendientes(supabase)]);
  for (const c of conversaciones) c.borradoPendiente = pendientes.chats.has(c.id);
  // Solo se ofrecen los números de las áreas de la persona (Atención no ve el de Comercial ni su selector). Los chats ya salen por su área, venga del número que venga.
  return {
    numeros: numerosDeAreas(numeros, areas),
    numerosEmpresa: numeros.map((n) => ({ id: n.id, nombre: n.nombre, area: n.area })),
    // Lo borrado en la app de WhatsApp Business: a quien tiene solo Atención el chat marcado desaparece (y no ve la marca); los demás lo ven intacto, con su marca.
    conversaciones: conversaciones
      .filter((c) => !ocultas.has(c.id) && !salasViejas.has(c.id) && (!sinBorrados || chatVisibleParaAtencion(c.ultimoMensajeEn, c.borradaEnApp?.en ?? null)))
      .map((c) => (sinBorrados && c.borradaEnApp ? { ...c, borradaEnApp: null } : c)),
    colores,
  };
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
): Promise<{ id: string; area: AreaCrm; telefono: string; dropshipperId: string | null; asignadaA: string | null; ultimoEntranteEn: string | null; phoneNumberId: string; numeroEmpresa: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase
    .from("whatsapp_conversaciones")
    .select("id, area, telefono, dropshipper_id, asignada_a, ultimo_entrante_en, whatsapp_numeros(phone_number_id, numero)")
    .eq("id", id)
    .maybeSingle();
  const numero = uno(data?.whatsapp_numeros as Uno<{ phone_number_id: string; numero: string | null }>);
  const area = data?.area as AreaCrm | undefined;
  if (!data || !numero || !area || !areasDe(usuario).includes(area)) return null;
  // Una sala de notas vieja del chat interno ya no se abre.
  if (esTelefonoInterno(data.telefono as string)) return null;
  if (escribe && !escribeEnArea(accesoCrm(usuario), area)) return null;
  return {
    id: data.id as string,
    area,
    telefono: data.telefono as string,
    dropshipperId: (data.dropshipper_id as string | null) ?? null,
    asignadaA: (data.asignada_a as string | null) ?? null,
    ultimoEntranteEn: (data.ultimo_entrante_en as string | null) ?? null,
    phoneNumberId: numero.phone_number_id,
    // El número de la empresa: con varios números en 360dialog, decide con qué clave se manda (proveedor.ts).
    numeroEmpresa: numero.numero ?? null,
  };
}

/** El cargo de cada persona del CRM, guardado unos minutos: la bandeja se refresca cada 8 s y los puestos y permisos casi no cambian. */
let cargosGuardados: { hasta: number; mapa: Map<string, string> } | null = null;

/**
 * El cargo con que se muestra junto a su nombre a quien respondió en un chat (`cargoDePersona`): su puesto en Puestos o, sin puesto, su área
 * del CRM por permisos (Dirección > Comercial > Atención). Si algo falla, un mapa vacío: los mensajes salen igual, solo con el nombre.
 */
async function cargosDelEquipo(supabase: SupabaseClient): Promise<Map<string, string>> {
  if (cargosGuardados && cargosGuardados.hasta > Date.now()) return cargosGuardados.mapa;
  try {
    const modulos = [MODULO_DIRECCION, MODULO_COMERCIAL, MODULO_ATENCION];
    const [listas, puestosR, ocupantesR] = await Promise.all([
      Promise.all(modulos.map((m) => personasConModulos(supabase, [m]))),
      supabase.from("puestos").select("id, nombre, activo"),
      supabase.from("puesto_personas").select("puesto_id, usuario_id, principal"),
    ]);
    const puestos = puestosR.error ? [] : (puestosR.data ?? []).map((p) => ({ id: p.id as string, nombre: String(p.nombre ?? ""), activo: p.activo !== false }));
    const ocupantes = ocupantesR.error ? [] : (ocupantesR.data ?? []).map((o) => ({ puestoId: o.puesto_id as string, usuarioId: o.usuario_id as string, principal: !!o.principal }));
    const dePersona = new Map<string, string[]>();
    listas.forEach((personas, i) => {
      for (const p of personas) dePersona.set(p.id, [...(dePersona.get(p.id) ?? []), modulos[i]]);
    });
    for (const o of ocupantes) if (!dePersona.has(o.usuarioId)) dePersona.set(o.usuarioId, []);
    const mapa = new Map<string, string>();
    for (const [id, suyos] of dePersona) {
      const cargo = cargoDePersona(id, puestos, ocupantes, areaDeModulos(suyos));
      if (cargo) mapa.set(id, cargo);
    }
    cargosGuardados = { hasta: Date.now() + 5 * 60_000, mapa };
    return mapa;
  } catch {
    return new Map();
  }
}

/** Cuántos mensajes se traen de una vez; si vinieron todos, hay más viejos para «Ver mensajes anteriores». */
export const MENSAJES_POR_VEZ = 300;

/**
 * Los mensajes de una conversación (los 300 más recientes, del más viejo al más nuevo; con `antesDe`, los 300 anteriores a esa hora) y
 * el resumen de su dropshipper. Con `limite`, solo los más recientes: el refresco de la bandeja trae los últimos 40 y los une a los que ya tiene.
 */
export async function cargarConversacion(
  supabase: SupabaseClient,
  id: string,
  dropshipperId: string | null,
  antesDe?: string,
  limite = MENSAJES_POR_VEZ,
  /** Para quien tiene solo Atención (`pierdeLoBorrado`): los mensajes eliminados en WhatsApp y lo anterior al borrado del chat no salen. Sin pedirlo, sale todo, con su marca. */
  sinBorrados = false,
): Promise<{ mensajes: MensajeVista[]; hayAnteriores: boolean; dropshipper: ResumenDropshipper | null }> {
  let consulta = supabase
    .from("whatsapp_mensajes")
    .select("id, direccion, tipo, texto, media_id, media_nombre, estado, error, autor_id, autor_nombre, momento, wa_id")
    .eq("conversacion_id", id);
  if (antesDe) consulta = consulta.lt("momento", antesDe);
  const [mensajesR, dsR, casosR, eliminadosR] = await Promise.all([
    consulta.order("momento", { ascending: false }).limit(limite),
    dropshipperId
      ? supabase.from("dropshippers").select("id, nombre, codigo, estado, tiendas, tienda, dropshipper_cuentas(plataformas(nombre), paises(codigo))").eq("id", dropshipperId).maybeSingle()
      : Promise.resolve({ data: null }),
    dropshipperId
      ? supabase.from("casos_dropshipper").select("numero, titulo, prioridad").eq("dropshipper_id", dropshipperId).neq("estado", "resuelto").order("abierto_en", { ascending: false }).limit(5)
      : Promise.resolve({ data: null }),
    // Los que su autor borró «para todos» en WhatsApp (migración 0171): se muestran con su marca. Sin la columna, ninguno.
    supabase.from("whatsapp_mensajes").select("id").eq("conversacion_id", id).not("eliminado_en_whatsapp_en", "is", null),
  ]);
  const [ocultos, pendientes, reaccionesR, editadosR, transcritosR] = await Promise.all([
    mensajesOcultos(supabase, id),
    borradosPendientes(supabase),
    // A qué mensaje va cada reacción (migración 0186), aparte: sin la columna la conversación se carga igual.
    supabase.from("whatsapp_mensajes").select("id, reaccion_a").eq("conversacion_id", id).eq("tipo", "reaccion").not("reaccion_a", "is", null),
    // Los que su autor editó en WhatsApp (migración 0191), aparte: sin la columna ninguno sale marcado.
    supabase.from("whatsapp_mensajes").select("id").eq("conversacion_id", id).not("editado_en", "is", null),
    // Los audios ya transcritos (migración 0200), aparte: sin la columna ninguno sale con texto.
    supabase.from("whatsapp_mensajes").select("id, transcripcion").eq("conversacion_id", id).eq("tipo", "audio").not("transcripcion", "is", null),
  ]);
  const transcripciones = new Map((transcritosR.error ? [] : (transcritosR.data ?? [])).map((x) => [x.id as string, x.transcripcion as string]));
  const editados = new Set((editadosR.error ? [] : (editadosR.data ?? [])).map((x) => x.id as string));
  const reaccionA = new Map((reaccionesR.error ? [] : (reaccionesR.data ?? [])).map((x) => [x.id as string, x.reaccion_a as string]));
  const eliminados = new Set((eliminadosR.error ? [] : (eliminadosR.data ?? [])).map((x) => x.id as string));
  const traidos = mensajesR.data ?? [];
  const corteBorrado = sinBorrados ? await corteDeBorradoEnApp(supabase, id) : null;
  const autores = [...new Set(traidos.map((m) => m.autor_id as string | null).filter((x): x is string => !!x))];
  const [cargos, fotosR] = autores.length
    ? await Promise.all([cargosDelEquipo(supabase), supabase.from("perfiles").select("id, avatar_url").in("id", autores)])
    : [new Map<string, string>(), { data: [] as { id: string; avatar_url: string | null }[] }];
  const fotos = new Map((fotosR.data ?? []).map((p) => [p.id as string, (p.avatar_url as string | null) ?? null]));
  const mensajes: MensajeVista[] = traidos
    .filter((m) => !ocultos.has(m.id as string) && (!sinBorrados || mensajeVisibleParaAtencion({ id: m.id as string, momento: m.momento as string }, eliminados, corteBorrado)))
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
      autorCargo: (m.autor_id && cargos.get(m.autor_id as string)) || null,
      autorFoto: (m.autor_id && fotos.get(m.autor_id as string)) || null,
      momento: m.momento as string,
      importado: String(m.wa_id ?? "").startsWith("import:"),
      eliminadoEnWhatsapp: eliminados.has(m.id as string),
      borradoPendiente: pendientes.mensajes.has(m.id as string),
      waId: (m.wa_id as string | null) ?? null,
      reaccionA: reaccionA.get(m.id as string) ?? null,
      editado: editados.has(m.id as string),
      transcripcion: transcripciones.get(m.id as string) ?? null,
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
  return { mensajes, hayAnteriores: traidos.length === limite, dropshipper };
}
