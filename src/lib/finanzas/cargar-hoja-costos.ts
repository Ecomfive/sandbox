// Lectura de la hoja de Costos de producto (migración 0992): sus filas con el producto, el resumen por producto y la alerta
// de productos con stock en Panamá y sin costo. También el catálogo para calcular el costo de un producto en una fecha
// (Pedidos Dropi, Inventario y Producto). Solo lectura; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { estaCerrado } from "@/lib/nomina/al-libro";
import { hoyPanama } from "@/lib/af4/fecha";
import { COSTOS_ASOCIADOS, calcularFila, cerradaPorCierre, costoEn, productosSinCosto, resumirProductos, type CampoAsociado, type CatalogoCostos, type FilaHoja, type ResumenProducto, type TipoFinanciamiento } from "./hoja-costos";
import { PAIS_HOJA_COSTOS } from "./sincronizar-costos-compras";

export const SIN_MIGRACION_HOJA = "Falta correr la migración 0992 (Costos de producto) en Supabase.";

const COLUMNAS: string =
  "id, sku_maestro_id, compra_id, linea, fecha_llegada, cantidad, costo_unitario, financiamiento, costo_total, costo_final_manual, costo_final_excel, cantidad_pedida, financiamiento_tipo, financiamiento_fijado_en, asoc_nota, origen, estatus, costos_por_nombre, costos_en, creado_en, " +
  COSTOS_ASOCIADOS.map((c) => c.id).join(", ") +
  ", skus_maestros(numero, codigo, nombre)";

const num = (v: unknown) => Number(v ?? 0) || 0;
const uno = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export interface FilaHojaVista extends FilaHoja {
  asociadosUnidad: number;
  pctFinanciamiento: number | null;
  costoCalculado: number;
  costoTotal: number;
  estatus: string | null;
  /** Llegó en o antes del último mes cerrado: solo un administrador la cambia. */
  cerrada: boolean;
  /** Desde cuándo está congelado el financiamiento estimado. */
  financiamientoFijadoEn: string | null;
}

export interface ProductoSinCosto {
  skuId: string;
  numero: number | null;
  sku: string;
  producto: string;
  stock: number;
  /** Viene de la pestaña «Sin compra vinculada» del Excel de la carga inicial. */
  sinCompra: boolean;
}

export interface DatosHojaCostos {
  filas: FilaHojaVista[];
  resumen: Map<string, ResumenProducto>;
  sinCosto: ProductoSinCosto[];
  /** El último mes cerrado («AAAA-MM-01»), si hay. */
  ultimoCerrado: string | null;
}

function aFila(r: Record<string, unknown>, ultimoCerrado: string | null): FilaHojaVista {
  const s = uno(r.skus_maestros as { numero: number | null; codigo: string; nombre: string } | null);
  const asociados = Object.fromEntries(COSTOS_ASOCIADOS.map((c) => [c.id, num(r[c.id])])) as Record<CampoAsociado, number>;
  const base: FilaHoja = {
    id: String(r.id),
    skuId: String(r.sku_maestro_id),
    numero: s?.numero === null || s?.numero === undefined ? null : Number(s.numero),
    sku: s?.codigo ?? "",
    producto: s?.nombre ?? "",
    compraId: (r.compra_id as string | null) ?? null,
    codigoCompra: String(r.linea ?? ""),
    llegada: typeof r.fecha_llegada === "string" ? r.fecha_llegada.slice(0, 10) : null,
    cantidad: num(r.cantidad),
    costoUnitario: num(r.costo_unitario),
    asociados,
    nota: (r.asoc_nota as string | null) ?? null,
    financiamiento: num(r.financiamiento),
    costoFinalManual: r.costo_final_manual === null || r.costo_final_manual === undefined ? null : num(r.costo_final_manual),
    costoFinalExcel: r.costo_final_excel === true,
    cantidadPedida: r.cantidad_pedida === null || r.cantidad_pedida === undefined ? null : num(r.cantidad_pedida),
    financiamientoTipo: (r.financiamiento_tipo as TipoFinanciamiento | null) ?? null,
    origen: String(r.origen ?? ""),
    editadoPor: (r.costos_por_nombre as string | null) ?? null,
    editadoEn: (r.costos_en as string | null) ?? (r.creado_en as string | null) ?? null,
  };
  return {
    ...base,
    ...calcularFila(base),
    estatus: (r.estatus as string | null) ?? null,
    cerrada: cerradaPorCierre(base.llegada, ultimoCerrado),
    financiamientoFijadoEn: typeof r.financiamiento_fijado_en === "string" ? r.financiamiento_fijado_en.slice(0, 10) : null,
  };
}

/** El último mes cerrado en el Cierre de mes (null si no hay o falta la tabla). */
export async function ultimoMesCerrado(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("fin_cierres").select("*").order("periodo", { ascending: false }).limit(24);
  if (error) return null;
  const cerrado = (data ?? []).find((f) => estaCerrado(f as Record<string, unknown>));
  return cerrado ? String((cerrado as Record<string, unknown>).periodo).slice(0, 10) : null;
}

async function idPais(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("paises").select("id").eq("codigo", PAIS_HOJA_COSTOS).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function cargarHojaCostos(supabase: SupabaseClient): Promise<DatosHojaCostos | { error: string }> {
  const ultimoCerrado = await ultimoMesCerrado(supabase);
  const filasR = await traerTodasConError<Record<string, unknown>>((d, h) =>
    supabase.from("fin_costos_lotes").select(COLUMNAS).eq("en_hoja_costos", true).order("id").range(d, h) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>,
  );
  if (filasR.error) return { error: SIN_MIGRACION_HOJA };
  const filas = (filasR.data ?? []).map((r) => aFila(r, ultimoCerrado)).filter((f) => f.skuId);
  filas.sort((a, b) => (a.numero ?? 999999) - (b.numero ?? 999999) || (b.llegada ?? "").localeCompare(a.llegada ?? ""));

  // Stock físico en las bodegas propias de Panamá, y la lista de la carga inicial sin compra vinculada.
  const pais = await idPais(supabase);
  const [stockR, sinCompraR] = await Promise.all([
    pais
      ? traerTodasConError<Record<string, unknown>>((d, h) =>
          supabase.from("wms_stock").select("sku_maestro_id, fisico, wms_bodegas!inner(pais_id, tipo)").eq("wms_bodegas.pais_id", pais).eq("wms_bodegas.tipo", "propia").gt("fisico", 0).order("sku_maestro_id").range(d, h),
        )
      : Promise.resolve({ data: [], error: null }),
    supabase.from("fin_config").select("valor").eq("clave", "costos_sin_compra").maybeSingle(),
  ]);
  const stock = new Map<string, number>();
  for (const s of (stockR.data ?? []) as Record<string, unknown>[]) stock.set(String(s.sku_maestro_id), (stock.get(String(s.sku_maestro_id)) ?? 0) + num(s.fisico));
  const numerosSinCompra = Array.isArray(sinCompraR.data?.valor) ? (sinCompraR.data!.valor as unknown[]).map(Number).filter(Number.isFinite) : [];

  // El catálogo para saber si un producto tiene costo (propio, de su principal o de sus componentes).
  const cat = await cargarCatalogoCostos(supabase, filas);
  const idsSinCompra = new Map<string, number>();
  if (numerosSinCompra.length) {
    const { data } = await supabase.from("skus_maestros").select("id, numero").in("numero", numerosSinCompra.slice(0, 500));
    for (const s of data ?? []) idsSinCompra.set(String(s.id), Number(s.numero));
  }
  const candidatos = productosSinCosto(new Set(stock.keys()), new Set(), new Set(idsSinCompra.keys()));
  const faltan: string[] = [];
  // El padre de cada candidato (una variante puede tomar el costo de su principal).
  for (let i = 0; i < candidatos.length; i += 200) {
    const { data } = await supabase.from("skus_maestros").select("id, padre_id").in("id", candidatos.slice(i, i + 200));
    for (const s of data ?? []) if (s.padre_id) cat.padre.set(String(s.id), String(s.padre_id));
  }
  const hoy = hoyPanama();
  for (const c of candidatos) if (costoEn(cat, c, hoy) === null) faltan.push(c);
  const sinCosto: ProductoSinCosto[] = [];
  for (let i = 0; i < faltan.length; i += 200) {
    const { data } = await supabase.from("skus_maestros").select("id, numero, codigo, nombre").in("id", faltan.slice(i, i + 200));
    for (const s of data ?? [])
      sinCosto.push({
        skuId: String(s.id),
        numero: s.numero === null ? null : Number(s.numero),
        sku: String(s.codigo ?? ""),
        producto: String(s.nombre ?? ""),
        stock: stock.get(String(s.id)) ?? 0,
        sinCompra: idsSinCompra.has(String(s.id)),
      });
  }
  sinCosto.sort((a, b) => (a.numero ?? 999999) - (b.numero ?? 999999));
  return { filas, resumen: resumirProductos(filas), sinCosto, ultimoCerrado };
}

/**
 * El catálogo para `costoEn`: las filas de la hoja por producto y los componentes de los packs. Con `filas` ya leídas no
 * vuelve a pedirlas. Los padres de las variantes se agregan después (solo los que hacen falta).
 */
export async function cargarCatalogoCostos(supabase: SupabaseClient, filas?: Pick<FilaHojaVista, "skuId" | "llegada" | "costoTotal" | "editadoEn">[]): Promise<CatalogoCostos> {
  let lista = filas;
  if (!lista) {
    const r = await traerTodasConError<Record<string, unknown>>((d, h) =>
      supabase.from("fin_costos_lotes").select("sku_maestro_id, fecha_llegada, costo_total, creado_en").eq("en_hoja_costos", true).order("id").range(d, h),
    );
    lista = (r.error ? [] : (r.data ?? [])).map((x) => ({
      skuId: String(x.sku_maestro_id),
      llegada: typeof x.fecha_llegada === "string" ? x.fecha_llegada.slice(0, 10) : null,
      costoTotal: num(x.costo_total),
      editadoEn: (x.creado_en as string | null) ?? null,
    }));
  }
  const compras = new Map<string, { llegada: string | null; costo: number; creado?: string }[]>();
  for (const f of lista) compras.set(f.skuId, [...(compras.get(f.skuId) ?? []), { llegada: f.llegada, costo: f.costoTotal, creado: f.editadoEn ?? "" }]);
  const comp = await traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").order("id").range(d, h));
  const componentes = new Map<string, { componente: string; cantidad: number }[]>();
  for (const c of comp.error ? [] : (comp.data ?? []))
    componentes.set(String(c.combo_id), [...(componentes.get(String(c.combo_id)) ?? []), { componente: String(c.componente_id), cantidad: num(c.cantidad) || 1 }]);
  return { compras, componentes, padre: new Map() };
}

/** Suma al catálogo los productos principales de estas variantes (para que tomen su costo). */
export async function agregarPadres(supabase: SupabaseClient, cat: CatalogoCostos, skuIds: string[]): Promise<void> {
  const ids = [...new Set(skuIds)].filter((s) => !cat.compras.has(s) && !cat.componentes.has(s));
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("skus_maestros").select("id, padre_id").in("id", ids.slice(i, i + 200));
    for (const s of data ?? []) if (s.padre_id) cat.padre.set(String(s.id), String(s.padre_id));
  }
}
