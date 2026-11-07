import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";

/**
 * Los códigos de un producto, para manejar el inventario y todo lo que lo involucre por código y no solo por nombre (7 nov 2026, pedido de Hernán): el **N.º correlativo** («#0123», corto,
 * único, lo pone el sistema) y el **código de barras** (el del fabricante o el interno). El SKU ya sale en cada pantalla. Sin React, con prueba; el componente es
 * `CodigosProducto` (`src/components/ui/codigos-producto.tsx`).
 */
export interface CodigosProducto {
  /** El N.º correlativo del producto, o null si todavía no lo tiene. */
  numero: number | null;
  /** El código de barras (del fabricante o interno), o null si no tiene. */
  barras: string | null;
}

/** «#0123»; vacío si no hay número. */
export const numeroProducto = (n: number | null | undefined): string => (n === null || n === undefined ? "" : `#${String(n).padStart(4, "0")}`);

/** Los códigos escritos juntos: «#0123 2000000012345». */
export const textoCodigos = (c: { numero?: number | null; barras?: string | null }): string => [numeroProducto(c.numero), c.barras ?? ""].filter(Boolean).join(" ");

const sinAcentos = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Si lo escrito en un buscador coincide con un producto: cada palabra aparece en lo que se busca (SKU, nombre…) o en sus códigos. El N.º se encuentra escrito de cualquier forma
 * («#0123», «0123», «123»); el código de barras, completo o por partes.
 */
export function coincideCodigo(consulta: string, texto: string, codigos: { numero?: number | null; barras?: string | null }): boolean {
  const palabras = sinAcentos(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const base = sinAcentos(texto);
  const barras = (codigos.barras ?? "").toLowerCase();
  const numero = codigos.numero === null || codigos.numero === undefined ? "" : String(codigos.numero);
  return palabras.every((p) => {
    if (base.includes(p) || (barras && barras.includes(p))) return true;
    const sinMarca = p.replace(/^#/, "");
    if (numero && /^\d+$/.test(sinMarca)) return sinMarca.replace(/^0+/, "") === numero;
    return false;
  });
}

/**
 * Los códigos de los productos pedidos (o de todos si no se pasa ninguno), por id. Si la consulta falla (por ejemplo una columna que falta), devuelve lo que pudo: nunca rompe la
 * pantalla que los muestra.
 */
export async function cargarCodigosProductos(supabase: SupabaseClient, ids?: readonly string[]): Promise<Map<string, CodigosProducto>> {
  const mapa = new Map<string, CodigosProducto>();
  const guardar = (filas: { id: string; numero: number | null; codigo_barras: string | null }[]) => {
    for (const f of filas) mapa.set(f.id, { numero: f.numero === null || f.numero === undefined ? null : Number(f.numero), barras: f.codigo_barras || null });
  };
  try {
    if (ids === undefined) {
      const r = await traerTodasConError<{ id: string; numero: number | null; codigo_barras: string | null }>((d, h) => supabase.from("skus_maestros").select("id, numero, codigo_barras").order("id").range(d, h));
      guardar(r.data ?? []);
      return mapa;
    }
    const unicos = [...new Set(ids)];
    for (let i = 0; i < unicos.length; i += 150) {
      const { data } = await supabase.from("skus_maestros").select("id, numero, codigo_barras").in("id", unicos.slice(i, i + 150));
      guardar((data ?? []) as { id: string; numero: number | null; codigo_barras: string | null }[]);
    }
  } catch {
    // Sin códigos: la pantalla se ve igual.
  }
  return mapa;
}
