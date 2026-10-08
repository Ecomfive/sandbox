"use server";

import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { puedeVerPais } from "@/lib/paises-permitidos";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/** Una compra de un producto: la línea de la orden y lo principal de la orden. */
export interface CompraDeProducto {
  compraId: string;
  numero: number;
  codigo: string | null;
  fecha: string;
  pais: string | null;
  etapa: string;
  /** El SKU de la línea (en un producto con variantes, la variante comprada). */
  sku: string;
  variante: string | null;
  unidades: number;
  costoUnitario: number | null;
  total: number | null;
  lote: number;
}

/**
 * El histórico de compras de un producto: cada orden en la que está vinculado (Compras › Productos), de la más nueva a la
 * más vieja. Un producto con variantes suma las compras de sus variantes. Lo pueden ver quienes abren Producto o Inventario,
 * y cada uno solo las de sus países permitidos.
 * Devuelve el error como valor.
 */
export async function obtenerComprasProducto(id: string): Promise<{ compras: CompraDeProducto[] } | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !(usuario.modulos.includes("producto") || usuario.modulos.includes("inventario"))) return { error: "No tienes acceso." };
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: variantes } = await supabase.from("skus_maestros").select("id").eq("padre_id", id);
  const ids = [id, ...(variantes ?? []).map((v) => v.id as string)];
  const { data, error } = await supabase
    .from("wms_compra_items")
    .select("cantidad_pedida, costo_unitario, lote_numero, sku_maestro_id, skus_maestros(codigo, nombre, opciones), wms_compras(id, numero, codigo, etapa, creado_en, paises(codigo))")
    .in("sku_maestro_id", ids);
  if (error) return { error: "No se pudieron cargar las compras." };
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const compras: CompraDeProducto[] = (data ?? [])
    .map((l) => {
      const c = uno(l.wms_compras as unknown as { id: string; numero: number; codigo: string | null; etapa: string; creado_en: string; paises: { codigo: string } | { codigo: string }[] | null } | null);
      const sku = uno(l.skus_maestros as unknown as { codigo: string; nombre: string; opciones: Record<string, string> | null } | null);
      if (!c) return null;
      const unidades = Number(l.cantidad_pedida);
      const costo = l.costo_unitario === null ? null : Number(l.costo_unitario);
      return {
        compraId: c.id,
        numero: c.numero,
        codigo: c.codigo,
        fecha: c.creado_en,
        pais: uno(c.paises)?.codigo ?? null,
        etapa: c.etapa,
        sku: sku?.codigo ?? "",
        variante: l.sku_maestro_id !== id && sku?.opciones ? Object.values(sku.opciones).join(" / ") : null,
        unidades,
        costoUnitario: costo,
        total: costo === null ? null : Math.round(unidades * costo * 100) / 100,
        lote: Number(l.lote_numero),
      };
    })
    .filter((c): c is CompraDeProducto => c !== null)
    // Solo las de los países que la persona puede ver (migración 0087). Estas compras son siempre de un país.
    .filter((c) => puedeVerPais(usuario.paisesPermitidos, c.pais))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  return { compras };
}
