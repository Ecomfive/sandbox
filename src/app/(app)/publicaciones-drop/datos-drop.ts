import { compraQueVale, costoDrop, type CostoCompra, type ProductoFamilia } from "@/lib/publicaciones-drop/costo";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { cargarEnCamino } from "@/lib/publicaciones/en-camino-datos";
import { tasasUsd } from "@/lib/moneda/tipo-cambio";
import { margenDrop } from "@/lib/publicaciones-drop/lectura";
import { monedaPublicaciones, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import { fulfillmentEnMoneda, fulfillmentQueCuenta, leerFulfillmentPlataforma, type QuienPagaFulfillment } from "@/lib/publicaciones/fulfillment-pais";
import { cambiosPrecioEsperando } from "@/lib/publicaciones/cambios-precio-datos";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { FilaPublicacionDrop, ProductoDrop } from "./def-publicaciones-drop";

export interface DatosDrop {
  publicaciones: FilaPublicacionDrop[];
  moneda: MonedaPublicaciones;
  /** La última lectura de Drop (la más reciente `ultima_vez`); null si nunca se leyó. */
  ultimaLectura: string | null;
  /** El fulfillment de Drop del país en la moneda de las publicaciones que cuenta en el margen; null si no está en Configuración o si lo paga el dropshipper. */
  fulfillment: number | null;
  /** Quién paga el fulfillment de Drop (Configuración, migración 0247). */
  fulfillmentPaga: QuienPagaFulfillment;
  /** Falta correr la migración 0221. */
  faltaMigracion: boolean;
}

type Fila = {
  id: string;
  drop_id: string;
  codigo: string | null;
  nombre: string;
  sku_drop: string | null;
  estado: "activo" | "inactivo";
  precio: number | null;
  /** Migración 0266 (los lee el favorito «Aplicar precios»): sin la migración no vienen. */
  precio_proveedor?: number | null;
  precio_sugerido?: number | null;
  con_variantes?: boolean | null;
  precios_leidos_en?: string | null;
  inventario: number | null;
  foto_url: string | null;
  ultima_vez: string;
  en_drop: boolean;
  creado_en_drop: string | null;
  sugerencia: string | null;
  producto: SkuFila | SkuFila[] | null;
  sugerido: SkuFila | SkuFila[] | null;
};
type SkuFila = { id: string; codigo: string; nombre: string; foto_url: string | null; tipo: string; numero: number | null; codigo_barras: string | null };

const aProducto = (s: SkuFila | null): ProductoDrop | null => (s ? { id: s.id, codigo: s.codigo, nombre: s.nombre, foto: s.foto_url, tipo: s.tipo, numero: s.numero ?? null, barras: s.codigo_barras || null } : null);

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Las publicaciones de Drop del país, con su producto, la sugerencia y el margen. Van también las que la última lectura ya no encontró (`conectado: false`,
 * se eliminaron en Drop), para saber cuáles están conectadas y cuáles no. El margen: precio − costo del producto (el de su
 * publicación de Gestión de IDs Dropi del mismo país, la más reciente con costo) − fulfillment de Drop (Configuración › Plataformas del país, fila «Drop»).
 */
export async function cargarDatosDrop(supabase: SupabaseClient, pais: { id: string; codigo: string }, usuario: UsuarioActual): Promise<DatosDrop> {
  const porUsd = (await tasasUsd(supabase)).porUsd;
  const moneda = monedaPublicaciones(pais.codigo, porUsd);
  let filas: Fila[];
  try {
    const columnas =
      "id, drop_id, codigo, nombre, sku_drop, estado, precio, inventario, foto_url, ultima_vez, en_drop, creado_en_drop, sugerencia, producto:skus_maestros!drop_publicaciones_sku_maestro_id_fkey(id, codigo, nombre, foto_url, tipo, numero, codigo_barras), sugerido:skus_maestros!drop_publicaciones_sugerido_sku_id_fkey(id, codigo, nombre, foto_url, tipo, numero, codigo_barras)";
    const leer = (cols: string) => traerTodasLasFilas<Fila>((d, h) => supabase.from("drop_publicaciones").select(cols).eq("pais_id", pais.id).order("nombre").order("id").range(d, h) as unknown as PromiseLike<{ data: Fila[] | null; error: unknown }>);
    // Con los precios que lee «Aplicar precios» (migración 0266); sin la migración, como antes.
    try {
      filas = await leer(`${columnas}, precio_proveedor, precio_sugerido, con_variantes, precios_leidos_en`);
    } catch (e) {
      if (!/precio_proveedor|precio_sugerido|con_variantes|precios_leidos_en/i.test(String((e as { message?: string })?.message ?? e))) throw e;
      filas = await leer(columnas);
    }
  } catch (e) {
    if (/drop_publicaciones|schema cache|does not exist/i.test(String((e as { message?: string })?.message ?? e))) return { publicaciones: [], moneda, ultimaLectura: null, fulfillment: null, fulfillmentPaga: "nosotros", faltaMigracion: true };
    throw e;
  }

  // El costo de cada producto vinculado: el de su publicación de Dropi del país (la más reciente con costo).
  const skuIds = [...new Set(filas.map((f) => uno(f.producto)?.id).filter((x): x is string => !!x))];
  const costos = new Map<string, number>();
  if (skuIds.length) {
    const { data } = await supabase
      .from("dropi_publicaciones")
      .select("sku_maestro_id, costo_mercancia, actualizado_en")
      .eq("pais_id", pais.id)
      .in("sku_maestro_id", skuIds)
      .not("costo_mercancia", "is", null)
      .order("actualizado_en", { ascending: false });
    for (const p of data ?? []) if (!costos.has(p.sku_maestro_id as string)) costos.set(p.sku_maestro_id as string, Number(p.costo_mercancia));
  }
  // Una variante sin costo toma el de otra del mismo producto (10 nov 2026, `costoDrop`): se traen sus hermanos y su principal, con su costo en Dropi del país.
  const familia: ProductoFamilia[] = [];
  if (skuIds.length) {
    const { data: vinculados } = await supabase.from("skus_maestros").select("id, codigo, padre_id").in("id", skuIds);
    const grupos = [...new Set((vinculados ?? []).map((v) => (v.padre_id as string | null) ?? (v.id as string)))];
    const { data: parientes } = grupos.length
      ? await supabase.from("skus_maestros").select("id, codigo, padre_id").or(`id.in.(${grupos.join(",")}),padre_id.in.(${grupos.join(",")})`)
      : { data: [] };
    for (const f of parientes ?? []) familia.push({ id: f.id as string, codigo: f.codigo as string, padreId: (f.padre_id as string | null) ?? null });
    const faltan = familia.map((f) => f.id).filter((id) => !costos.has(id));
    if (faltan.length) {
      const { data } = await supabase
        .from("dropi_publicaciones")
        .select("sku_maestro_id, costo_mercancia, actualizado_en")
        .eq("pais_id", pais.id)
        .in("sku_maestro_id", faltan)
        .not("costo_mercancia", "is", null)
        .order("actualizado_en", { ascending: false });
      for (const p of data ?? []) if (!costos.has(p.sku_maestro_id as string)) costos.set(p.sku_maestro_id as string, Number(p.costo_mercancia));
    }
  }
  // El de Compras de cada producto (o de su principal): lo que costó por unidad en la orden más reciente, del país si hay (10 nov 2026, pedido de Hernán).
  const compraDe = new Map<string, CostoCompra>();
  {
    const ids = [...new Set([...skuIds, ...familia.map((f) => f.id)])];
    if (ids.length) {
      const { data } = await supabase
        .from("wms_compra_items")
        .select("sku_maestro_id, costo_unitario, compra:wms_compras!inner(pais_id, codigo, creado_en, anulada_en)")
        .in("sku_maestro_id", ids)
        .gt("costo_unitario", 0)
        .is("compra.anulada_en", null);
      const porSku = new Map<string, { usd: number; orden: string; paisId: string; fecha: string }[]>();
      for (const l of data ?? []) {
        const c = uno(l.compra as { pais_id: string; codigo: string | null; creado_en: string } | { pais_id: string; codigo: string | null; creado_en: string }[] | null);
        if (!c) continue;
        const lista = porSku.get(l.sku_maestro_id as string) ?? [];
        lista.push({ usd: Number(l.costo_unitario), orden: c.codigo ?? "OC", paisId: c.pais_id, fecha: c.creado_en });
        porSku.set(l.sku_maestro_id as string, lista);
      }
      for (const [sku, lineas] of porSku) {
        const v = compraQueVale(lineas, pais.id);
        if (v) compraDe.set(sku, v);
      }
    }
  }
  const padreDe = new Map(familia.map((f) => [f.id, f.padreId]));
  // El escrito a mano (migración 0267); sin la migración, ninguno.
  const manuales = new Map<string, number>();
  {
    const { data, error } = await supabase.from("drop_publicaciones").select("id, costo_manual").eq("pais_id", pais.id).not("costo_manual", "is", null);
    if (!error) for (const f of data ?? []) manuales.set(f.id as string, Number(f.costo_manual));
  }

  // El fulfillment de Drop del país, pasado a la moneda de las publicaciones si se escribió en otra.
  const plataforma = await leerFulfillmentPlataforma(supabase, pais.id, "drop");
  const fulfillmentPaga = plataforma?.paga ?? "nosotros";
  // Si lo paga el dropshipper, no se toma en cuenta en el margen.
  const fulfillment = fulfillmentQueCuenta(plataforma?.monto == null ? null : fulfillmentEnMoneda(plataforma.monto, plataforma.moneda, pais.codigo, porUsd), fulfillmentPaga);

  // Lo que viene en camino y lo que se cotiza de cada producto, en compras del país (lo mismo que muestra Gestión de IDs Dropi).
  const [{ camino, cotizando, etapasCotizando }, cambiosPrecio] = await Promise.all([
    skuIds.length ? cargarEnCamino(supabase, pais.id, usuario) : { camino: new Map(), cotizando: new Map(), etapasCotizando: new Map() },
    cambiosPrecioEsperando(supabase, "drop", pais.id),
  ]);

  const publicaciones = filas.map((f): FilaPublicacionDrop => {
    const producto = aProducto(uno(f.producto));
    const compra = producto ? (compraDe.get(producto.id) ?? compraDe.get(padreDe.get(producto.id) ?? "") ?? null) : null;
    const { costo, origen: costoOrigen, de: costoDe } = costoDrop(producto?.id ?? null, costos, familia, manuales.get(f.id) ?? null, compra, moneda.porUsd);
    const precio = f.precio === null ? null : Number(f.precio);
    const precioProveedor = f.precio_proveedor == null ? null : Number(f.precio_proveedor);
    // Lo que recibimos es el precio sin la comisión de Drop: si ya se leyó, el margen va con ese (10 nov 2026); si no, con el de «Mis productos».
    const m = margenDrop(precioProveedor ?? precio, costo, fulfillment);
    const viene = producto ? camino.get(producto.id) : undefined;
    return {
      id: f.id,
      nombre: f.nombre,
      estado: f.estado,
      idDrop: f.codigo ?? "",
      dropInterno: f.drop_id,
      skuDrop: f.sku_drop ?? "",
      fotoUrl: f.foto_url,
      precio,
      precioProveedor,
      precioSugerido: f.precio_sugerido == null ? null : Number(f.precio_sugerido),
      conVariantes: f.con_variantes ?? null,
      preciosLeidosEn: f.precios_leidos_en ?? null,
      cambioPrecio: cambiosPrecio.get(f.id) ?? null,
      inventario: f.inventario,
      producto,
      sugerido: producto ? null : aProducto(uno(f.sugerido)),
      sugerencia: producto ? null : f.sugerencia,
      conectado: f.en_drop,
      creadoEnDrop: f.creado_en_drop,
      ultimaVez: f.ultima_vez,
      costo,
      costoOrigen,
      costoDe,
      utilidad: m?.utilidad ?? null,
      margen: m?.margen ?? null,
      fulfillment,
      fulfillmentPaga,
      liquidacion: false,
      enCamino: viene?.unidades ?? 0,
      llegadaCamino: viene?.llegada ?? null,
      sinFechaCamino: viene?.sinFecha ?? 0,
      sinEnvioCamino: viene?.sinEnvio ?? 0,
      enCotizacion: producto ? (cotizando.get(producto.id) ?? 0) : 0,
      etapaCotizacion: producto ? (etapasCotizando.get(producto.id) ?? null) : null,
    };
  });
  const ultimaLectura = filas.filter((f) => f.en_drop).reduce<string | null>((max, f) => (!max || f.ultima_vez > max ? f.ultima_vez : max), null);
  return { publicaciones, moneda, ultimaLectura, fulfillment, fulfillmentPaga, faltaMigracion: false };
}
