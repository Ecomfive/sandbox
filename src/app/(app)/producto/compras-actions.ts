"use server";

import { getUsuarioActual } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { campoOculto, dentroDelAlcance, restriccionesDe } from "../compras/permisos-compras";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/** Una compra de un producto: la línea de la orden y lo principal de la orden. */
export interface CompraDeProducto {
  compraId: string;
  numero: number;
  codigo: string | null;
  /** Cuándo se pidió (se creó la orden). */
  fecha: string;
  /** Cuándo llegó (la «Fecha de llegada» de la compra); null si todavía no llega. */
  llegada: string | null;
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
 * y cada uno solo las de sus países permitidos. También un administrador que abre Gestión de IDs Dropi (la ficha de una publicación
 * le muestra las compras del producto vinculado; a quien no es administrador se le rechaza aquí, no solo en la pantalla).
 * Devuelve el error como valor.
 */
export async function obtenerComprasProducto(id: string): Promise<{ compras: CompraDeProducto[] } | { error: string }> {
  const usuario = await getUsuarioActual();
  const comoAdminDeGestion = !!usuario && usuario.modulos.includes("publicaciones-dropi") && esAdministrador(usuario);
  if (!usuario || !(usuario.modulos.includes("producto") || usuario.modulos.includes("inventario") || comoAdminDeGestion)) return { error: "No tienes acceso." };
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: variantes } = await supabase.from("skus_maestros").select("id").eq("padre_id", id);
  const ids = [id, ...(variantes ?? []).map((v) => v.id as string)];
  const { data, error } = await supabase
    .from("wms_compra_items")
    .select("cantidad_pedida, costo_unitario, lote_numero, sku_maestro_id, skus_maestros(codigo, nombre, opciones), wms_compras(id, numero, codigo, etapa, creado_en, fecha_llegada, anulada_en, asignado_a, creado_por, responsable_nombre, creador_nombre, paises(codigo))")
    .in("sku_maestro_id", ids);
  if (error) return { error: "No se pudieron cargar las compras." };
  // Lo que su rol tiene limitado en Compras (Usuarios y roles › Afinar) vale también aquí: sin ver el monto no se ven los costos, y
  // solo se ven las compras que alcanza.
  const limites = restriccionesDe(usuario.afinado.compras);
  const verCostos = !campoOculto(limites, "monto");
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const compras: CompraDeProducto[] = (data ?? [])
    .map((l) => {
      const c = uno(l.wms_compras as unknown as { id: string; numero: number; codigo: string | null; etapa: string; creado_en: string; fecha_llegada: string | null; anulada_en: string | null; asignado_a: string | null; creado_por: string | null; responsable_nombre: string | null; creador_nombre: string | null; paises: { codigo: string } | { codigo: string }[] | null } | null);
      const sku = uno(l.skus_maestros as unknown as { codigo: string; nombre: string; opciones: Record<string, string> | null } | null);
      if (!c || c.anulada_en) return null; // una compra anulada no cuenta en el histórico
      if (!dentroDelAlcance(limites.alcance, { asignadoId: c.asignado_a, creadoPorId: c.creado_por, responsableNombre: c.responsable_nombre, creadorNombre: c.creador_nombre }, usuario)) return null;
      const unidades = Number(l.cantidad_pedida);
      const costo = !verCostos || l.costo_unitario === null ? null : Number(l.costo_unitario);
      return {
        compraId: c.id,
        numero: c.numero,
        codigo: c.codigo,
        fecha: c.creado_en,
        llegada: c.fecha_llegada,
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
