import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { cargarEnCamino } from "@/lib/publicaciones/en-camino-datos";
import { tasasUsd } from "@/lib/moneda/tipo-cambio";
import { margenDrop } from "@/lib/publicaciones-drop/lectura";
import { monedaPublicaciones, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import { fulfillmentEnMoneda } from "@/lib/publicaciones/fulfillment-pais";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { FilaPublicacionDrop, ProductoDrop } from "./def-publicaciones-drop";

export interface DatosDrop {
  publicaciones: FilaPublicacionDrop[];
  moneda: MonedaPublicaciones;
  /** La última lectura de Drop (la más reciente `ultima_vez`); null si nunca se leyó. */
  ultimaLectura: string | null;
  /** El fulfillment de Drop del país en la moneda de las publicaciones; null si no está en Configuración. */
  fulfillment: number | null;
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
  inventario: number | null;
  foto_url: string | null;
  ultima_vez: string;
  producto: ProductoDrop | ProductoDrop[] | null;
  sugerido: ProductoDrop | ProductoDrop[] | null;
};

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Las publicaciones de Drop del país (las que siguen en Drop), con su producto, la sugerencia y el margen: precio − costo del producto (el de su
 * publicación de Gestión de IDs Dropi del mismo país, la más reciente con costo) − fulfillment de Drop (Configuración › Plataformas del país, fila «Drop»).
 */
export async function cargarDatosDrop(supabase: SupabaseClient, pais: { id: string; codigo: string }, usuario: UsuarioActual): Promise<DatosDrop> {
  const porUsd = (await tasasUsd(supabase)).porUsd;
  const moneda = monedaPublicaciones(pais.codigo, porUsd);
  let filas: Fila[];
  try {
    filas = await traerTodasLasFilas<Fila>((d, h) =>
      supabase
        .from("drop_publicaciones")
        .select(
          "id, drop_id, codigo, nombre, sku_drop, estado, precio, inventario, foto_url, ultima_vez, producto:skus_maestros!drop_publicaciones_sku_maestro_id_fkey(id, codigo, nombre), sugerido:skus_maestros!drop_publicaciones_sugerido_sku_id_fkey(id, codigo, nombre)",
        )
        .eq("pais_id", pais.id)
        .eq("en_drop", true)
        .order("nombre")
        .order("id")
        .range(d, h),
    );
  } catch (e) {
    if (/drop_publicaciones|schema cache|does not exist/i.test(String((e as { message?: string })?.message ?? e))) return { publicaciones: [], moneda, ultimaLectura: null, fulfillment: null, faltaMigracion: true };
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

  // El fulfillment de Drop del país, pasado a la moneda de las publicaciones si se escribió en otra.
  const { data: plataformas } = await supabase.from("pais_plataformas").select("fulfillment, fulfillment_moneda, plataformas(nombre)").eq("pais_id", pais.id);
  const filaDrop = (plataformas ?? []).find((p) => uno(p.plataformas as unknown as { nombre: string } | null)?.nombre?.trim().toLowerCase() === "drop");
  const fulfillment =
    filaDrop?.fulfillment === null || filaDrop?.fulfillment === undefined
      ? null
      : fulfillmentEnMoneda(Number(filaDrop.fulfillment), String(filaDrop.fulfillment_moneda ?? "USD"), pais.codigo, porUsd);

  // Lo que viene en camino y lo que se cotiza de cada producto, en compras del país (lo mismo que muestra Gestión de IDs Dropi).
  const { camino, cotizando, etapasCotizando } = skuIds.length ? await cargarEnCamino(supabase, pais.id, usuario) : { camino: new Map(), cotizando: new Map(), etapasCotizando: new Map() };

  const publicaciones = filas.map((f): FilaPublicacionDrop => {
    const producto = uno(f.producto);
    const costo = producto ? (costos.get(producto.id) ?? null) : null;
    const precio = f.precio === null ? null : Number(f.precio);
    const m = margenDrop(precio, costo, fulfillment);
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
      inventario: f.inventario,
      producto,
      sugerido: producto ? null : uno(f.sugerido),
      costo,
      utilidad: m?.utilidad ?? null,
      margen: m?.margen ?? null,
      fulfillment,
      liquidacion: false,
      enCamino: viene?.unidades ?? 0,
      llegadaCamino: viene?.llegada ?? null,
      sinFechaCamino: viene?.sinFecha ?? 0,
      sinEnvioCamino: viene?.sinEnvio ?? 0,
      enCotizacion: producto ? (cotizando.get(producto.id) ?? 0) : 0,
      etapaCotizacion: producto ? (etapasCotizando.get(producto.id) ?? null) : null,
    };
  });
  const ultimaLectura = filas.reduce<string | null>((max, f) => (!max || f.ultima_vez > max ? f.ultima_vez : max), null);
  return { publicaciones, moneda, ultimaLectura, fulfillment, faltaMigracion: false };
}
