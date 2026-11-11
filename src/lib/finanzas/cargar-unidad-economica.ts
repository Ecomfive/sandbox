// Lectura de la unidad económica de Rentabilidad (migraciones 0933 y 0934). Las sumas las hace Postgres (`fin_ue_*`):
// aquí solo se llaman y se leen. Sin las migraciones devuelve `{ error }` y la página lo avisa. Solo lectura; los permisos
// los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAVE_SUPUESTOS_UE, filaUE, leerSupuestosUE, type FilaUE, type SupuestosUE } from "./unidad-economica";

export const SIN_MIGRACION_UE = "Falta correr las migraciones 0933 y 0934 (unidad económica) en Supabase.";

export type AgrupacionUE = "producto" | "zona" | "repartidor" | "tienda" | "mes" | "metodo" | "estado" | "tamano";

const num = (v: unknown) => Number(v ?? 0) || 0;

export interface RangoUE {
  /** Primer mes («AAAA-MM-01»). */
  desde: string;
  /** Último mes («AAAA-MM-01»). */
  hasta: string;
  /** Tiendas a mirar (null = todas). */
  unidades: string[] | null;
}

export async function cargarSupuestosUE(supabase: SupabaseClient): Promise<{ supuestos: SupuestosUE; guardados: boolean }> {
  const { data, error } = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_SUPUESTOS_UE).maybeSingle();
  return { supuestos: leerSupuestosUE(error ? null : data?.valor), guardados: !error && !!data };
}

export async function cargarAgrupado(supabase: SupabaseClient, r: RangoUE, por: AgrupacionUE): Promise<FilaUE[] | { error: string }> {
  const { data, error } = await supabase.rpc("fin_ue_agrupado", { p_desde: r.desde, p_hasta: r.hasta, p_unidades: r.unidades, p_por: por });
  if (error) {
    console.error("fin_ue_agrupado:", error.message);
    return { error: SIN_MIGRACION_UE };
  }
  return ((data ?? []) as Record<string, unknown>[]).map(filaUE);
}

export interface PedidoUE {
  ordenId: string;
  unidadId: string;
  numero: string;
  fecha: string;
  estado: string;
  metodo: string | null;
  repartidor: string | null;
  zona: string;
  productos: number;
  producto: string;
  ventas: number;
  mercancia: number;
  envio: number;
  envioSupuesto: boolean;
  devolucion: number;
  comision: number;
  marketing: number;
  margen: number;
}

export async function cargarPedidos(supabase: SupabaseClient, r: RangoUE, limite = 500): Promise<PedidoUE[] | { error: string }> {
  const { data, error } = await supabase.rpc("fin_ue_pedidos", {
    p_desde: r.desde,
    p_hasta: r.hasta,
    p_unidades: r.unidades,
    p_limite: limite,
    p_solo_perdida: true,
  });
  if (error) {
    console.error("fin_ue_pedidos:", error.message);
    return { error: SIN_MIGRACION_UE };
  }
  return ((data ?? []) as Record<string, unknown>[]).map((p) => ({
    ordenId: String(p.orden_id),
    unidadId: String(p.unidad_id),
    numero: String(p.numero ?? ""),
    fecha: String(p.fecha ?? "").slice(0, 10),
    estado: String(p.estado_entrega ?? ""),
    metodo: p.metodo_pago ? String(p.metodo_pago) : null,
    repartidor: p.repartidor ? String(p.repartidor) : null,
    zona: String(p.zona ?? ""),
    productos: num(p.productos),
    producto: String(p.producto ?? ""),
    ventas: num(p.ventas),
    mercancia: num(p.mercancia),
    envio: num(p.envio),
    envioSupuesto: p.envio_supuesto === true,
    devolucion: num(p.devolucion),
    comision: num(p.comision),
    marketing: num(p.marketing),
    margen: num(p.margen),
  }));
}

export interface CampanaUE {
  campana: string;
  conjunto: string;
  unidadId: string | null;
  productoClave: string | null;
  asignacion: string;
  gasto: number;
  compras: number;
  desde: string;
  hasta: string;
  dias: number;
}

export interface MarketingTiendaUE {
  unidadId: string;
  marketingLibro: number;
  metaLibro: number;
  gastoCampanas: number;
  comprasCampanas: number;
  gastoCampanasProducto: number;
}

export interface ReglaMeta {
  id: string;
  patron: string;
  unidadId: string;
  productoClave: string | null;
  prioridad: number;
  activo: boolean;
}

export interface DatosMarketingUE {
  campanas: CampanaUE[];
  porTienda: MarketingTiendaUE[];
  reglas: ReglaMeta[];
  ultimaImportacion: string | null;
}

export async function cargarMarketingUE(supabase: SupabaseClient, r: RangoUE): Promise<DatosMarketingUE | { error: string }> {
  const [camp, tienda, reglas, ultima] = await Promise.all([
    supabase.rpc("fin_ue_campanas", { p_desde: r.desde, p_hasta: r.hasta }),
    supabase.rpc("fin_ue_marketing_tienda", { p_desde: r.desde, p_hasta: r.hasta, p_unidades: r.unidades }),
    supabase.from("mkt_meta_reglas").select("id, patron, unidad_id, producto_clave, prioridad, activo").order("prioridad").order("patron"),
    supabase.from("mkt_meta_campanas").select("actualizado_en").order("actualizado_en", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (camp.error || tienda.error || reglas.error) {
    console.error("marketing unidad económica:", camp.error?.message ?? tienda.error?.message ?? reglas.error?.message);
    return { error: SIN_MIGRACION_UE };
  }
  const visibles = r.unidades ? new Set(r.unidades) : null;
  return {
    campanas: ((camp.data ?? []) as Record<string, unknown>[])
      .map((c) => ({
        campana: String(c.campana ?? ""),
        conjunto: String(c.conjunto ?? ""),
        unidadId: c.unidad_id ? String(c.unidad_id) : null,
        productoClave: c.producto_clave ? String(c.producto_clave) : null,
        asignacion: String(c.asignacion ?? "sin_asignar"),
        gasto: num(c.gasto),
        compras: num(c.compras),
        desde: String(c.desde ?? "").slice(0, 10),
        hasta: String(c.hasta ?? "").slice(0, 10),
        dias: num(c.dias),
      }))
      // Con una tienda o una entidad elegida, solo sus campañas (y las que todavía no tienen tienda).
      .filter((c) => !visibles || !c.unidadId || visibles.has(c.unidadId)),
    porTienda: ((tienda.data ?? []) as Record<string, unknown>[]).map((t) => ({
      unidadId: String(t.unidad_id),
      marketingLibro: num(t.marketing_libro),
      metaLibro: num(t.meta_libro),
      gastoCampanas: num(t.gasto_campanas),
      comprasCampanas: num(t.compras_campanas),
      gastoCampanasProducto: num(t.gasto_campanas_producto),
    })),
    reglas: ((reglas.data ?? []) as Record<string, unknown>[]).map((g) => ({
      id: String(g.id),
      patron: String(g.patron),
      unidadId: String(g.unidad_id),
      productoClave: g.producto_clave ? String(g.producto_clave) : null,
      prioridad: num(g.prioridad),
      activo: g.activo !== false,
    })),
    ultimaImportacion: ultima.data?.actualizado_en ? String(ultima.data.actualizado_en) : null,
  };
}
