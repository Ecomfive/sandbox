// Mejora 34: la bodega «Dropi» del WMS sigue sola el stock que muestra Dropi. Cada lectura de «Mis productos» (la tarea de las
// 7:00 y «Actualizar datos») deja en el WMS un ajuste con origen `sync_dropi` por cada producto cuyo stock cambió, así el
// inventario baja con las ventas de Dropi sin cargarlo a mano. Es la única forma permitida de mover una bodega externa
// (`wms_registrar_movimiento` rechaza cualquier otro origen). Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PublicacionStock {
  skuId: string;
  dropiIds: string[];
}

/** Lo que Dropi dice que hay de cada producto simple: la suma de sus IDs (cada ID una vez), público + privado. */
export function objetivoPorProducto(pubs: PublicacionStock[], stockPorId: Map<string, number>): Map<string, number> {
  const ids = new Map<string, Set<string>>();
  for (const p of pubs) {
    const set = ids.get(p.skuId) ?? new Set<string>();
    for (const id of p.dropiIds) if (stockPorId.has(id)) set.add(id);
    ids.set(p.skuId, set);
  }
  const objetivo = new Map<string, number>();
  for (const [sku, set] of ids) {
    if (!set.size) continue; // ninguno de sus IDs vino en la lectura: no se sabe, no se toca
    objetivo.set(sku, [...set].reduce((s, id) => s + (stockPorId.get(id) ?? 0), 0));
  }
  return objetivo;
}

/** Cuánto hay que ajustar cada producto para que el WMS diga lo mismo que Dropi (solo los que cambian). */
export function ajustesDropi(objetivo: Map<string, number>, actual: Map<string, number>): { skuId: string; delta: number }[] {
  const r: { skuId: string; delta: number }[] = [];
  for (const [skuId, n] of objetivo) {
    const delta = Math.round(n) - Math.round(actual.get(skuId) ?? 0);
    if (delta !== 0) r.push({ skuId, delta });
  }
  return r;
}

const separarIds = (t: string | null) =>
  (t ?? "")
    .split(/[^0-9]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export interface ResultadoSyncDropi {
  ajustados: number;
  sinCambio: number;
  omitidos: number;
  aviso?: string;
}

/** Iguala la bodega «Dropi» del país al stock leído de Dropi. Nunca lanza: lo que no se pudo queda en `omitidos` y `aviso`. */
export async function sincronizarStockDropiWms(supabase: SupabaseClient, paisId: string): Promise<ResultadoSyncDropi> {
  const bodega = await supabase.from("wms_bodegas").select("id").eq("pais_id", paisId).eq("codigo", "dropi").maybeSingle();
  if (bodega.error || !bodega.data) return { ajustados: 0, sinCambio: 0, omitidos: 0, aviso: "El país no tiene la bodega «Dropi» en el WMS." };
  const bodegaId = bodega.data.id as string;

  const [pubs, leidos] = await Promise.all([
    supabase.from("dropi_publicaciones").select("dropi_id, sku_maestro_id, skus_maestros(tipo)").eq("pais_id", paisId).not("sku_maestro_id", "is", null).not("dropi_id", "is", null).limit(5000),
    supabase.from("dropi_productos_proveedor").select("dropi_producto_id, stock, stock_privado").eq("pais_id", paisId).limit(5000),
  ]);
  if (pubs.error || leidos.error) return { ajustados: 0, sinCambio: 0, omitidos: 0, aviso: (pubs.error ?? leidos.error)?.message };

  const stockPorId = new Map<string, number>();
  for (const l of leidos.data ?? []) stockPorId.set(String(l.dropi_producto_id), (Number(l.stock) || 0) + (Number(l.stock_privado) || 0));

  // Un compuesto no guarda stock (se calcula de sus componentes): solo los simples.
  const lista: PublicacionStock[] = [];
  for (const p of (pubs.data ?? []) as { dropi_id: string; sku_maestro_id: string; skus_maestros: { tipo: string } | { tipo: string }[] | null }[]) {
    const prod = Array.isArray(p.skus_maestros) ? p.skus_maestros[0] : p.skus_maestros;
    if (prod?.tipo === "combo") continue;
    lista.push({ skuId: p.sku_maestro_id, dropiIds: separarIds(p.dropi_id) });
  }
  const objetivo = objetivoPorProducto(lista, stockPorId);
  if (!objetivo.size) return { ajustados: 0, sinCambio: 0, omitidos: 0 };

  const actualR = await supabase.from("wms_stock").select("sku_maestro_id, fisico").eq("bodega_id", bodegaId).in("sku_maestro_id", [...objetivo.keys()]);
  if (actualR.error) return { ajustados: 0, sinCambio: 0, omitidos: 0, aviso: actualR.error.message };
  const actual = new Map((actualR.data ?? []).map((s) => [s.sku_maestro_id as string, Number(s.fisico) || 0]));
  const ajustes = ajustesDropi(objetivo, actual);

  let ajustados = 0;
  let omitidos = 0;
  let primerError: string | undefined;
  for (const a of ajustes) {
    const { error } = await supabase.rpc("wms_registrar_movimiento", {
      p_sku: a.skuId,
      p_bodega: bodegaId,
      p_tipo: "ajuste",
      p_cantidad: a.delta,
      p_origen: "sync_dropi",
      p_referencia: "Lectura de Dropi",
      p_motivo: "Igualar al stock que muestra Dropi",
    });
    if (error) {
      omitidos++; // un producto en Test o con vencimiento (pide lote) no se mueve así
      primerError ??= error.message;
    } else ajustados++;
  }
  return { ajustados, sinCambio: objetivo.size - ajustes.length, omitidos, ...(primerError ? { aviso: primerError } : {}) };
}
