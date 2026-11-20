// Anuncios Meta: de lo que contesta la API de Meta (Marketing API) a lo que guardamos. Todo lo que llega es de afuera: se revisa y nada se confía. Lógica pura, con prueba.

import type { Estructura, Puja } from "./nombre";
import type { Resultados } from "./metricas";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown, max = 500): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
export const numeroMeta = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** «act_123», «123» o «act_ 123» → «act_123»; null si no es un número de cuenta. */
export function normalizarActId(v: string): string | null {
  const m = /^(?:act_)?\s*(\d{5,20})$/i.exec(String(v ?? "").trim());
  return m ? `act_${m[1]}` : null;
}

/** Los presupuestos llegan en la unidad menor de la moneda (centavos): «2000» = $20.00. */
export const presupuestoDe = (v: unknown): number | null => {
  const n = numeroMeta(v);
  return n > 0 ? Math.round(n) / 100 : null;
};

/** CBO si el presupuesto está en la campaña; si está en los conjuntos, ABO. */
export const estructuraDe = (c: Obj): Estructura => (numeroMeta(c.daily_budget) > 0 || numeroMeta(c.lifetime_budget) > 0 ? "CBO" : "ABO");

const PUJAS: Record<string, Puja> = {
  LOWEST_COST_WITHOUT_CAP: "sin_tope",
  LOWEST_COST_WITH_BID_CAP: "bid_cap",
  COST_CAP: "cost_cap",
  LOWEST_COST_WITH_MIN_ROAS: "roas_min",
};
export const pujaDe = (bidStrategy: unknown): Puja | null => (typeof bidStrategy === "string" ? (PUJAS[bidStrategy] ?? null) : null);

/** El estado «de verdad» de algo en Meta (`effective_status`), y si está corriendo. */
export const estaActivo = (c: Obj): boolean => (texto(c.effective_status) ?? texto(c.status)) === "ACTIVE";

export interface CampanaMeta {
  metaId: string;
  nombre: string;
  objetivo: string | null;
  estado: string;
  /** Null en una campaña que Meta no dejó leer y que solo se conoce por sus resultados. */
  estructura: Estructura | null;
  puja: Puja | null;
  presupuestoDiario: number | null;
  creadaEn: string | null;
}

export function campanaDe(c: unknown): CampanaMeta | null {
  const o = obj(c);
  const metaId = texto(o.id, 40);
  const nombre = texto(o.name, 300);
  if (!metaId || !nombre) return null;
  return {
    metaId,
    nombre,
    objetivo: texto(o.objective, 60),
    estado: texto(o.effective_status, 40) ?? texto(o.status, 40) ?? "DESCONOCIDO",
    estructura: estructuraDe(o),
    puja: pujaDe(o.bid_strategy),
    presupuestoDiario: presupuestoDe(o.daily_budget),
    creadaEn: texto(o.created_time, 40),
  };
}

export interface ConjuntoMeta {
  metaId: string;
  campanaMetaId: string;
  nombre: string;
  estado: string;
  presupuestoDiario: number | null;
  puja: Puja | null;
}

export function conjuntoDe(c: unknown): ConjuntoMeta | null {
  const o = obj(c);
  const metaId = texto(o.id, 40);
  const campanaMetaId = texto(o.campaign_id, 40);
  const nombre = texto(o.name, 300);
  if (!metaId || !campanaMetaId || !nombre) return null;
  return { metaId, campanaMetaId, nombre, estado: texto(o.effective_status, 40) ?? texto(o.status, 40) ?? "DESCONOCIDO", presupuestoDiario: presupuestoDe(o.daily_budget), puja: pujaDe(o.bid_strategy) };
}

export interface AnuncioMeta {
  metaId: string;
  campanaMetaId: string;
  conjuntoMetaId: string | null;
  nombre: string;
  estado: string;
  videoId: string | null;
  miniatura: string | null;
  copy: string | null;
  titulo: string | null;
  landing: string | null;
}

/** El video, el texto y la landing de un anuncio salen del «creativo» (tiene varias formas según cómo se creó el anuncio). */
export function anuncioDe(a: unknown): AnuncioMeta | null {
  const o = obj(a);
  const metaId = texto(o.id, 40);
  const campanaMetaId = texto(o.campaign_id, 40);
  const nombre = texto(o.name, 300);
  if (!metaId || !campanaMetaId || !nombre) return null;
  const cr = obj(o.creative);
  const historia = obj(cr.object_story_spec);
  const video = obj(historia.video_data);
  const enlace = obj(historia.link_data);
  const llamado = (v: Obj) => texto(obj(obj(v.call_to_action).value).link, 800);
  return {
    metaId,
    campanaMetaId,
    conjuntoMetaId: texto(o.adset_id, 40),
    nombre,
    estado: texto(o.effective_status, 40) ?? texto(o.status, 40) ?? "DESCONOCIDO",
    videoId: texto(cr.video_id, 40) ?? texto(video.video_id, 40),
    miniatura: texto(cr.thumbnail_url, 1000) ?? texto(video.image_url, 1000),
    copy: texto(cr.body, 2000) ?? texto(video.message, 2000) ?? texto(enlace.message, 2000),
    titulo: texto(cr.title, 300) ?? texto(video.title, 300) ?? texto(enlace.name, 300),
    landing: texto(cr.link_url, 800) ?? llamado(video) ?? texto(enlace.link, 800),
  };
}

/** Una lista de «acciones» de Meta ([{ action_type, value }]): el primer tipo de la lista de preferencia que traiga algo (para no contar dos veces la misma compra con nombres distintos). */
export function accion(lista: unknown, tipos: string[]): number {
  const filas = Array.isArray(lista) ? (lista as Obj[]) : [];
  for (const t of tipos) {
    const f = filas.find((x) => x.action_type === t);
    if (f) return numeroMeta(f.value);
  }
  return 0;
}

const COMPRA = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const LANDING = ["landing_page_view", "omni_landing_page_view"];
const CARRITO = ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const PAGO = ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"];

export interface ResultadoDia extends Resultados {
  anuncioMetaId: string;
  fecha: string;
  /** Lo que el propio reporte de resultados dice de su anuncio, conjunto y campaña: sirve para guardar el anuncio aunque Meta no deje leer su detalle. */
  anuncioNombre: string | null;
  conjuntoMetaId: string | null;
  conjuntoNombre: string | null;
  campanaMetaId: string | null;
  campanaNombre: string | null;
}

/** Una fila de «insights» a nivel anuncio y día. */
export function resultadoDiaDe(f: unknown): ResultadoDia | null {
  const o = obj(f);
  const anuncioMetaId = texto(o.ad_id, 40);
  const fecha = texto(o.date_start, 10);
  if (!anuncioMetaId || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  return {
    anuncioMetaId,
    fecha,
    anuncioNombre: texto(o.ad_name, 300),
    conjuntoMetaId: texto(o.adset_id, 40),
    conjuntoNombre: texto(o.adset_name, 300),
    campanaMetaId: texto(o.campaign_id, 40),
    campanaNombre: texto(o.campaign_name, 300),
    gasto: numeroMeta(o.spend),
    impresiones: Math.round(numeroMeta(o.impressions)),
    clics: Math.round(numeroMeta(o.inline_link_clicks)),
    video3s: Math.round(accion(o.actions, ["video_view"])),
    video15s: Math.round(accion(o.video_thruplay_watched_actions, ["video_view"])),
    video25: Math.round(accion(o.video_p25_watched_actions, ["video_view"])),
    video50: Math.round(accion(o.video_p50_watched_actions, ["video_view"])),
    video75: Math.round(accion(o.video_p75_watched_actions, ["video_view"])),
    video95: Math.round(accion(o.video_p95_watched_actions, ["video_view"])),
    vioLanding: Math.round(accion(o.actions, LANDING)),
    carrito: Math.round(accion(o.actions, CARRITO)),
    pago: Math.round(accion(o.actions, PAGO)),
    compras: Math.round(accion(o.actions, COMPRA)),
    valor: accion(o.action_values, COMPRA),
  };
}

export interface ActividadMeta {
  clave: string;
  fecha: string;
  actorId: string | null;
  actorNombre: string | null;
  tipo: string;
  objetoTipo: string | null;
  objetoMetaId: string | null;
  objetoNombre: string | null;
  detalle: string | null;
}

const ESTADOS_EVENTO: Record<string, string> = { ACTIVE: "Activa", PAUSED: "Pausada", ARCHIVED: "Archivada", DELETED: "Eliminada", CAMPAIGN_PAUSED: "Pausada", ADSET_PAUSED: "Pausada" };

const dineroDeEvento = (v: unknown): string | null => {
  const o = obj(v);
  if (o.type !== "payment_amount") return null;
  const n = Number(o.new_value);
  if (!Number.isFinite(n)) return null;
  // Meta da los montos en la unidad menor de la moneda (centavos).
  const moneda = typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency) ? o.currency : "USD";
  const monto = `${moneda === "USD" ? "$" : `${moneda} `}${(n / 100).toFixed(2)}`;
  const tipo = typeof o.additional_value === "string" ? o.additional_value.slice(0, 20) : "";
  return tipo ? `${monto} (${tipo.toLowerCase()})` : monto;
};

/**
 * El detalle de un evento de la actividad en palabras (`extra_data` de Meta llega como JSON): «Presupuesto $50.00 (diario)» o «Estado: Pausada». Lo que no se reconoce (o llegó cortado) devuelve null,
 * para no mostrar JSON en la pantalla.
 */
export function detalleLegible(extra: string | null | undefined): string | null {
  if (!extra) return null;
  const t = extra.trim();
  if (!t.startsWith("{")) return t.slice(0, 200);
  let o: Record<string, unknown>;
  try {
    o = obj(JSON.parse(t));
  } catch {
    return null;
  }
  const nuevo = o.new_value;
  const antes = o.old_value;
  const dinero = dineroDeEvento(nuevo);
  if (dinero) {
    const d0 = dineroDeEvento(antes);
    return `Presupuesto ${dinero}${d0 ? `, antes ${d0}` : ""}`;
  }
  if (typeof nuevo === "string" && ESTADOS_EVENTO[nuevo]) return `Estado: ${ESTADOS_EVENTO[nuevo]}${typeof antes === "string" && ESTADOS_EVENTO[antes] ? `, antes ${ESTADOS_EVENTO[antes]}` : ""}`;
  if (typeof nuevo === "string" && nuevo.length > 0 && nuevo.length <= 120 && !nuevo.startsWith("{")) return `Ahora: ${nuevo}`;
  return null;
}

/** Un evento del registro de actividad de la cuenta (quién creó o cambió qué). La clave no se repite: la misma fila leída dos veces no se duplica. */
export function actividadDe(a: unknown): ActividadMeta | null {
  const o = obj(a);
  const fecha = texto(o.event_time, 40);
  const tipo = texto(o.event_type, 80);
  if (!fecha || !tipo) return null;
  const objetoMetaId = texto(o.object_id, 40);
  const actorId = texto(o.actor_id, 40);
  const extra = texto(o.extra_data, 400);
  return { clave: `${fecha}|${tipo}|${objetoMetaId ?? ""}|${actorId ?? ""}|${(extra ?? "").slice(0, 60)}`, fecha, actorId, actorNombre: texto(o.actor_name, 120), tipo, objetoTipo: texto(o.object_type, 40), objetoMetaId, objetoNombre: texto(o.object_name, 300), detalle: detalleLegible(extra) };
}

/** Si la actividad es la creación de una campaña (de ahí sale «quién la montó»). */
export const esCreacionDeCampana = (a: Pick<ActividadMeta, "tipo" | "objetoTipo">): boolean => a.tipo === "create_campaign_group" || a.tipo === "create_campaign";

/** El mensaje de un error de la API de Meta, en español. */
export function mensajeDeErrorMeta(estado: number, cuerpo: unknown): string {
  const e = obj(obj(cuerpo).error);
  const codigo = numeroMeta(e.code);
  const texto = typeof e.message === "string" ? e.message.slice(0, 200) : "";
  if (codigo === 190 || estado === 401) return "El acceso a Meta venció o se revocó: hay que generar otro (ver «Cuentas»).";
  if (codigo === 200 || codigo === 10 || codigo === 294) return "Meta no deja leer esa cuenta con este acceso: falta darle permiso sobre la cuenta publicitaria al usuario del sistema.";
  if (codigo === 4 || codigo === 17 || codigo === 32 || codigo === 613 || codigo === 80000 || codigo === 80004) return "Meta pidió esperar (demasiadas consultas). Se vuelve a intentar en la próxima lectura.";
  return texto ? `Meta respondió: ${texto}` : `Meta respondió con el error ${estado}.`;
}
