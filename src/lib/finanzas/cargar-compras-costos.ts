// Lectura de Compras y costos e inventario para decidir (migración 0935; usa Compras 0050–0110, el WMS 0069/0073,
// Costos de mercancía 0121 y el inventario valorizado 0134). Solo lectura: Compras y el WMS no se tocan. Los permisos los
// decide quien llama. La lógica está en `compras-costos.ts` e `inventario-decisiones.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { PAIS_FINANZAS } from "./cargar-inventario";
import {
  esConceptoGasto,
  leerAnticipo,
  lineasGastosImportacion,
  lineasPresupuestoCompras,
  presupuestoDesdeLineas,
  type Anticipo,
  type CompraFin,
  type GastoImportacion,
  type ItemCompra,
  type LoteCosto,
  type PorPagarProveedor,
} from "./compras-costos";
import { CLAVE_ALERTA_COSTO, CLAVE_REORDEN, CLAVE_SOBRESTOCK, leerAjustesInventario, type AjustesInventario, type FilaMerma, type PrecioReferencia } from "./inventario-decisiones";
import type { Linea } from "./proyeccion-caja";

export const SIN_MIGRACION_COMPRAS_COSTOS = "Falta correr la migración 0935 (inventario y compras) en Supabase.";

const num = (v: unknown) => Number(v ?? 0) || 0;
const numONull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const fecha10 = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const uno = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

async function paisId(supabase: SupabaseClient, codigo: string = PAIS_FINANZAS): Promise<string | null> {
  const { data } = await supabase.from("paises").select("id").eq("codigo", codigo).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function cargarAjustesInventario(supabase: SupabaseClient): Promise<AjustesInventario> {
  const { data } = await supabase.from("fin_config").select("clave, valor").in("clave", [CLAVE_SOBRESTOCK, CLAVE_ALERTA_COSTO, CLAVE_REORDEN]);
  return leerAjustesInventario((data ?? []) as { clave: string; valor: unknown }[]);
}

// ---------------------------------------------------------------------------------------------
// Compras de Panamá
// ---------------------------------------------------------------------------------------------
const COLUMNAS_COMPRA =
  "id, codigo, nombre, proveedor, etapa, estado, via_envio, monto_total, primer_pago, segundo_pago, pagado_a_proveedor, fecha_pago_1, fecha_pago_2, fecha_envio, fecha_limite, fecha_llegada, qty_total, sku_maestro_id, creado_en";

const aCompra = (c: Record<string, unknown>): CompraFin => ({
  id: String(c.id),
  codigo: String(c.codigo ?? ""),
  nombre: String(c.nombre ?? ""),
  proveedor: (c.proveedor as string | null) ?? null,
  etapa: String(c.etapa ?? ""),
  estado: String(c.estado ?? ""),
  via: Array.isArray(c.via_envio) && c.via_envio.length === 1 ? String(c.via_envio[0]) : Array.isArray(c.via_envio) && c.via_envio.length ? String(c.via_envio.includes("mar") ? "mar" : c.via_envio[0]) : null,
  montoTotal: numONull(c.monto_total),
  primerPago: numONull(c.primer_pago),
  segundoPago: numONull(c.segundo_pago),
  pagadoAProveedor: numONull(c.pagado_a_proveedor),
  fechaPago1: fecha10(c.fecha_pago_1),
  fechaPago2: fecha10(c.fecha_pago_2),
  fechaEnvio: fecha10(c.fecha_envio),
  fechaLimite: fecha10(c.fecha_limite),
  fechaLlegada: fecha10(c.fecha_llegada),
  qtyTotal: numONull(c.qty_total),
  skuId: (c.sku_maestro_id as string | null) ?? null,
  creada: String(c.creado_en ?? "").slice(0, 10),
});

const aGasto = (g: Record<string, unknown>): GastoImportacion | null =>
  esConceptoGasto(g.concepto)
    ? {
        id: String(g.id),
        compraId: String(g.compra_id),
        concepto: g.concepto,
        monto: num(g.monto),
        fecha: fecha10(g.fecha),
        pagado: g.pagado === true,
        nota: (g.nota as string | null) ?? null,
      }
    : null;

export interface DatosComprasCostos {
  compras: CompraFin[];
  items: ItemCompra[];
  gastos: GastoImportacion[];
  /** Costo vigente por producto (Costos de mercancía). */
  vigente: Map<string, number>;
  nombres: Map<string, { codigo: string; producto: string }>;
  lotes: LoteCosto[];
  presupuestos: Map<string, number>;
  anticipos: Anticipo[];
  ajustes: AjustesInventario;
  /** Sin la 0148: no hay gastos de importación, presupuesto ni anticipos (lo demás se ve igual). */
  sinMigracion: boolean;
}

/** Compras del país (no anuladas; Panamá por defecto) con sus productos, gastos de importación, costos y presupuesto. */
export async function cargarComprasCostos(supabase: SupabaseClient, hoy: string, codigoPais: string = PAIS_FINANZAS): Promise<DatosComprasCostos | { error: string }> {
  const pais = await paisId(supabase, codigoPais);
  if (!pais) return { error: `No existe el país ${codigoPais}.` };
  const [compras, gastos, lotes, presupuesto, anticipos, ajustes] = await Promise.all([
    traerTodasConError<Record<string, unknown>>((d, h) =>
      supabase.from("wms_compras").select(COLUMNAS_COMPRA).eq("pais_id", pais).eq("tipo", "pais").is("anulada_en", null).order("id").range(d, h),
    ),
    traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("fin_compras_gastos").select("id, compra_id, concepto, monto, fecha, pagado, nota").order("id").range(d, h)),
    traerTodasConError<Record<string, unknown>>((d, h) =>
      supabase.from("fin_costos_lotes").select("id, producto_clave, producto, codigo, sku_maestro_id, fecha_llegada, costo_total").order("id").range(d, h),
    ),
    supabase.from("fin_compras_presupuesto").select("mes, monto").gte("mes", `${hoy.slice(0, 4)}-01-01`),
    supabase.rpc("fin_anticipos_proveedores_al", { p_corte: hoy }),
    cargarAjustesInventario(supabase),
  ]);
  if (compras.error) return { error: "No se pudieron leer las compras." };
  const listaCompras = (compras.data ?? []).map(aCompra);
  const ids = listaCompras.map((c) => c.id);
  // Los productos de las compras, de a 200 compras por consulta (la lista de ids viaja en la dirección).
  const items: ItemCompra[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("wms_compra_items")
      .select("compra_id, sku_maestro_id, cantidad_pedida, cantidad_recibida, costo_unitario, skus_maestros(codigo, nombre)")
      .in("compra_id", ids.slice(i, i + 200));
    if (error) break;
    for (const it of (data ?? []) as Record<string, unknown>[]) {
      const s = uno(it.skus_maestros as { codigo: string; nombre: string } | { codigo: string; nombre: string }[] | null);
      items.push({
        compraId: String(it.compra_id),
        skuId: String(it.sku_maestro_id),
        codigo: s?.codigo ?? "",
        producto: s?.nombre ?? "",
        cantidad: num(it.cantidad_pedida),
        recibida: numONull(it.cantidad_recibida),
        costoUnitario: numONull(it.costo_unitario),
      });
    }
  }
  const listaLotes: LoteCosto[] = (lotes.data ?? []).map((l) => ({
    productoClave: String(l.producto_clave),
    producto: String(l.producto ?? ""),
    codigo: (l.codigo as string | null) ?? null,
    skuId: (l.sku_maestro_id as string | null) ?? null,
    fecha: fecha10(l.fecha_llegada),
    costo: num(l.costo_total),
  }));
  // El costo vigente por producto: el del lote más reciente ligado a ese producto.
  const vigente = new Map<string, number>();
  const fechaVig = new Map<string, string>();
  for (const l of listaLotes) {
    if (!l.skuId || l.costo <= 0) continue;
    const f = l.fecha ?? "";
    if (!vigente.has(l.skuId) || f > (fechaVig.get(l.skuId) ?? "")) {
      vigente.set(l.skuId, l.costo);
      fechaVig.set(l.skuId, f);
    }
  }
  const skuSueltos = [...new Set(listaCompras.map((c) => c.skuId).filter((x): x is string => !!x))];
  const nombres = new Map<string, { codigo: string; producto: string }>();
  for (const it of items) nombres.set(it.skuId, { codigo: it.codigo, producto: it.producto });
  const faltan = skuSueltos.filter((s) => !nombres.has(s));
  for (let i = 0; i < faltan.length; i += 200) {
    const { data } = await supabase.from("skus_maestros").select("id, codigo, nombre").in("id", faltan.slice(i, i + 200));
    for (const s of data ?? []) nombres.set(String(s.id), { codigo: String(s.codigo ?? ""), producto: String(s.nombre ?? "") });
  }
  const sinMigracion = !!gastos.error || !!presupuesto.error || !!anticipos.error;
  return {
    compras: listaCompras,
    items,
    gastos: gastos.error ? [] : (gastos.data ?? []).map(aGasto).filter((g): g is GastoImportacion => g !== null),
    vigente,
    nombres,
    lotes: lotes.error ? [] : listaLotes,
    presupuestos: new Map(presupuesto.error ? [] : (presupuesto.data ?? []).map((p) => [String(p.mes).slice(0, 10), num(p.monto)])),
    anticipos: anticipos.error ? [] : ((anticipos.data ?? []) as Record<string, unknown>[]).map(leerAnticipo),
    ajustes,
    sinMigracion,
  };
}

// ---------------------------------------------------------------------------------------------
// Partidas extra de la Proyección de caja
// ---------------------------------------------------------------------------------------------
/**
 * Lo que Compras y costos suma a la proyección: los gastos de importación sin pagar (en «Compras abiertas», por su
 * fecha) y lo disponible del presupuesto de compras de cada mes (en «Reposición de mercancía»). Sin la 0148, nada.
 */
export async function lineasComprasPlanificadas(supabase: SupabaseClient, hoy: string, semanas: string[], comprasAbiertas: Linea[]): Promise<Linea[]> {
  const [gastos, presupuesto] = await Promise.all([
    supabase.from("fin_compras_gastos").select("id, compra_id, concepto, monto, fecha, pagado, wms_compras(codigo, nombre, etapa, anulada_en, paises(codigo))").eq("pagado", false),
    supabase.from("fin_compras_presupuesto").select("mes, monto").gte("mes", `${hoy.slice(0, 7)}-01`),
  ]);
  const porPagar: PorPagarProveedor[] = [];
  for (const g of gastos.error ? [] : ((gastos.data ?? []) as Record<string, unknown>[])) {
    const c = uno(g.wms_compras as Record<string, unknown> | Record<string, unknown>[] | null);
    const p = c ? uno(c.paises as { codigo: string } | { codigo: string }[] | null) : null;
    if (!c || c.anulada_en || c.etapa === "descartado" || p?.codigo !== PAIS_FINANZAS) continue;
    const f = fecha10(g.fecha);
    porPagar.push({
      clave: `g:${g.id}`,
      tipo: "gasto",
      compraId: String(g.compra_id),
      codigo: String(c.codigo ?? ""),
      nombre: String(c.nombre ?? ""),
      proveedor: null,
      concepto: String(g.concepto),
      monto: num(g.monto),
      fecha: f && f < hoy ? hoy : f,
      vencido: !!f && f < hoy,
    });
  }
  const deGastos = lineasGastosImportacion(porPagar, hoy, semanas);
  const presupuestos = new Map(presupuesto.error ? [] : (presupuesto.data ?? []).map((p) => [String(p.mes).slice(0, 10), num(p.monto)]));
  if (!presupuestos.size) return deGastos;
  const meses = presupuestoDesdeLineas(presupuestos, [...comprasAbiertas, ...deGastos], semanas, hoy);
  return [...deGastos, ...lineasPresupuestoCompras(meses, semanas, hoy)];
}

// ---------------------------------------------------------------------------------------------
// Inventario para decidir
// ---------------------------------------------------------------------------------------------
export interface DatosDecisiones {
  ajustes: AjustesInventario;
  precios: Map<string, PrecioReferencia>;
  /** Unidades vendidas en los últimos 60 días por producto (la ventana corta del inventario muerto). */
  vendidas60: Map<string, number>;
  merma: FilaMerma[];
  /** Lo que ya está en el libro por mes (movimientos de merma). */
  mermaEnLibro: Map<string, number>;
  sinMigracion: boolean;
}

export const MESES_MERMA = 6;

export async function cargarDecisiones(supabase: SupabaseClient, hoy: string, codigoPais: string = PAIS_FINANZAS): Promise<DatosDecisiones> {
  const desde = (() => {
    const d = new Date(`${hoy.slice(0, 7)}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - (MESES_MERMA - 1));
    return d.toISOString().slice(0, 10);
  })();
  const [ajustes, precios, vendido, merma, libro] = await Promise.all([
    cargarAjustesInventario(supabase),
    supabase.rpc("fin_inventario_precio_referencia", { p_pais: codigoPais, p_dias: 365 }),
    supabase.rpc("fin_inventario_vendido", { p_dias: 60, p_pais: codigoPais }),
    supabase.rpc("fin_merma_conteo", { p_desde: desde, p_pais: codigoPais }),
    supabase.from("fin_movimientos").select("periodo, monto, origen_clave").like("origen_clave", "merma-inventario:%"),
  ]);
  const mapaPrecios = new Map<string, PrecioReferencia>();
  for (const p of precios.error ? [] : ((precios.data ?? []) as Record<string, unknown>[])) {
    if (num(p.precio) > 0) mapaPrecios.set(String(p.sku_maestro_id), { precio: num(p.precio), fuente: p.fuente === "lista" ? "lista" : "ventas" });
  }
  return {
    ajustes,
    precios: mapaPrecios,
    vendidas60: new Map((vendido.error ? [] : ((vendido.data ?? []) as Record<string, unknown>[])).map((v) => [String(v.sku_maestro_id), num(v.unidades)])),
    merma: (merma.error ? [] : ((merma.data ?? []) as Record<string, unknown>[])).map((m) => ({
      mes: String(m.mes).slice(0, 10),
      skuId: String(m.sku_maestro_id),
      codigo: String(m.codigo ?? ""),
      producto: String(m.producto ?? ""),
      faltante: num(m.faltante),
      sobrante: num(m.sobrante),
      valorFaltante: num(m.valor_faltante),
      valorSobrante: num(m.valor_sobrante),
      sinCosto: m.sin_costo === true,
    })),
    mermaEnLibro: new Map((libro.data ?? []).map((l) => [String(l.periodo).slice(0, 10), num(l.monto)])),
    sinMigracion: !!precios.error || !!merma.error,
  };
}

export async function idPaisFinanzas(supabase: SupabaseClient, codigoPais: string = PAIS_FINANZAS): Promise<string | null> {
  return paisId(supabase, codigoPais);
}
