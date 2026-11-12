import type { SupabaseClient } from "@supabase/supabase-js";
import { armarVentasPlataforma, type PlataformaVentas, type PublicacionPlataforma, type VentasDePlataforma } from "@/lib/publicaciones/ventas-plataformas";
import { traerTodasConError } from "@/lib/supabase/paginar";

type SkuFila = { codigo: string; nombre: string | null; numero: number | null; codigo_barras: string | null } | null;

const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const skuDe = (v: unknown): PublicacionPlataforma["sku"] => {
  const s = uno(v as SkuFila | SkuFila[]);
  return s?.codigo ? { codigo: s.codigo, nombre: s.nombre || s.codigo, numero: s.numero ?? null, barras: s.codigo_barras || null } : null;
};

/**
 * Las ventas de Drop o Effi de un país (migración 0244) con sus publicaciones (`drop_publicaciones`, `effi_publicaciones`: nombre, stock y producto del sistema), en la
 * forma del tablero de Ventas Proveeduría. `null` si no se pudo leer (sin la migración, por ejemplo). Las publicaciones se unen a Producto por `sku_maestro_id`: también tienen
 * `sugerido_sku_id`, y sin decir cuál la consulta falla.
 */
export async function cargarVentasPlataforma(supabase: SupabaseClient, paisId: string, plataforma: PlataformaVentas): Promise<VentasDePlataforma | null> {
  const ventas = traerTodasConError<{ producto_id: string; dia: string; salidas: number; devueltas: number }>((d, h) =>
    supabase.from("plataforma_ventas_diarias").select("producto_id, dia, salidas, devueltas").eq("pais_id", paisId).eq("plataforma", plataforma).order("dia").order("producto_id").range(d, h),
  );
  const pubs =
    plataforma === "dunamixfy"
      ? traerTodasConError<Record<string, unknown>>((d, h) =>
          supabase.from("dunamixfy_publicaciones").select("dunamixfy_id, nombre, stock, en_dunamixfy, skus_maestros!sku_maestro_id(codigo, nombre, numero, codigo_barras)").eq("pais_id", paisId).order("id").range(d, h),
        )
      : plataforma === "drop"
      ? traerTodasConError<Record<string, unknown>>((d, h) =>
          supabase.from("drop_publicaciones").select("drop_id, codigo, nombre, inventario, inventario_exclusivo, en_drop, skus_maestros!sku_maestro_id(codigo, nombre, numero, codigo_barras)").eq("pais_id", paisId).order("id").range(d, h),
        )
      : traerTodasConError<Record<string, unknown>>((d, h) =>
          supabase.from("effi_publicaciones").select("effi_id, nombre, stock_principal, en_effi, skus_maestros!sku_maestro_id(codigo, nombre, numero, codigo_barras)").eq("pais_id", paisId).order("id").range(d, h),
        );
  const [v, p] = await Promise.all([ventas, pubs]);
  if (v.error || p.error) return null;
  const publicaciones: PublicacionPlataforma[] = (p.data ?? []).map((x) =>
    plataforma === "dunamixfy"
      ? { idPlataforma: String(x.dunamixfy_id), nombre: String(x.nombre ?? x.dunamixfy_id), etiqueta: `#${x.dunamixfy_id}`, stock: Number(x.stock ?? 0), activa: x.en_dunamixfy !== false, sku: skuDe(x.skus_maestros) }
      : plataforma === "drop"
      ? { idPlataforma: String(x.drop_id), nombre: String(x.nombre ?? x.drop_id), etiqueta: String(x.codigo || x.drop_id), stock: Number(x.inventario ?? 0) + Number(x.inventario_exclusivo ?? 0), activa: x.en_drop !== false, sku: skuDe(x.skus_maestros) }
      : { idPlataforma: String(x.effi_id), nombre: String(x.nombre ?? x.effi_id), etiqueta: `ID ${x.effi_id}`, stock: Number(x.stock_principal ?? 0), activa: x.en_effi !== false, sku: skuDe(x.skus_maestros) },
  );
  return armarVentasPlataforma(
    plataforma,
    publicaciones,
    (v.data ?? []).map((r) => ({ producto: String(r.producto_id), dia: String(r.dia), salidas: Number(r.salidas), devueltas: Number(r.devueltas) })),
  );
}
