import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { resumirProductos, type ResumenProducto } from "./ventas";

/**
 * La última carga de ventas de Dropi del país (migración 0120), resumida por producto de Dropi: para mostrar las ventas de
 * cada publicación en Gestión de IDs Dropi. `null` si no hay ninguna carga o falta la migración.
 */
export async function cargarResumenVentas(supabase: SupabaseClient, paisId: string): Promise<{ corte: string; resumen: Map<number, ResumenProducto> } | null> {
  const { data: carga, error } = await supabase.from("dropi_ventas_cargas").select("corte").eq("pais_id", paisId).order("corte", { ascending: false }).limit(1).maybeSingle();
  if (error || !carga) return null;
  const corte = new Date(new Date(carga.corte as string).getTime() - 5 * 3600e3).toISOString().slice(0, 10);
  try {
    const [productos, dias] = await Promise.all([
      traerTodasLasFilas<Record<string, unknown>>((d, h) => supabase.from("dropi_ventas_productos").select("dropi_producto_id, nombre, lista, privado, variable, stock, primera_venta, ultima_venta").eq("pais_id", paisId).order("dropi_producto_id").range(d, h)),
      traerTodasLasFilas<Record<string, unknown>>((d, h) => supabase.from("dropi_ventas_diarias").select("dropi_producto_id, dia, pedidas, ordenes, canceladas, rechazadas, devueltas").eq("pais_id", paisId).order("dropi_producto_id").order("dia").range(d, h)),
    ]);
    const resumen = resumirProductos(
      productos.map((p) => ({
        id: Number(p.dropi_producto_id),
        nombre: p.nombre as string,
        lista: p.lista === "archivado" ? "archivado" : "activo",
        privado: !!p.privado,
        variable: !!p.variable,
        stock: Number(p.stock),
        primeraVenta: (p.primera_venta as string | null) ?? null,
        ultimaVenta: (p.ultima_venta as string | null) ?? null,
      })),
      dias.map((d) => ({ producto: Number(d.dropi_producto_id), dia: d.dia as string, pedidas: Number(d.pedidas), ordenes: Number(d.ordenes), canceladas: Number(d.canceladas), rechazadas: Number(d.rechazadas), devueltas: Number(d.devueltas) })),
      corte,
    );
    return { corte, resumen: new Map(resumen.map((r) => [r.id, r])) };
  } catch {
    return null;
  }
}
