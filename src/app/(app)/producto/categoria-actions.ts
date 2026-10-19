"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { rutaLegible } from "@/lib/categorias/taxonomia";

const MODULO = "producto";
const ES_ID = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const ES_CATEGORIA = (v: string) => /^[a-z]{2}(-\d+)*$/.test(v);

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export interface OpcionCategoria {
  id: string;
  ruta: string;
}

/**
 * Busca en la taxonomía de Shopify (migración 0113) por palabras: cada palabra debe aparecer en la ruta («crema facial» →
 * «… Cuidado de la piel > Cremas hidratantes faciales»). Las más generales primero. Basta poder abrir Producto.
 */
export async function buscarCategorias(texto: string): Promise<OpcionCategoria[]> {
  await requireModulo(MODULO);
  // Solo letras, números y espacios: lo escrito no se arma crudo dentro del filtro.
  const palabras = String(texto ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 2)
    .slice(0, 5);
  if (!palabras.length) return [];
  let q = createServiceClient().from("categorias_productos").select("id, ruta");
  // Sin importar tildes: cada vocal es un comodín de una letra («audifonos» encuentra «Audífonos»).
  for (const p of palabras) q = q.ilike("ruta", `%${sinTildes(p).replace(/[aeiou]/g, "_")}%`);
  const { data } = await q.order("nivel").order("ruta").limit(30);
  return (data ?? []) as OpcionCategoria[];
}

/**
 * Pone (o quita, con null) la categoría de un producto. La elegida por una persona queda como «manual» y ya no está por
 * revisar. Con `confirmar` solo marca como revisada la que ya tenía. Queda en la actividad del producto.
 */
export async function cambiarCategoriaProducto(id: string, categoriaId: string | null, confirmar = false): Promise<{ error?: string; ruta?: string | null }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  if (categoriaId !== null && !ES_CATEGORIA(categoriaId)) return { error: "Categoría no válida." };
  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase.from("skus_maestros").select("categoria_id, categoria_revisar, categorias_productos(ruta)").eq("id", id).maybeSingle();
  if (errorAntes) return { error: "Falta correr la migración 0113 en Supabase." };
  if (!antes) return { error: "No se encontró el producto." };
  const rutaAntes = (Array.isArray(antes.categorias_productos) ? antes.categorias_productos[0] : antes.categorias_productos)?.ruta ?? null;

  if (confirmar) {
    if (!antes.categoria_id || !antes.categoria_revisar) return { ruta: rutaAntes };
    const { error } = await supabase.from("skus_maestros").update({ categoria_revisar: false, categoria_origen: "manual" }).eq("id", id);
    if (error) return { error: "No se pudo confirmar la categoría." };
    await registrarAuditoria({ accion: "confirmar_categoria_producto", entidad: "skus_maestros", entidadId: id, detalle: rutaLegible(rutaAntes ?? "") });
    revalidatePath("/producto");
    return { ruta: rutaAntes };
  }

  let ruta: string | null = null;
  if (categoriaId) {
    const { data: cat } = await supabase.from("categorias_productos").select("ruta").eq("id", categoriaId).maybeSingle();
    if (!cat) return { error: "Esa categoría no existe." };
    ruta = cat.ruta as string;
  }
  if (antes.categoria_id === categoriaId && !antes.categoria_revisar) return { ruta };
  const { error } = await supabase
    .from("skus_maestros")
    .update({ categoria_id: categoriaId, categoria_origen: categoriaId ? "manual" : null, categoria_revisar: false })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar la categoría." };
  await registrarAuditoria({
    accion: "cambiar_categoria_producto",
    entidad: "skus_maestros",
    entidadId: id,
    antes: { Categoría: rutaAntes ? rutaLegible(rutaAntes) : "Sin categoría" },
    despues: { Categoría: ruta ? rutaLegible(ruta) : "Sin categoría" },
  });
  revalidatePath("/producto");
  return { ruta };
}
