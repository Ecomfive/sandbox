// Compras › avisos de llegada: lo que toca la base (16 nov 2026, pedido de Hernán). Solo servidor. La lógica pura (qué etapa avisa, textos, totales) está en `llegadas-avisos.ts`.
// Nunca lanza: pasar una compra de etapa ya se guardó y un aviso que falla no debe deshacerlo.

import type { SupabaseClient } from "@supabase/supabase-js";
import { armarAviso, llegadaDeEtapa, unaPorCompra, type EventoAviso, type FilaLlegada, type TipoLlegada } from "./llegadas-avisos";

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
export const numeroOrden = (n: unknown) => (num(n) == null ? "OC" : `OC-${String(num(n)).padStart(4, "0")}`);

export const RUTA_LLEGADA = "/llegadas";

/** Quiénes reciben ese aviso (ids de perfil). Sin la migración 0304, nadie. */
export async function destinatariosDe(supabase: SupabaseClient, evento: EventoAviso): Promise<string[]> {
  const { data, error } = await supabase.from("compras_avisos_destinatarios").select("perfil_id, perfiles(activo)").eq("evento", evento);
  if (error) return [];
  return ((data ?? []) as unknown as { perfil_id: string; perfiles: { activo: boolean } | { activo: boolean }[] | null }[])
    .filter((d) => (Array.isArray(d.perfiles) ? d.perfiles[0] : d.perfiles)?.activo !== false)
    .map((d) => d.perfil_id);
}

interface CompraLeida {
  id: string;
  codigo: string | null;
  numero: number | null;
  nombre: string | null;
  etapa: string;
  qty_total: number | null;
  segundo_pago: number | null;
  wms_compra_items: { cantidad_pedida: number | null; creado_en: string; skus_maestros: { codigo: string | null; nombre: string } | { codigo: string | null; nombre: string }[] | null }[] | null;
}

interface ItemLeido {
  compra_id: string;
  pagado_en: string | null;
  monto_pagado: number | string | null;
  pagado_por_nombre: string | null;
  llegada_id?: string;
  creado_en?: string;
}

/** Arma las filas de una lista de compras de llegadas (en ese orden): sus productos, unidades, cajas, etiqueta y lo pagado. */
async function armarFilas(supabase: SupabaseClient, lista: ItemLeido[], conLlegada: boolean): Promise<FilaLlegada[]> {
  if (lista.length === 0) return [];
  const ids = [...new Set(lista.map((i) => i.compra_id))];
  const [{ data: compras }, { data: pedidos }] = await Promise.all([
    supabase.from("wms_compras").select("id, codigo, numero, nombre, etapa, qty_total, segundo_pago, wms_compra_items(cantidad_pedida, creado_en, skus_maestros(codigo, nombre))").in("id", ids),
    supabase.from("proveedor_pedidos").select("compra_id, cajas, etiquetas_rutas").in("compra_id", ids),
  ]);
  const porCompra = new Map(((compras ?? []) as unknown as CompraLeida[]).map((c) => [c.id, c]));
  const cajas = new Map(((pedidos ?? []) as { compra_id: string; cajas: number | null; etiquetas_rutas: string[] | null }[]).map((p) => [p.compra_id, p]));
  return lista.flatMap((i) => {
    const c = porCompra.get(i.compra_id);
    if (!c) return [];
    const lineas = [...(c.wms_compra_items ?? [])].sort((a, b) => a.creado_en.localeCompare(b.creado_en));
    const productos = lineas.flatMap((l) => {
      const s = Array.isArray(l.skus_maestros) ? l.skus_maestros[0] : l.skus_maestros;
      return s ? [{ codigo: s.codigo, nombre: s.nombre }] : [];
    });
    const unidades = num(c.qty_total) ?? (lineas.length ? lineas.reduce((s, l) => s + (num(l.cantidad_pedida) ?? 0), 0) : null);
    const p = cajas.get(c.id);
    return [
      {
        compraId: c.id,
        orden: numeroOrden(c.numero),
        codigo: c.codigo,
        productos: productos.length ? productos : c.nombre ? [{ codigo: null, nombre: c.nombre }] : [],
        unidades,
        cajas: p?.cajas == null ? null : Number(p.cajas),
        etiquetasRutas: (p?.etiquetas_rutas ?? []).map(String),
        segundoPago: num(c.segundo_pago),
        pagadoEn: i.pagado_en,
        montoPagado: num(i.monto_pagado),
        pagadoPor: i.pagado_por_nombre,
        etapa: c.etapa,
        ...(conLlegada ? { llegadaId: i.llegada_id, llegadaEn: i.creado_en } : {}),
      },
    ];
  });
}

/** Las compras de una llegada, con lo que ya se pagó de cada una. El orden es el de la llegada. */
export async function cargarFilasLlegada(supabase: SupabaseClient, llegadaId: string): Promise<FilaLlegada[]> {
  const { data: items } = await supabase
    .from("compras_llegada_items")
    .select("compra_id, pagado_en, monto_pagado, pagado_por_nombre, creado_en")
    .eq("llegada_id", llegadaId)
    .order("creado_en")
    .order("compra_id");
  return armarFilas(supabase, (items ?? []) as ItemLeido[], false);
}

/** Tope de compras que trae «Todas las llegadas» (90 días de llegadas de una operación como la de Ecomfive caben de sobra). */
export const MAX_LLEGADAS_LISTA = 500;

/**
 * Todas las llegadas de un tipo desde un instante (17 nov 2026, pedido de Logística: ver de una vez lo que llegó a puerto, no un aviso por compra): las compras de todas esas llegadas,
 * la más reciente primero y cada compra una vez. Cada fila dice de qué llegada es, para abrirla.
 */
export async function cargarFilasDeLlegadas(supabase: SupabaseClient, tipo: TipoLlegada, desdeIso: string): Promise<FilaLlegada[]> {
  const { data: items } = await supabase
    .from("compras_llegada_items")
    .select("llegada_id, compra_id, pagado_en, monto_pagado, pagado_por_nombre, creado_en, compras_llegadas!inner(tipo)")
    .eq("compras_llegadas.tipo", tipo)
    .gte("creado_en", desdeIso)
    .order("creado_en", { ascending: false })
    .limit(MAX_LLEGADAS_LISTA);
  return unaPorCompra(await armarFilas(supabase, (items ?? []) as unknown as ItemLeido[], true));
}

/**
 * Una o varias compras acaban de pasar a esa etapa: si es Llegada a Puerto o En Bodega, se guarda la llegada (una por acción: un cambio suelto o un lote) y a quien le toca
 * le llega el aviso «Para ti» con su lista. Cualquier otra etapa no hace nada.
 */
export async function avisarLlegada(
  supabase: SupabaseClient,
  d: { etapa: string; compraIds: string[]; autor: { id: string | null; nombre: string | null } },
): Promise<{ llegadaId: string | null }> {
  try {
    const regla = llegadaDeEtapa(d.etapa);
    const ids = [...new Set(d.compraIds)];
    if (!regla || ids.length === 0) return { llegadaId: null };
    // Una compra anulada no llega.
    const { data: vivas } = await supabase.from("wms_compras").select("id").in("id", ids).is("anulada_en", null);
    const ok = ((vivas ?? []) as { id: string }[]).map((c) => c.id);
    if (ok.length === 0) return { llegadaId: null };
    const { data: llegada, error } = await supabase.from("compras_llegadas").insert({ tipo: regla.tipo, creado_por: d.autor.id, creado_por_nombre: d.autor.nombre }).select("id").single();
    if (error || !llegada) return { llegadaId: null };
    const llegadaId = String(llegada.id);
    await supabase.from("compras_llegada_items").insert(ok.map((compra_id) => ({ llegada_id: llegadaId, compra_id })));
    const personas = await destinatariosDe(supabase, regla.evento);
    if (personas.length > 0) {
      const aviso = armarAviso(regla.tipo, await cargarFilasLlegada(supabase, llegadaId));
      await supabase.from("notificaciones_usuario").insert(
        personas.map((usuario_id) => ({
          usuario_id,
          tipo: "llegada",
          titulo: aviso.titulo.slice(0, 200),
          texto: aviso.texto.slice(0, 500),
          href: `${RUTA_LLEGADA}/${llegadaId}`,
          autor_id: d.autor.id,
          autor_nombre: d.autor.nombre ?? "Sistema",
        })),
      );
    }
    return { llegadaId };
  } catch {
    return { llegadaId: null };
  }
}
