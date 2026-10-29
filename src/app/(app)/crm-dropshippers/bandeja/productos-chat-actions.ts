"use server";

import type { EtapaCotizacion } from "@/lib/compras/en-camino";
import { productosMencionados } from "@/lib/crm/productos-chat";
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
  /** Sin la migración 0179 no se pueden fijar productos (las sugerencias salen igual). */
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

/**
 * Los productos de la ficha del chat: los fijados y los que el dropshipper nombra en sus últimos mensajes, cada uno con lo que viene en
 * camino a su país y cuándo llega. Solo unidades y fechas, sin costos; respeta el alcance de Compras de la persona.
 */
export async function productosDelChat(conversacionId: string): Promise<ProductosDelChat | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, conversacionId, u);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };

  const [pais, fijadosR, mensajesR] = await Promise.all([
    paisDelChat(supabase, c.telefono, c.dropshipperId),
    supabase.from(TABLA).select("sku_id, creado_en").eq("conversacion_id", conversacionId).order("creado_en"),
    supabase.from("whatsapp_mensajes").select("texto").eq("conversacion_id", conversacionId).eq("direccion", "entrante").not("texto", "is", null).order("momento", { ascending: false }).limit(40),
  ]);
  const sePuedeFijar = !fijadosR.error;
  const fijadosIds = (fijadosR.data ?? []).map((f) => f.sku_id as string);
  const texto = (mensajesR.data ?? []).map((m) => m.texto as string).join("\n");

  let catalogo: FilaSku[] = [];
  try {
    catalogo = texto.trim() ? await traerTodasLasFilas<FilaSku>((d, h) => productosBase(supabase).order("id").range(d, h)) : [];
  } catch {
    // Sin el catálogo no hay sugerencias: los fijados salen igual.
  }
  const fijados: FilaSku[] = fijadosIds.length ? (((await supabase.from("skus_maestros").select("id, codigo, nombre, foto_url").in("id", fijadosIds)).data ?? []) as FilaSku[]) : [];
  const fijadosEnOrden = fijadosIds.map((id) => fijados.find((f) => f.id === id)).filter((f): f is FilaSku => !!f);
  const sugeridos = productosMencionados(texto, catalogo).filter((p) => !fijadosIds.includes(p.id));
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
  if (r.error) return { error: /does not exist|schema cache/i.test(r.error.message) ? "Falta correr la migración 0179 en la base." : "No se pudo guardar." };
  return { ok: true };
}
