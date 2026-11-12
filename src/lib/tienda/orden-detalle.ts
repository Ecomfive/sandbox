// El detalle de una orden de tienda (de `ven_ordenes`: Excel de Finanzas o Shopify en vivo), para la ficha lateral de Pedidos y para su página
// (12 nov 2026). Solo lectura. Solo órdenes de tiendas del país que se pide (si no, null).

import type { SupabaseClient } from "@supabase/supabase-js";
import { costosDeProductos, cuentasDelPedido, type CostoProducto, type IngresosYCostos } from "./costos";
import { hayHoraDeShopify } from "./datos-finanzas";
import { nombreComparable } from "./ordenes-finanzas";

export interface OrdenFinanzas {
  numero: string | null;
  fecha: string;
  estado_entrega: string | null;
  etiquetas: string | null;
  subtotal: number | null;
  descuento: number | null;
  envio: number | null;
  total: number | null;
  estado_pago: string | null;
  forma_pago_texto: string | null;
  transportista: string | null;
  guia: string | null;
  fecha_envio: string | null;
  fecha_devolucion: string | null;
  resultado_courier: string | null;
  motivo_cancelacion: string | null;
  origen: string | null;
  /** La hora en que se creó en Shopify (migración 0276); null en las del Excel. */
  creado_origen?: string | null;
  /** Cuándo entró al sistema. */
  creado_en?: string | null;
}

export interface ClienteOrdenFinanzas {
  nombre: string | null;
  telefono: string | null;
  direccion: string | null;
  corregimiento: string | null;
  notas: string | null;
}

export interface LineaOrdenFinanzas {
  linea: number;
  producto: string | null;
  cantidad: number | null;
  precio: number | null;
  es_servicio: boolean | null;
  sku_maestro_id?: string | null;
  skus_maestros: { codigo: string; nombre: string } | null;
  /** El costo por unidad del producto nuestro en el país (y de dónde salió), si se sabe. */
  costo?: CostoProducto | null;
}

export interface OrdenTienda {
  id: string;
  o: OrdenFinanzas;
  lineas: LineaOrdenFinanzas[];
  cliente: ClienteOrdenFinanzas | null;
  /** El estado de entrega de los otros pedidos del mismo cliente. */
  anteriores: (string | null)[];
  /** El pedido en el admin de Shopify (solo si llegó de Shopify y la tienda está conectada). */
  enShopify: string | null;
  /** El nombre de la tienda como está en Tiendas («Kenku»). */
  tienda: string;
  /** «Ingresos y costos» (12 nov 2026): venta, costo de los productos, fulfillment, flete y margen. */
  cuentas: IngresosYCostos;
}

export async function cargarOrdenTienda(supabase: SupabaseClient, id: string, paisId: string): Promise<OrdenTienda | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  // Con la migración 0276, también la hora de Shopify (texto armado: se declara como `string`).
  const columnas: string = `numero, fecha, estado_entrega, etiquetas, subtotal, descuento, envio, total, estado_pago, forma_pago_texto, transportista, guia, fecha_envio, fecha_devolucion, resultado_courier, motivo_cancelacion, origen, costo_envio, costo_envio_real, ${(await hayHoraDeShopify(supabase)) ? "creado_origen, " : ""}creado_en, fin_unidades(nombre, pais_id, clase, tarifa_fulfillment)`;
  const { data: crudo } = await supabase.from("ven_ordenes").select(columnas).eq("id", id).maybeSingle();
  const o = crudo as unknown as (OrdenFinanzas & { fin_unidades: unknown; costo_envio?: number | null; costo_envio_real?: number | null }) | null;
  const unidad = (o?.fin_unidades ?? null) as { nombre: string; pais_id: string; clase: string; tarifa_fulfillment: number | null } | null;
  if (!o || !unidad || unidad.clase !== "tienda" || unidad.pais_id !== paisId) return null;
  const [{ data: lineas }, { data: tiendasPais }, { data: cliente }] = await Promise.all([
    supabase.from("ven_orden_lineas").select("linea, producto, cantidad, precio, es_servicio, sku_maestro_id, skus_maestros(codigo, nombre)").eq("orden_id", id).order("linea"),
    supabase.from("tiendas").select("nombre, dominio").eq("pais_id", paisId),
    supabase.from("ven_ordenes_clientes").select("nombre, telefono, direccion, corregimiento, notas, telefono_clave").eq("orden_id", id).maybeSingle(),
  ]);
  // Los otros pedidos del mismo cliente (por su teléfono normalizado), como en Mi Reto Digital: cuántos y cuántos se entregaron.
  const clave = (cliente as { telefono_clave?: string | null } | null)?.telefono_clave ?? null;
  const { data: otros } = clave
    ? await supabase.from("ven_ordenes_clientes").select("orden_id, ven_ordenes(estado_entrega)").eq("telefono_clave", clave).neq("orden_id", id).limit(200)
    : { data: [] };
  const anteriores = (otros ?? []).map((x) => {
    const r = (Array.isArray(x.ven_ordenes) ? x.ven_ordenes[0] : x.ven_ordenes) as { estado_entrega: string | null } | null;
    return r?.estado_entrega ?? null;
  });
  const tiendaSistema = (tiendasPais ?? []).find((t) => nombreComparable(t.nombre as string) === nombreComparable(unidad.nombre));
  const dominio = (tiendaSistema?.dominio as string | null | undefined) ?? null;
  const enShopify = o.origen === "shopify" && dominio && o.numero ? `https://${dominio}/admin/orders?query=${encodeURIComponent(String(o.numero).replace(/^#/, ""))}` : null;
  // Ingresos y costos: el costo de cada producto en el país (el costo promedio de compra del producto: del país o, si no hay, de todos), el fulfillment de la unidad y el flete del pedido.
  const lineasT = (lineas ?? []) as unknown as LineaOrdenFinanzas[];
  const costos = await costosDeProductos(supabase, lineasT.map((l) => l.sku_maestro_id ?? "").filter(Boolean), paisId);
  for (const l of lineasT) l.costo = l.sku_maestro_id ? (costos.get(l.sku_maestro_id) ?? null) : null;
  const flete = Number(o.costo_envio_real) > 0 ? Number(o.costo_envio_real) : Number(o.costo_envio) > 0 ? Number(o.costo_envio) : null;
  const cuentas = cuentasDelPedido(
    Number(o.total) || 0,
    lineasT.map((l) => ({ skuId: l.sku_maestro_id ?? null, cantidad: Number(l.cantidad) || 0, esServicio: l.es_servicio === true })),
    costos,
    unidad.tarifa_fulfillment === null || unidad.tarifa_fulfillment === undefined ? null : Number(unidad.tarifa_fulfillment),
    flete,
  );
  const orden: OrdenFinanzas & { fin_unidades?: unknown; costo_envio?: unknown; costo_envio_real?: unknown } = { ...o };
  delete orden.fin_unidades;
  delete orden.costo_envio;
  delete orden.costo_envio_real;
  const datosCliente: ClienteOrdenFinanzas & { telefono_clave?: string | null } = { ...((cliente ?? {}) as ClienteOrdenFinanzas & { telefono_clave?: string | null }) };
  delete datosCliente.telefono_clave;
  return {
    id,
    o: orden,
    lineas: lineasT,
    cliente: cliente ? (datosCliente as ClienteOrdenFinanzas) : null,
    anteriores,
    enShopify,
    tienda: ((tiendaSistema?.nombre as string | undefined) ?? unidad.nombre) as string,
    cuentas,
  };
}
