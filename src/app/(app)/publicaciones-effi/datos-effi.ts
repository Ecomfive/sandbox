import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { margenEffi } from "@/lib/effi/articulos";
import { tasasUsd } from "@/lib/moneda/tipo-cambio";
import { cargarEnCamino } from "@/lib/publicaciones/en-camino-datos";
import { fulfillmentEnMoneda } from "@/lib/publicaciones/fulfillment-pais";
import { monedaPublicaciones, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { FilaPublicacionEffi, ProductoEffi } from "./def-publicaciones-effi";

export interface DatosEffi {
  publicaciones: FilaPublicacionEffi[];
  moneda: MonedaPublicaciones;
  ultimaLectura: string | null;
  fulfillment: number | null;
  faltaMigracion: boolean;
}

type SkuFila = { id: string; codigo: string; nombre: string; foto_url: string | null; tipo: string };
type Fila = {
  id: string;
  effi_id: string;
  nombre: string;
  referencia: string | null;
  gtin: string | null;
  categoria: string | null;
  foto_url: string | null;
  precio_dropshipping: number | null;
  precio_sugerido: number | null;
  precio_minimo: number | null;
  costo: number | null;
  stock_principal: number | null;
  stock_garantias: number | null;
  compartido: boolean;
  en_effi: boolean;
  ultima_vez: string;
  sugerencia: string | null;
  producto: SkuFila | SkuFila[] | null;
  sugerido: SkuFila | SkuFila[] | null;
};

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const num = (v: number | null) => (v === null ? null : Number(v));
const aProducto = (s: SkuFila | null): ProductoEffi | null => (s ? { id: s.id, codigo: s.codigo, nombre: s.nombre, foto: s.foto_url, tipo: s.tipo } : null);

/** Los artículos de Effi del país con su producto, la sugerencia, el margen (precio de dropshipping − costo en Effi − fulfillment de la fila «Effi» de Configuración) y lo que viene en camino. */
export async function cargarDatosEffi(supabase: SupabaseClient, pais: { id: string; codigo: string }, usuario: UsuarioActual): Promise<DatosEffi> {
  const porUsd = (await tasasUsd(supabase)).porUsd;
  const moneda = monedaPublicaciones(pais.codigo, porUsd);
  let filas: Fila[];
  try {
    filas = await traerTodasLasFilas<Fila>((d, h) =>
      supabase
        .from("effi_publicaciones")
        .select(
          "id, effi_id, nombre, referencia, gtin, categoria, foto_url, precio_dropshipping, precio_sugerido, precio_minimo, costo, stock_principal, stock_garantias, compartido, en_effi, ultima_vez, sugerencia, producto:skus_maestros!effi_publicaciones_sku_maestro_id_fkey(id, codigo, nombre, foto_url, tipo), sugerido:skus_maestros!effi_publicaciones_sugerido_sku_id_fkey(id, codigo, nombre, foto_url, tipo)",
        )
        .eq("pais_id", pais.id)
        .order("nombre")
        .order("id")
        .range(d, h),
    );
  } catch (e) {
    if (/effi_publicaciones|schema cache|does not exist/i.test(String((e as { message?: string })?.message ?? e))) return { publicaciones: [], moneda, ultimaLectura: null, fulfillment: null, faltaMigracion: true };
    throw e;
  }

  const { data: plataformas } = await supabase.from("pais_plataformas").select("fulfillment, fulfillment_moneda, plataformas(nombre)").eq("pais_id", pais.id);
  const filaEffi = (plataformas ?? []).find((p) => uno(p.plataformas as unknown as { nombre: string } | null)?.nombre?.trim().toLowerCase() === "effi");
  const fulfillment =
    filaEffi?.fulfillment === null || filaEffi?.fulfillment === undefined ? null : fulfillmentEnMoneda(Number(filaEffi.fulfillment), String(filaEffi.fulfillment_moneda ?? "USD"), pais.codigo, porUsd);

  const hayProductos = filas.some((f) => uno(f.producto));
  const { camino, cotizando, etapasCotizando } = hayProductos ? await cargarEnCamino(supabase, pais.id, usuario) : { camino: new Map(), cotizando: new Map(), etapasCotizando: new Map() };

  const publicaciones = filas.map((f): FilaPublicacionEffi => {
    const producto = aProducto(uno(f.producto));
    const precio = num(f.precio_dropshipping);
    const costo = num(f.costo);
    const m = margenEffi(precio, costo, fulfillment);
    const viene = producto ? camino.get(producto.id) : undefined;
    return {
      id: f.id,
      idEffi: f.effi_id,
      nombre: f.nombre,
      referencia: f.referencia ?? "",
      gtin: f.gtin ?? "",
      categoria: f.categoria ?? "",
      fotoUrl: f.foto_url,
      precio,
      precioSugerido: num(f.precio_sugerido),
      precioMinimo: num(f.precio_minimo),
      costo,
      fulfillment,
      utilidad: m?.utilidad ?? null,
      margen: m?.margen ?? null,
      stock: f.stock_principal,
      stockGarantias: f.stock_garantias,
      compartido: f.compartido,
      conectado: f.en_effi,
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
  const ultimaLectura = filas.filter((f) => f.en_effi).reduce<string | null>((max, f) => (!max || f.ultima_vez > max ? f.ultima_vez : max), null);
  return { publicaciones, moneda, ultimaLectura, fulfillment, faltaMigracion: false };
}
