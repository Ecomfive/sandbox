// Anuncios Meta › por qué no se entrega un producto: lo que toca la base (24 nov 2026, pedido de Alcides). Junta, de TODO el sistema, lo que se sabe de los pedidos de un producto: el pedido (pago, transportadora, etiquetas, motivos), el
// cliente (provincia), la guía de Servientrega (última novedad y visitas sin entregar), el despacho de Monday (causa de rechazo y lo que anotan los asesores), el historial de confirmación y, a fondo, las conversaciones de WhatsApp de los pedidos
// devueltos (que la IA lee, sin teléfonos ni correos). El análisis es de `investigacion-entrega.ts`. Solo lee; nunca escribe en los pedidos, ni en Meta, ni le escribe a ningún cliente.

import { hayAlgoEnMarcha } from "./en-marcha";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conversacionParaJuez } from "@/lib/confirmacion-ia/chat-previo";
import { pedirIAEn, proveedoresConectados, type ProveedorIA } from "@/lib/publicaciones/ia/proveedor";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { leerChat } from "@/lib/tienda/chat-tienda-datos";
import { mismaTiendaUnidad, zonaDeEtiquetas } from "@/lib/tienda/ordenes-finanzas";
import type { AnalisisHistorico, FilaEntrega } from "./historico";
import { claveDeInvestigaciones, concluir, leerConversacionesClasificadas, leerValorInvestigaciones, pedidoConversaciones, type EstadoOrden, type InvestigacionesGuardadas, type InvestigacionProducto, type OrdenInv, type RazonChat } from "./investigacion-entrega";

export const DIAS_INVESTIGADOS = 90;
const restar = (fecha: string, n: number) => new Date(new Date(`${fecha}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
const trozos = <T>(l: T[], n: number): T[][] => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));
const uno = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Lo que cada tabla guarda de un pedido, juntado por el id del pedido. */
async function porPedido<T extends Record<string, unknown>>(supabase: SupabaseClient, ids: string[], leer: (parte: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (const parte of trozos(ids, 150)) {
    const { data, error } = await leer(parte);
    if (!error && data) out.push(...data);
  }
  return out;
}

export interface OpcionesInvestigacion {
  paisId: string;
  clave: string;
  producto: string;
  /** El nombre del producto en la tienda (el de las líneas de los pedidos). */
  productoEnTienda: string;
  /** Los nombres de las tiendas (unidades) cuyos pedidos se miran. */
  tiendas: string[];
  hoy: string;
  cpa: number | null;
  dias?: number;
  /** Leer también las conversaciones de WhatsApp de los pedidos devueltos y pedirle a la IA el porqué. */
  aFondo?: { proveedor: ProveedorIA; quien: { id: string; nombre: string | null; email: string }; maxChats?: number };
}

/** Investiga por qué un producto no se entrega. `aviso` dice, en palabras, lo que no se pudo mirar (una tienda sin chat conectado, pocas conversaciones…). Nunca lanza. */
export async function investigarProducto(supabase: SupabaseClient, o: OpcionesInvestigacion): Promise<{ investigacion: InvestigacionProducto; aviso?: string } | { error: string }> {
  try {
    const dias = o.dias ?? DIAS_INVESTIGADOS;
    const desde = restar(o.hoy, dias);
    const { data: unidadesF } = await supabase.from("fin_unidades").select("id, nombre");
    const buscadas = o.tiendas.map((t) => t.trim().toLowerCase());
    const unidades = (unidadesF ?? []).filter((u) => buscadas.includes(String(u.nombre ?? "").trim().toLowerCase())).map((u) => ({ id: u.id as string, nombre: String(u.nombre) }));
    if (!unidades.length) return { error: "No se encontró la tienda de las cuentas en los pedidos (anótala en Cuentas › Tienda)." };
    const idsUnidad = unidades.map((u) => u.id);
    const nombreUnidad = new Map(unidades.map((u) => [u.id, u.nombre]));

    const lineas = await traerTodasLasFilas<Record<string, unknown>>((a, b) =>
      supabase
        .from("ven_orden_lineas")
        .select("orden_id, linea, cantidad, es_servicio, ven_ordenes!inner(id, numero, fecha, estado_entrega, total, forma_pago_entrega, metodo_pago, transportista, etiquetas, motivo_fallo, motivo_cancelacion, resultado_courier, unidad_id)")
        .eq("producto", o.productoEnTienda)
        .in("ven_ordenes.unidad_id", idsUnidad)
        .gte("ven_ordenes.fecha", desde)
        .order("orden_id")
        .order("linea")
        .range(a, b),
    );
    const base = new Map<string, { o: Record<string, unknown>; unidades: number }>();
    for (const l of lineas) {
      if (l.es_servicio === true) continue;
      const ord = uno(l.ven_ordenes as Record<string, unknown> | Record<string, unknown>[] | null);
      if (!ord) continue;
      const id = String(l.orden_id);
      const e = base.get(id) ?? { o: ord, unidades: 0 };
      e.unidades += Math.max(1, Number(l.cantidad ?? 1) || 1);
      base.set(id, e);
    }
    const ids = [...base.keys()];
    if (!ids.length) return { error: `No hay pedidos de «${o.productoEnTienda}» en los últimos ${dias} días.` };

    // Cómo le va a toda la tienda en el mismo periodo: para saber si el problema es del producto o de todos.
    const contar = async (estado: string) => {
      const { count } = await supabase.from("ven_ordenes").select("id", { count: "exact", head: true }).in("unidad_id", idsUnidad).eq("estado_entrega", estado).gte("fecha", desde);
      return count ?? 0;
    };
    const [tiendaEnt, tiendaDev] = await Promise.all([contar("entregada"), contar("devuelta")]);
    const tiendaEntrega = tiendaEnt + tiendaDev >= 30 ? tiendaEnt / (tiendaEnt + tiendaDev) : null;

    const [clientes, otras, guias, monday, eventos] = await Promise.all([
      porPedido(supabase, ids, (p) => supabase.from("ven_ordenes_clientes").select("orden_id, provincia, telefono").in("orden_id", p)),
      porPedido(supabase, ids, (p) => supabase.from("ven_orden_lineas").select("orden_id, producto, es_servicio").in("orden_id", p)),
      porPedido(supabase, ids, (p) => supabase.from("tienda_guias").select("orden_id, estado_grupo, ultimo_motivo, visitas_sin_entregar").in("orden_id", p)),
      porPedido(supabase, ids, (p) => supabase.from("mon_despachos").select("orden_id, causa_rechazo, observaciones_asesores").in("orden_id", p)).then((r) => r),
      porPedido(supabase, ids, (p) => supabase.from("ven_orden_eventos").select("orden_id, fase_despues, detalle").in("tipo", ["fase", "etiqueta"]).in("orden_id", p)),
    ]);
    const clientePor = new Map(clientes.map((c) => [String(c.orden_id), c]));
    const otrosPor = new Set(otras.filter((l) => l.es_servicio !== true && l.producto !== o.productoEnTienda).map((l) => String(l.orden_id)));
    const guiaPor = new Map(guias.map((g) => [String(g.orden_id), g]));
    const mondayPor = new Map(monday.map((m) => [String(m.orden_id), m]));
    const conHistorial = new Set(eventos.map((e) => String(e.orden_id)));
    const confirmadas = new Set(eventos.filter((e) => e.fase_despues === "confirmada" || /confirmad/i.test(String(e.detalle ?? ""))).map((e) => String(e.orden_id)));

    const ordenes: OrdenInv[] = [];
    const telefonos = new Map<string, { telefono: string; unidadId: string }>();
    for (const [id, { o: ord, unidades: n }] of base) {
      const cli = clientePor.get(id);
      const g = guiaPor.get(id);
      const m = mondayPor.get(id);
      const zona = zonaDeEtiquetas(texto(ord.etiquetas));
      const motivos = [texto(ord.motivo_fallo), texto(ord.motivo_cancelacion), texto(ord.resultado_courier), g && g.estado_grupo !== "entregado" ? texto(g.ultimo_motivo) : null, texto(m?.causa_rechazo), texto(m?.observaciones_asesores)].filter((x): x is string => x !== null);
      ordenes.push({
        numero: String(ord.numero),
        fecha: String(ord.fecha),
        estado: String(ord.estado_entrega) as EstadoOrden,
        total: Number(ord.total ?? 0) || 0,
        unidades: n,
        conOtros: otrosPor.has(id),
        pago: texto(ord.forma_pago_entrega) ?? texto(ord.metodo_pago),
        courier: texto(ord.transportista),
        provincia: texto(cli?.provincia),
        zona: zona === "Ciudad" ? "ciudad" : zona === "Interior" ? "interior" : null,
        confirmada: conHistorial.has(id) ? confirmadas.has(id) : null,
        visitas: Number(g?.visitas_sin_entregar ?? 0) || 0,
        motivos,
      });
      const tel = texto(cli?.telefono);
      if (tel && ord.estado_entrega === "devuelta") telefonos.set(String(ord.numero), { telefono: tel, unidadId: String(ord.unidad_id) });
    }

    // A fondo: las conversaciones de WhatsApp de los últimos pedidos devueltos, leídas por la IA.
    let conversaciones: InvestigacionProducto["conversaciones"] = null;
    let aviso: string | undefined;
    if (o.aFondo) {
      const r = await leerConversaciones(supabase, { producto: o.producto, hoy: o.hoy, telefonos, nombreUnidad, ordenes, ...o.aFondo });
      conversaciones = r.conversaciones;
      aviso = r.aviso;
    }

    const c = concluir({ ordenes, tiendaEntrega, cpa: o.cpa, conversaciones });
    const investigacion: InvestigacionProducto = {
      clave: o.clave,
      producto: o.producto,
      productoEnTienda: o.productoEnTienda,
      generadaEn: new Date().toISOString(),
      dias,
      tiendas: unidades.map((u) => u.nombre),
      resumen: c.resumen,
      tiendaEntrega,
      grupos: c.grupos.slice(0, 24),
      razones: c.razones.razones,
      conMotivo: c.razones.conMotivo,
      sinMotivo: c.razones.sinMotivo,
      conversaciones,
      hallazgos: c.hallazgos,
      costo: c.costo,
    };
    return { investigacion, aviso };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo investigar." };
  }
}

async function leerConversaciones(
  supabase: SupabaseClient,
  o: { producto: string; hoy: string; telefonos: Map<string, { telefono: string; unidadId: string }>; nombreUnidad: Map<string, string>; ordenes: OrdenInv[]; proveedor: ProveedorIA; quien: { id: string; nombre: string | null; email: string }; maxChats?: number },
): Promise<{ conversaciones: InvestigacionProducto["conversaciones"]; aviso?: string }> {
  const max = o.maxChats ?? 12;
  // Los devueltos más recientes que tienen teléfono.
  const recientes = o.ordenes.filter((x) => x.estado === "devuelta" && o.telefonos.has(x.numero)).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, max);
  if (!recientes.length) return { conversaciones: null, aviso: "Ningún pedido devuelto tiene teléfono guardado para leer su conversación." };
  const { data: tiendasF } = await supabase.from("tiendas").select("id, nombre");
  const tiendaDe = (unidadId: string): string | null => {
    const nombre = o.nombreUnidad.get(unidadId) ?? "";
    return (tiendasF ?? []).find((t) => mismaTiendaUnidad(String(t.nombre ?? ""), nombre))?.id as string | null ?? null;
  };
  const leidas: { numero: string; texto: string }[] = [];
  let sinChat = 0;
  for (const grupo of trozos(recientes, 3)) {
    const rs = await Promise.all(
      grupo.map(async (x) => {
        const t = o.telefonos.get(x.numero)!;
        const tiendaId = tiendaDe(t.unidadId);
        if (!tiendaId) return null;
        const chat = await leerChat(supabase, tiendaId, t.telefono);
        if ("error" in chat || chat.mensajes.length === 0) return null;
        const conv = conversacionParaJuez(chat.mensajes.map((m) => ({ de: m.de, tipo: m.tipo, texto: m.transcripcion ? `${m.texto} ${m.transcripcion}` : m.texto })), 40);
        return conv ? { numero: x.numero, texto: conv } : null;
      }),
    );
    for (const r of rs) {
      if (r) leidas.push(r);
      else sinChat++;
    }
  }
  if (!leidas.length) return { conversaciones: null, aviso: "No se pudo leer ninguna conversación (¿la tienda tiene iComfly conectado?)." };
  const ped = pedidoConversaciones(o.producto, leidas);
  const r = await pedirIAEn(o.proveedor, { ...ped, imagenes: [] }, { operacion: "meta_investigacion_chats", modulo: "anuncios-meta", usuario: o.quien, referencia: `Investigación · ${o.producto}`.slice(0, 120) }, "analisis");
  if ("error" in r) return { conversaciones: null, aviso: `No se pudo leer lo que dicen las conversaciones: ${r.error}` };
  const clasificadas = leerConversacionesClasificadas(r.texto, leidas.map((l) => l.numero));
  if (!clasificadas.length) return { conversaciones: null, aviso: "La IA no devolvió una lectura que sirva de las conversaciones." };
  const cuentas = new Map<RazonChat, number>();
  for (const c of clasificadas) cuentas.set(c.razon, (cuentas.get(c.razon) ?? 0) + 1);
  return {
    conversaciones: {
      leidas: clasificadas.length,
      razones: [...cuentas].map(([razon, cuantas]) => ({ razon, cuantas })).sort((a, b) => b.cuantas - a.cuantas),
      ejemplos: clasificadas.filter((c) => c.razon !== "sin_informacion").slice(0, 8),
      generadaEn: new Date().toISOString(),
    },
    aviso: sinChat ? `${sinChat} conversaciones no se pudieron leer.` : undefined,
  };
}

// ───────────────────────── Guardado y problemas del historial ─────────────────────────

const MAX_GUARDADAS = 8;
const HORAS_VIGENTE = 20;
const DIAS_CONVERSACIONES_VIGENTES = 14;

export async function leerInvestigaciones(supabase: SupabaseClient, paisId: string): Promise<InvestigacionesGuardadas | null> {
  try {
    const { data, error } = await supabase.from("meta_ajustes").select("valor").eq("clave", claveDeInvestigaciones(paisId)).maybeSingle();
    return error ? null : leerValorInvestigaciones(data?.valor);
  } catch {
    return null;
  }
}

export async function guardarInvestigacion(supabase: SupabaseClient, paisId: string, nueva: InvestigacionProducto, quien: string): Promise<void> {
  const previas = (await leerInvestigaciones(supabase, paisId))?.items ?? [];
  const items = [nueva, ...previas.filter((i) => i.clave !== nueva.clave)].slice(0, MAX_GUARDADAS);
  await supabase.from("meta_ajustes").upsert({ clave: claveDeInvestigaciones(paisId), valor: { generadoEn: new Date().toISOString(), items }, actualizado_por_nombre: quien, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
}

/** Los productos que venden pero no entregan: los que más gastaron con un veredicto de «vende pero no entrega» o una entrega bien por debajo del promedio. */
export function productosConProblemaDeEntrega(a: AnalisisHistorico, max = 3): FilaEntrega[] {
  const promedio = a.resumen.tasaEntrega;
  return a.entrega
    // Solo lo que sigue anunciándose: de un producto apagado no hay nada que decidir.
    .filter((f) => !hayAlgoEnMarcha(a.enMarcha) || a.enMarcha.productos.includes(f.clave))
    .filter((f) => f.enTienda && (f.veredicto === "vende_pero_no_entrega" || (f.tasa !== null && promedio !== null && f.tasa < promedio - 0.12 && f.gasto >= 150)))
    .sort((x, y) => y.gasto - x.gasto)
    .slice(0, max);
}

/**
 * Lo que corre cada día con el análisis del historial: investiga (sin leer conversaciones: eso es a pedido) por qué no se entregan los productos con problema y lo guarda. Un producto investigado hace menos de 20 horas no se repite,
 * y lo que ya se leyó de sus conversaciones se conserva dos semanas. Nunca lanza.
 */
export async function investigarProblemasDeEntrega(supabase: SupabaseClient, o: { paisId: string; hoy: string; analisis: AnalisisHistorico; tiendas: string[]; forzar?: boolean }): Promise<InvestigacionProducto[]> {
  try {
    const previas = (await leerInvestigaciones(supabase, o.paisId))?.items ?? [];
    const resultado: InvestigacionProducto[] = [];
    for (const f of productosConProblemaDeEntrega(o.analisis)) {
      const previa = previas.find((i) => i.clave === f.clave);
      if (!o.forzar && previa && (Date.now() - Date.parse(previa.generadaEn)) / 3_600_000 < HORAS_VIGENTE) {
        resultado.push(previa);
        continue;
      }
      const r = await investigarProducto(supabase, { paisId: o.paisId, clave: f.clave, producto: f.nombre, productoEnTienda: f.enTienda!, tiendas: o.tiendas, hoy: o.hoy, cpa: f.cpa });
      if ("error" in r) continue;
      // Las conversaciones leídas antes (a pedido) se conservan mientras sigan vigentes.
      const conv = previa?.conversaciones && (Date.now() - Date.parse(previa.conversaciones.generadaEn)) / 86_400_000 < DIAS_CONVERSACIONES_VIGENTES ? previa.conversaciones : null;
      const inv = conv ? { ...r.investigacion, conversaciones: conv, ...concluirConConversaciones(r.investigacion, conv) } : r.investigacion;
      resultado.push(inv);
      await guardarInvestigacion(supabase, o.paisId, inv, "Sistema");
    }
    return resultado;
  } catch {
    return [];
  }
}

/** Vuelve a armar las causas de una investigación con lo que dijeron las conversaciones (sin tocar la base). */
export function concluirConConversaciones(inv: InvestigacionProducto, conv: NonNullable<InvestigacionProducto["conversaciones"]>): { hallazgos: InvestigacionProducto["hallazgos"] } {
  const c = concluir({ ordenes: [], tiendaEntrega: null, cpa: null, conversaciones: conv });
  const sinConv = inv.hallazgos.filter((h) => h.tipo !== "conversacion");
  return { hallazgos: [...sinConv, ...c.hallazgos.filter((h) => h.tipo === "conversacion")].sort((a, b) => b.fuerza - a.fuerza) };
}

export const proveedorParaInvestigar = (): ProveedorIA | null => {
  const c = proveedoresConectados();
  return c.includes("anthropic") ? "anthropic" : (c[0] ?? null);
};
