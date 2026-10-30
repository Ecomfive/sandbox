import type { SupabaseClient } from "@supabase/supabase-js";
import { MODULO_ATENCION, MODULO_COMERCIAL, MODULO_DIRECCION, type AreaCrm } from "@/lib/crm/areas";
import { armarEquipo, type ChatEquipo, type Equipo, type RespuestaPersona, type TareaEquipo } from "@/lib/crm/equipo";
import { personasConModulos } from "@/lib/whatsapp/personas-crm";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { FilaDireccion } from "./datos-direccion";

export interface DatosEquipo extends Equipo {
  dias: number;
  /** Mediana general de la primera respuesta y cuántas consultas se respondieron en 15 min, del periodo. */
  medianaMin: number | null;
  consultas: number;
  en15: number;
  sinResponder: number;
}

const enPanama = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/**
 * El equipo del panel de Dirección: quienes pueden abrir el CRM con sus respuestas de los últimos `dias` días (`whatsapp_kpis`), sus chats
 * asignados y los que esperan ahora, sus tareas y la cartera que llevan en el país (`clientes`, de la fase 1). No escribe nada.
 */
export async function cargarEquipo(supabase: SupabaseClient, dias: number, clientes: FilaDireccion[]): Promise<DatosEquipo | { error: string }> {
  const ahora = Date.now();
  const desdeIso = new Date(ahora - dias * 86_400_000).toISOString();
  const desde = enPanama(ahora - dias * 86_400_000);
  const [todos, comerciales, direccion, kpis, chats, pendientes, hechas] = await Promise.all([
    personasConModulos(supabase, [MODULO_ATENCION]),
    personasConModulos(supabase, [MODULO_COMERCIAL]),
    personasConModulos(supabase, [MODULO_DIRECCION]),
    supabase.rpc("whatsapp_kpis", { p_desde: desdeIso, p_areas: ["direccion", "comercial", "atencion"] }),
    traerTodasLasFilas<{ area: string; asignada_a: string | null; estado: string; esperando_desde: string | null }>((d, h) =>
      supabase.from("whatsapp_conversaciones").select("area, asignada_a, estado, esperando_desde").is("oculta_en", null).order("id").range(d, h),
    ),
    traerTodasLasFilas<{ responsable_id: string | null; estado: string; vence: string | null; hecha_en: string | null }>((d, h) =>
      supabase.from("tareas_dropshipper").select("responsable_id, estado, vence, hecha_en").eq("estado", "pendiente").order("id").range(d, h),
    ),
    traerTodasLasFilas<{ responsable_id: string | null; estado: string; vence: string | null; hecha_en: string | null }>((d, h) =>
      supabase.from("tareas_dropshipper").select("responsable_id, estado, vence, hecha_en").eq("estado", "hecha").gte("hecha_en", desdeIso).order("id").range(d, h),
    ),
  ]);
  if (kpis.error) return { error: "No se pudieron leer las respuestas de WhatsApp (función whatsapp_kpis)." };
  const esComercial = new Set(comerciales.map((p) => p.id));
  const esDireccion = new Set(direccion.map((p) => p.id));
  const area = (id: string): AreaCrm => (esDireccion.has(id) ? "direccion" : esComercial.has(id) ? "comercial" : "atencion");
  const datos = (kpis.data ?? {}) as { personas?: RespuestaPersona[]; areas?: { consultas: number; sin_responder: number; en_15_min: number; mediana_min: number | null }[] };
  const areas = datos.areas ?? [];
  const consultas = areas.reduce((s, a) => s + Number(a.consultas), 0);
  const respondidas = areas.reduce((s, a) => s + Number(a.consultas) - Number(a.sin_responder), 0);
  // La mediana general, aproximada con la de cada área pesada por sus respondidas (como en KPIs de atención).
  const conMediana = areas.filter((a) => a.mediana_min !== null && Number(a.consultas) - Number(a.sin_responder) > 0);
  const peso = conMediana.reduce((s, a) => s + Number(a.consultas) - Number(a.sin_responder), 0);
  const medianaMin = peso ? conMediana.reduce((s, a) => s + Number(a.mediana_min) * (Number(a.consultas) - Number(a.sin_responder)), 0) / peso : null;

  const equipo = armarEquipo({
    personas: todos.map((p) => ({ id: p.id, nombre: p.nombre, area: area(p.id) })),
    respuestas: datos.personas ?? [],
    chats: chats.map((c): ChatEquipo => ({ area: c.area, asignadaA: c.asignada_a, abierta: c.estado === "abierta", esperandoDesde: c.esperando_desde })),
    tareas: [...pendientes, ...hechas].map((t): TareaEquipo => ({ responsableId: t.responsable_id, estado: t.estado, vence: t.vence, hechaEn: t.hecha_en })),
    clientes: clientes.map((c) => ({ responsable: c.responsable, segmento: c.segmento, pedidos30: c.pedidos30, pedidos30Antes: c.pedidos30Antes })),
    ahora,
    hoy: enPanama(ahora),
    desde,
  });
  return {
    ...equipo,
    dias,
    medianaMin,
    consultas,
    en15: areas.reduce((s, a) => s + Number(a.en_15_min), 0),
    sinResponder: consultas - respondidas,
  };
}
