"use server";

import type { EtapaCotizacion } from "@/lib/compras/en-camino";
import { idsDropiEnTexto, productosDeLaConversacion, type MencionEnChat } from "@/lib/crm/productos-chat";
import { normalizarTelefono } from "@/lib/crm/telefono";
import { cargarEnCamino } from "@/lib/publicaciones/en-camino-datos";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

/** Un producto en la ficha del chat, con lo que viene en camino al país del dropshipper (como «En camino» de Gestión de IDs Dropi). */
export interface ProductoDelChat {
  id: string;
  nombre: string;
  codigo: string | null;
  foto: string | null;
  /** Lo fijó alguien en la ficha; si no, es una sugerencia porque el chat lo nombra. */
  fijado: boolean;
  /** Dónde y cuándo se habló de él en el chat por última vez (la frase, el ID de Dropi o el análisis con IA); null si solo está fijado. */
  mencion: MencionEnChat | null;
  enCamino: number;
  /** La llegada más próxima de lo que viene en camino; null si ninguna orden tiene fecha todavía. */
  llegada: string | null;
  sinFecha: number;
  sinEnvio: number;
  /** Lo que todavía se cotiza (01 - Cotizar y 02 - Cotizado): se piensa pedir, aún no viene. */
  cotizando: number;
  etapa: EtapaCotizacion | null;
}

export interface ProductosDelChat {
  pais: { id: string; nombre: string } | null;
  productos: ProductoDelChat[];
  /** Sin la migración 0180 no se pueden fijar productos (las sugerencias salen igual). */
  sePuedeFijar: boolean;
}

type FilaSku = { id: string; codigo: string | null; nombre: string; foto_url: string | null };
const TABLA = "whatsapp_conversacion_productos";
const ES_ID = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
/** Los productos que se ofrecen: los simples (no variantes ni combos) que no están descontinuados. */
const productosBase = (supabase: ReturnType<typeof createServiceClient>) =>
  supabase.from("skus_maestros").select("id, codigo, nombre, foto_url").is("padre_id", null).eq("tipo", "simple").neq("clase", "descontinuado");

/**
 * El país del chat, para saber qué viene en camino: el del dropshipper vinculado (o el de su primera cuenta de Dropi) y, si no está en el
 * CRM, el del prefijo de su número (+507 → Panamá).
 */
async function paisDelChat(supabase: ReturnType<typeof createServiceClient>, telefono: string, dropshipperId: string | null): Promise<{ id: string; nombre: string } | null> {
  const paises = ((await supabase.from("paises").select("id, codigo, nombre")).data ?? []) as { id: string; codigo: string; nombre: string }[];
  if (dropshipperId) {
    const { data } = await supabase.from("dropshippers").select("pais_id, dropshipper_cuentas(pais_id)").eq("id", dropshipperId).maybeSingle();
    const cuentas = (data?.dropshipper_cuentas ?? []) as { pais_id: string | null }[];
    const id = (data?.pais_id as string | null) ?? cuentas.find((c) => c.pais_id)?.pais_id ?? null;
    const p = paises.find((x) => x.id === id);
    if (p) return { id: p.id, nombre: p.nombre };
  }
  const codigo = normalizarTelefono(telefono)?.pais;
  const p = paises.find((x) => x.codigo === codigo);
  return p ? { id: p.id, nombre: p.nombre } : null;
}

/** Cuántos mensajes del chat se leen para saber de qué productos se habló (los más recientes): toda la conversación en la práctica. */
const MENSAJES_A_LEER = 2000;

/** Los mensajes con texto del dropshipper y del equipo, del más nuevo al más viejo, hasta `MENSAJES_A_LEER`. */
async function textosDelChat(supabase: ReturnType<typeof createServiceClient>, conversacionId: string) {
  const filas: { texto: string | null; momento: string; direccion: string }[] = [];
  for (let desde = 0; desde < MENSAJES_A_LEER; desde += 1000) {
    const { data, error } = await supabase
      .from("whatsapp_mensajes")
      .select("texto, momento, direccion")
      .eq("conversacion_id", conversacionId)
      .in("direccion", ["entrante", "saliente"])
      .not("texto", "is", null)
      .order("momento", { ascending: false })
      .range(desde, desde + 999);
    if (error) break;
    filas.push(...((data ?? []) as typeof filas));
    if ((data ?? []).length < 1000) break;
  }
  return filas;
}

/**
 * Los productos de la ficha del chat: los fijados y aquellos de los que se habló en **toda** la conversación (pedido de Hernán, 29 oct 2026:
 * «que cada que pidan algo lo vayas identificando»): por su nombre, por una palabra que dice cuál entre lo que se vende en su país («la
 * creatina»), por el ID de Dropi que se nombró y por lo que encontró «Analizar con IA». Cada uno con lo que viene en camino a su país y
 * cuándo llega. Solo unidades y fechas, sin costos; respeta el alcance de Compras de la persona.
 */
export async function productosDelChat(conversacionId: string): Promise<ProductosDelChat | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };

  const [pais, fijadosR, mensajes, analisisR] = await Promise.all([
    paisDelChat(supabase, c.telefono, c.dropshipperId),
    supabase.from(TABLA).select("sku_id, creado_en").eq("conversacion_id", conversacionId).order("creado_en"),
    textosDelChat(supabase, conversacionId),
    // Lo que encontró «Analizar con IA» (migración 0183); sin la migración o sin análisis, nada.
    supabase.from("whatsapp_actividad").select("dia, productos").eq("conversacion_id", conversacionId).order("dia", { ascending: false }),
  ]);
  const sePuedeFijar = !fijadosR.error;
  const fijadosIds = (fijadosR.data ?? []).map((f) => f.sku_id as string);
  const analisis = analisisR.error ? [] : ((analisisR.data ?? []) as { dia: string; productos: string[] | null }[]).filter((a) => a.productos?.length);

  let catalogo: FilaSku[] = [];
  try {
    catalogo = mensajes.length || analisis.length ? await traerTodasLasFilas<FilaSku>((d, h) => productosBase(supabase).order("id").range(d, h)) : [];
  } catch {
    // Sin el catálogo no hay sugerencias: los fijados salen igual.
  }
  const porId = new Map(catalogo.map((p) => [p.id, p]));

  // Lo que se vende en su país (publicaciones de Dropi sin archivar con su producto): con eso «la creatina» es la de allá.
  let vendidos: FilaSku[] = [];
  if (pais && catalogo.length) {
    try {
      const pubs = await traerTodasLasFilas<{ sku_maestro_id: string }>((d, h) =>
        supabase.from("dropi_publicaciones").select("sku_maestro_id").eq("pais_id", pais.id).not("sku_maestro_id", "is", null).or("estado_publicacion.is.null,estado_publicacion.neq.archivado").order("id").range(d, h),
      );
      vendidos = [...new Set(pubs.map((x) => x.sku_maestro_id))].map((id) => porId.get(id)).filter((p): p is FilaSku => !!p);
    } catch {
      // Sin publicaciones, las palabras sueltas se buscan en todo el catálogo.
    }
  }

  // Los ID de Dropi que se nombran en el chat, con su producto (las publicaciones de su país; sin país, si el ID es de un solo producto).
  const porIdDropi = new Map<string, FilaSku>();
  const ids = [...new Set(mensajes.flatMap((m) => idsDropiEnTexto(m.texto)))].slice(0, 100);
  if (ids.length) {
    let consulta = supabase.from("dropi_publicaciones").select("dropi_id, sku_maestro_id").in("dropi_id", ids).not("sku_maestro_id", "is", null);
    if (pais) consulta = consulta.eq("pais_id", pais.id);
    const { data } = await consulta;
    const filas = (data ?? []) as { dropi_id: string; sku_maestro_id: string }[];
    const faltan = [...new Set(filas.map((f) => f.sku_maestro_id).filter((id) => !porId.has(id)))];
    if (faltan.length) for (const p of ((await supabase.from("skus_maestros").select("id, codigo, nombre, foto_url").in("id", faltan)).data ?? []) as FilaSku[]) porId.set(p.id, p);
    for (const id of ids) {
      const suyos = [...new Set(filas.filter((f) => String(f.dropi_id) === id).map((f) => f.sku_maestro_id))];
      const p = suyos.length === 1 ? porId.get(suyos[0]) : undefined;
      if (p) porIdDropi.set(id, p);
    }
  }

  const detectados = productosDeLaConversacion(mensajes, catalogo, vendidos, porIdDropi);
  // Los productos que encontró el análisis con IA (ya con el nombre del catálogo), si el chat no los nombró de otra forma.
  const porNombre = new Map(catalogo.map((p) => [p.nombre.trim().toLowerCase(), p]));
  for (const a of analisis) {
    for (const nombre of a.productos ?? []) {
      const p = porNombre.get(nombre.trim().toLowerCase());
      if (!p || detectados.length >= 8) continue;
      const ya = detectados.find((d) => d.p.id === p.id);
      if (ya) continue;
      detectados.push({ p, mencion: { como: "analisis", cita: nombre, momento: `${a.dia}T12:00:00Z`, direccion: "entrante", veces: 1 } });
    }
  }
  const mencionDe = new Map(detectados.map((d) => [d.p.id, d.mencion]));

  const fijados: FilaSku[] = fijadosIds.length ? (((await supabase.from("skus_maestros").select("id, codigo, nombre, foto_url").in("id", fijadosIds)).data ?? []) as FilaSku[]) : [];
  const fijadosEnOrden = fijadosIds.map((id) => fijados.find((f) => f.id === id)).filter((f): f is FilaSku => !!f);
  const sugeridos = detectados.map((d) => d.p).filter((p) => !fijadosIds.includes(p.id));
  const lista = [...fijadosEnOrden.map((p) => ({ p, fijado: true })), ...sugeridos.map((p) => ({ p, fijado: false }))];
  if (!lista.length) return { pais, productos: [], sePuedeFijar };

  const { camino, cotizando, etapasCotizando } = pais ? await cargarEnCamino(supabase, pais.id, u) : { camino: new Map(), cotizando: new Map(), etapasCotizando: new Map() };
  return {
    pais,
    sePuedeFijar,
    productos: lista.map(({ p, fijado }) => {
      const v = camino.get(p.id);
      return {
        id: p.id,
        nombre: p.nombre,
        codigo: p.codigo,
        foto: p.foto_url,
        fijado,
        mencion: mencionDe.get(p.id) ?? null,
        enCamino: v?.unidades ?? 0,
        llegada: v?.llegada ?? null,
        sinFecha: v?.sinFecha ?? 0,
        sinEnvio: v?.sinEnvio ?? 0,
        cotizando: cotizando.get(p.id) ?? 0,
        etapa: etapasCotizando.get(p.id) ?? null,
      };
    }),
  };
}

/** «Agregar producto» en la ficha: busca en el catálogo por nombre o código. */
export async function buscarProductosChat(conversacionId: string, consulta: string): Promise<{ productos: { id: string; nombre: string; codigo: string | null }[] } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, conversacionId, u))) return { error: "Esa conversación no existe o no es de tu área." };
  const t = String(consulta ?? "").trim().slice(0, 80);
  if (t.length < 2) return { productos: [] };
  // El texto va como valor de un filtro (nunca armado dentro de un `.or()`) y sus comodines de LIKE se escapan.
  const patron = `%${t.replace(/[\\%_]/g, "\\$&")}%`;
  const [porNombre, porCodigo] = await Promise.all([productosBase(supabase).ilike("nombre", patron).order("nombre").limit(8), productosBase(supabase).ilike("codigo", patron).order("nombre").limit(8)]);
  if (porNombre.error || porCodigo.error) return { error: "No se pudo buscar." };
  const vistos = new Set<string>();
  const productos = [...(porNombre.data ?? []), ...(porCodigo.data ?? [])]
    .filter((p) => !vistos.has(p.id as string) && vistos.add(p.id as string))
    .slice(0, 8)
    .map((p) => ({ id: p.id as string, nombre: p.nombre as string, codigo: (p.codigo as string | null) ?? null }));
  return { productos };
}

/** Fija un producto en la ficha del chat (lo ve todo el equipo cada vez que abre ese chat), o lo quita con `fijar` en false. */
export async function fijarProductoChat(conversacionId: string, skuId: string, fijar: boolean): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!ES_ID(String(skuId))) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, conversacionId, u, true))) return { error: "Ese chat no existe o no puedes escribir en su área." };
  const r = fijar
    ? await supabase.from(TABLA).upsert({ conversacion_id: conversacionId, sku_id: skuId, agregado_por: u.nombre || u.email }, { onConflict: "conversacion_id,sku_id", ignoreDuplicates: true })
    : await supabase.from(TABLA).delete().eq("conversacion_id", conversacionId).eq("sku_id", skuId);
  if (r.error) return { error: /does not exist|schema cache/i.test(r.error.message) ? "Falta correr la migración 0180 en la base." : "No se pudo guardar." };
  return { ok: true };
}
