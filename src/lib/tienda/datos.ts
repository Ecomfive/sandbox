// Gestión de tienda (3 nov 2026): lo que leen sus páginas de la base (migración 0224). Todo es de las tiendas del país elegido arriba; por ahora se
// trabaja con las de Panamá (Kenku primero). Sin la migración, las páginas dicen que falta correrla en vez de romperse.

import type { Programado } from "./programado";
import type { EntregaMonday } from "./entregas-monday";
import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { esEstadoPedido, type EstadoPedido, type PedidoResumen } from "./resumen";
import { leerPeriodo, sumarDias, type EleccionPeriodo } from "./rango";

export interface Tienda {
  id: string;
  nombre: string;
  moneda: string;
  dominio: string | null;
  estado: "por_conectar" | "conectada" | "pausada";
  permiso: string;
  conectadaEn: string | null;
  ultimoAvisoEn: string | null;
  ultimaRevisionEn: string | null;
  pedidosSistema: number | null;
  pedidosShopify: number | null;
  conciliadoEn: string | null;
}

/** Las tiendas del país, en su orden. `faltaMigracion` si la tabla todavía no existe. */
export async function cargarTiendas(supabase: SupabaseClient, paisId: string): Promise<{ tiendas: Tienda[]; faltaMigracion: boolean }> {
  const { data, error } = await supabase
    .from("tiendas")
    .select("id, nombre, moneda, dominio, estado, permiso, conectada_en, ultimo_aviso_en, ultima_revision_en, pedidos_sistema, pedidos_shopify, conciliado_en")
    .eq("pais_id", paisId)
    .order("orden")
    .order("nombre");
  if (error) return { tiendas: [], faltaMigracion: true };
  return {
    faltaMigracion: false,
    tiendas: (data ?? []).map((t) => ({
      id: t.id as string,
      nombre: t.nombre as string,
      moneda: t.moneda as string,
      dominio: (t.dominio as string | null) ?? null,
      estado: t.estado as Tienda["estado"],
      permiso: t.permiso as string,
      conectadaEn: (t.conectada_en as string | null) ?? null,
      ultimoAvisoEn: (t.ultimo_aviso_en as string | null) ?? null,
      ultimaRevisionEn: (t.ultima_revision_en as string | null) ?? null,
      pedidosSistema: (t.pedidos_sistema as number | null) ?? null,
      pedidosShopify: (t.pedidos_shopify as number | null) ?? null,
      conciliadoEn: (t.conciliado_en as string | null) ?? null,
    })),
  };
}

/** La tienda elegida en la barra (`?tienda=<id>`): si no es del país, todas. */
export function tiendaElegida(tiendas: Tienda[], param: string | string[] | undefined): Tienda | null {
  return typeof param === "string" ? (tiendas.find((t) => t.id === param) ?? null) : null;
}

/**
 * El periodo elegido en la dirección (`?periodo=` con un atajo, o `?periodo=rango&desde=&hasta=`; 12 nov 2026: el selector de fechas con calendario,
 * src/lib/tienda/rango.ts). Sus días se calculan al cargar, con el «hoy» de las tiendas que se miran (`pedidosDeTiendas`).
 */
export function periodoElegido(sp: { periodo?: string | string[]; desde?: string | string[]; hasta?: string | string[] }): EleccionPeriodo {
  return leerPeriodo(sp.periodo, sp.desde, sp.hasta);
}

/** El primer día (AAAA-MM-DD, en Panamá) de un periodo de `dias` días que termina hoy. */
export function inicioPeriodo(dias: number, hoy = new Date()): string {
  const d = new Date(hoy.getTime() - (dias - 1) * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Panama" });
}

export interface PedidoFila extends PedidoResumen {
  id: string;
  /** Sin hora: la orden vino del Excel de Finanzas, que solo trae el día (`creado` es el mediodía de ese día). */
  sinHora?: boolean;
  /** Los productos del pedido, para la lista («Magnesio +1»). */
  productos?: string | null;
  /** La foto del primer producto (la de Shopify, por el SKU de la línea), o null. */
  foto?: string | null;
  /** Cada producto del pedido, para filtrar por producto. */
  productosLista?: string[];
  /** La dirección del cliente (sin la zona). */
  direccion?: string | null;
  /** Las etiquetas de Shopify de la orden. */
  etiquetas?: string[];
  /** Los 4 últimos dígitos del teléfono del cliente (para cruzar los chats de iComfly, que dan el número oculto); null sin teléfono. */
  colaTel?: string | null;
  /** Cuántos pedidos tiene el cliente en total (por su teléfono), contando este; null sin teléfono. */
  pedidosCliente?: number | null;
  /** Por dónde entró (como en Mi Reto Digital): «bot» si lo tomó el bot por WhatsApp (etiqueta «chatbot»), «shopify» si entró por la tienda; null si vino del Excel. */
  entrada?: "bot" | "shopify" | null;
  /** El riesgo del cliente por su historial (la misma regla de Finanzas): «bajo» (nada en contra, o su primer pedido), «medio» o «alto»; null si no se sabe (sin teléfono). */
  riesgo?: "bajo" | "medio" | "alto" | null;
  /** El día que pidió el cliente, leído de la nota del pedido en Shopify («para el jueves 19/11»); null si no hay (12 nov 2026). */
  programado?: Programado | null;
  /** La entrega registrada en Monday (ciudad), si la hay: solo en Logística (12 nov 2026). */
  entrega?: EntregaMonday | null;
  tiendaId: string;
  numero: string;
  cliente: string | null;
  provincia: string | null;
  ciudad: string | null;
  moneda: string;
  transportista: string | null;
  guia: string | null;
}

/** Los pedidos de esas tiendas desde `desde` hasta `hasta` (AAAA-MM-DD en Panamá; sin `hasta`, hasta hoy), del más nuevo al más viejo. */
export async function cargarPedidos(supabase: SupabaseClient, tiendaIds: string[], desde: string, hasta?: string): Promise<PedidoFila[]> {
  if (!tiendaIds.length) return [];
  const filas = await traerTodasLasFilas<{
    id: string;
    tienda_id: string;
    numero: string;
    creado_shopify: string;
    cliente_nombre: string | null;
    provincia: string | null;
    ciudad: string | null;
    moneda: string;
    total: number;
    unidades: number;
    estado: string;
    transportista: string | null;
    guia: string | null;
  }>((d, h) =>
    supabase
      .from("tienda_pedidos")
      .select("id, tienda_id, numero, creado_shopify, cliente_nombre, provincia, ciudad, moneda, total, unidades, estado, transportista, guia")
      .in("tienda_id", tiendaIds)
      .gte("creado_shopify", `${desde}T05:00:00Z`)
      // El día de Panamá termina a las 5:00 UTC del siguiente.
      .lt("creado_shopify", `${sumarDias(hasta ?? "2999-12-30", 1)}T05:00:00Z`)
      .order("creado_shopify", { ascending: false })
      .order("id")
      .range(d, h),
  ).catch(() => []);
  return filas.map((f) => ({
    id: f.id,
    tiendaId: f.tienda_id,
    numero: f.numero,
    creado: f.creado_shopify,
    cliente: f.cliente_nombre,
    provincia: f.provincia,
    ciudad: f.ciudad,
    moneda: f.moneda,
    total: Number(f.total) || 0,
    unidades: Number(f.unidades) || 0,
    estado: (esEstadoPedido(f.estado) ? f.estado : "nuevo") as EstadoPedido,
    transportista: f.transportista,
    guia: f.guia,
  }));
}

export interface VarianteFila {
  id: string;
  tiendaId: string;
  shopifyVarianteId: number;
  productoTitulo: string;
  varianteTitulo: string | null;
  sku: string | null;
  precio: number | null;
  foto: string | null;
  huella: string | null;
  skuMaestroId: string | null;
  noFisico: boolean;
  enShopify: boolean;
}

/** Las variantes de Shopify de esas tiendas, con su vínculo. */
export async function cargarVariantes(supabase: SupabaseClient, tiendaIds: string[]): Promise<VarianteFila[]> {
  if (!tiendaIds.length) return [];
  const filas = await traerTodasLasFilas<{
    id: string;
    tienda_id: string;
    shopify_variante_id: number;
    producto_titulo: string;
    variante_titulo: string | null;
    sku: string | null;
    precio: number | null;
    foto_url: string | null;
    foto_huella: string | null;
    sku_maestro_id: string | null;
    no_fisico: boolean;
    en_shopify: boolean;
  }>((d, h) =>
    supabase
      .from("tienda_variantes")
      .select("id, tienda_id, shopify_variante_id, producto_titulo, variante_titulo, sku, precio, foto_url, foto_huella, sku_maestro_id, no_fisico, en_shopify")
      .in("tienda_id", tiendaIds)
      .order("producto_titulo")
      .order("id")
      .range(d, h),
  ).catch(() => []);
  return filas.map((f) => ({
    id: f.id,
    tiendaId: f.tienda_id,
    shopifyVarianteId: Number(f.shopify_variante_id),
    productoTitulo: f.producto_titulo,
    varianteTitulo: f.variante_titulo,
    sku: f.sku,
    precio: f.precio === null ? null : Number(f.precio),
    foto: f.foto_url,
    huella: f.foto_huella,
    skuMaestroId: f.sku_maestro_id,
    noFisico: f.no_fisico,
    enShopify: f.en_shopify,
  }));
}

/** Cuántos de esos pedidos siguen por confirmar después de `horas` horas desde que entraron (por defecto, un día). */
export function sinConfirmarDesde(pedidos: Pick<PedidoFila, "estado" | "creado">[], horas = 24, ahora = Date.now()): number {
  return pedidos.filter((p) => p.estado === "nuevo" && ahora - Date.parse(p.creado) > horas * 3_600_000).length;
}
