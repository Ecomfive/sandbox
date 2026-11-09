import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { margenEffi } from "@/lib/effi/articulos";
import { tasasUsd } from "@/lib/moneda/tipo-cambio";
import { cargarEnCamino } from "@/lib/publicaciones/en-camino-datos";
import { fulfillmentEnMoneda, fulfillmentQueCuenta, leerFulfillmentPlataforma, type QuienPagaFulfillment } from "@/lib/publicaciones/fulfillment-pais";
import { monedaPublicaciones, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { FilaPublicacionDunamixfy, ProductoDunamixfy } from "./def-publicaciones-dunamixfy";

export interface DatosDunamixfy {
  publicaciones: FilaPublicacionDunamixfy[];
  moneda: MonedaPublicaciones;
  ultimaLectura: string | null;
  fulfillment: number | null;
  fulfillmentPaga: QuienPagaFulfillment;
  faltaMigracion: boolean;
}

type SkuFila = { id: string; codigo: string; nombre: string; foto_url: string | null; tipo: string; numero: number | null; codigo_barras: string | null };
type Fila = {
  id: string;
  dunamixfy_id: string;
  nombre: string;
  sku_dunamixfy: string | null;
  categoria: string | null;
  foto_url: string | null;
  precio: number | null;
  precio_sugerido: number | null;
  stock: number | null;
  reservado: number | null;
  activo: boolean;
  privado: boolean;
  en_dunamixfy: boolean;
  ultima_vez: string;
  sugerencia: string | null;
  producto: SkuFila | SkuFila[] | null;
  sugerido: SkuFila | SkuFila[] | null;
};

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const num = (v: number | null) => (v === null ? null : Number(v));
const aProducto = (s: SkuFila | null): ProductoDunamixfy | null => (s ? { id: s.id, codigo: s.codigo, nombre: s.nombre, foto: s.foto_url, tipo: s.tipo, numero: s.numero ?? null, barras: s.codigo_barras || null } : null);

/**
 * Los productos de Dunamixfy del país con su producto, la sugerencia, el margen y lo que viene en camino. Dunamixfy no sabe nuestro costo (allá está en 1): el margen es
 * precio al dropshipper − costo del producto (el de su publicación de Gestión de IDs Dropi del país, la más reciente con costo, como en Drop) − fulfillment de Dunamixfy
 * (Configuración › Plataformas del país, fila «Dunamixfy»).
 */
export async function cargarDatosDunamixfy(supabase: SupabaseClient, pais: { id: string; codigo: string }, usuario: UsuarioActual): Promise<DatosDunamixfy> {
  const porUsd = (await tasasUsd(supabase)).porUsd;
  const moneda = monedaPublicaciones(pais.codigo, porUsd);
  let filas: Fila[];
  try {
    filas = await traerTodasLasFilas<Fila>((d, h) =>
      supabase
        .from("dunamixfy_publicaciones")
        .select(
          "id, dunamixfy_id, nombre, sku_dunamixfy, categoria, foto_url, precio, precio_sugerido, stock, reservado, activo, privado, en_dunamixfy, ultima_vez, sugerencia, producto:skus_maestros!dunamixfy_publicaciones_sku_maestro_id_fkey(id, codigo, nombre, foto_url, tipo, numero, codigo_barras), sugerido:skus_maestros!dunamixfy_publicaciones_sugerido_sku_id_fkey(id, codigo, nombre, foto_url, tipo, numero, codigo_barras)",
        )
        .eq("pais_id", pais.id)
        .order("nombre")
        .order("id")
        .range(d, h),
    );
  } catch (e) {
    if (/dunamixfy_publicaciones|schema cache|does not exist/i.test(String((e as { message?: string })?.message ?? e)))
      return { publicaciones: [], moneda, ultimaLectura: null, fulfillment: null, fulfillmentPaga: "nosotros", faltaMigracion: true };
    throw e;
  }

  const plataforma = await leerFulfillmentPlataforma(supabase, pais.id, "dunamixfy");
  const fulfillmentPaga = plataforma?.paga ?? "nosotros";
  const fulfillment = fulfillmentQueCuenta(plataforma?.monto == null ? null : fulfillmentEnMoneda(plataforma.monto, plataforma.moneda, pais.codigo, porUsd), fulfillmentPaga);

  // El costo de cada producto vinculado: el de su publicación de Dropi del país (la más reciente con costo).
  const vinculados = [...new Set(filas.map((f) => uno(f.producto)?.id).filter((x): x is string => !!x))];
  const costos = new Map<string, number>();
  if (vinculados.length) {
    const { data } = await supabase
      .from("dropi_publicaciones")
      .select("sku_maestro_id, costo_mercancia, actualizado_en")
      .eq("pais_id", pais.id)
      .in("sku_maestro_id", vinculados)
      .not("costo_mercancia", "is", null)
      .order("actualizado_en", { ascending: false });
    for (const p of data ?? []) if (!costos.has(p.sku_maestro_id as string)) costos.set(p.sku_maestro_id as string, Number(p.costo_mercancia));
  }

  const { camino, cotizando, etapasCotizando } = vinculados.length ? await cargarEnCamino(supabase, pais.id, usuario) : { camino: new Map(), cotizando: new Map(), etapasCotizando: new Map() };

  const publicaciones = filas.map((f): FilaPublicacionDunamixfy => {
    const producto = aProducto(uno(f.producto));
    const precio = num(f.precio);
    const costo = producto ? (costos.get(producto.id) ?? null) : null;
    const m = margenEffi(precio, costo, fulfillment);
    const viene = producto ? camino.get(producto.id) : undefined;
    return {
      id: f.id,
      idDunamixfy: f.dunamixfy_id,
      nombre: f.nombre,
      skuDunamixfy: f.sku_dunamixfy ?? "",
      categoria: f.categoria ?? "",
      fotoUrl: f.foto_url,
      precio,
      precioSugerido: num(f.precio_sugerido),
      costo,
      fulfillment,
      fulfillmentPaga,
      utilidad: m?.utilidad ?? null,
      margen: m?.margen ?? null,
      stock: f.stock,
      reservado: f.reservado,
      activo: f.activo,
      privado: f.privado,
      conectado: f.en_dunamixfy,
      ultimaVez: f.ultima_vez,
      producto,
      sugerido: producto ? null : aProducto(uno(f.sugerido)),
      sugerencia: producto ? null : f.sugerencia,
      enCamino: viene?.unidades ?? 0,
      llegadaCamino: viene?.llegada ?? null,
      sinFechaCamino: viene?.sinFecha ?? 0,
      sinEnvioCamino: viene?.sinEnvio ?? 0,
      enCotizacion: producto ? (cotizando.get(producto.id) ?? 0) : 0,
      etapaCotizacion: producto ? (etapasCotizando.get(producto.id) ?? null) : null,
    };
  });
  const ultimaLectura = filas.filter((f) => f.en_dunamixfy).reduce<string | null>((max, f) => (!max || f.ultima_vez > max ? f.ultima_vez : max), null);
  return { publicaciones, moneda, ultimaLectura, fulfillment, fulfillmentPaga, faltaMigracion: false };
}
