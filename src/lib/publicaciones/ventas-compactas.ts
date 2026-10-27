import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { restarDias } from "./ventas";

type Fila = Record<string, unknown>;

/** Una función de la base que todavía no existe (falta la migración): se lee como antes. */
const faltaFuncion = (e: unknown) => {
  const x = e as { code?: string; message?: string } | null;
  return !!x && (x.code === "PGRST202" || x.code === "42883" || /function .* does not exist|Could not find the function/i.test(x.message ?? ""));
};

/**
 * Las ventas diarias de Dropi de un país listas para `resumirProductos` (rendimiento, 27 oct 2026, migración 0163): los últimos 90 días
 * hasta el corte día por día y lo anterior sumado por mes (día 1), que es todo lo que usan las cuentas (netas de 30/60/90 días, la
 * gráfica por día de 90 días y las sumas por mes y totales). Antes se traían todas las filas (~19.000 en Panamá). Sin la migración, como
 * antes. Con `productos`, solo esos IDs de Dropi. Devuelve el error como valor, igual que `traerTodasConError`.
 */
export async function traerVentasDiarias(supabase: SupabaseClient, paisId: string, corte: string, productos?: number[]): Promise<{ data: Fila[] | null; error: unknown }> {
  const desde = restarDias(corte, 89);
  const compactas = await traerTodasConError<Fila>((d, h) =>
    supabase.rpc("dropi_ventas_diarias_compactas", { p_pais: paisId, p_desde: desde, p_productos: productos ?? null }).range(d, h),
  );
  if (!compactas.error) return compactas;
  if (!faltaFuncion(compactas.error)) return compactas;
  return traerTodasConError<Fila>((d, h) => {
    const q = supabase.from("dropi_ventas_diarias").select("dropi_producto_id, dia, pedidas, ordenes, canceladas, rechazadas, devueltas").eq("pais_id", paisId);
    return (productos ? q.in("dropi_producto_id", productos) : q).order("dropi_producto_id").order("dia").range(d, h);
  });
}

/**
 * El dinero de Dropi de un país sumado por producto y mes (día 1), que es como lo usa Ventas Dropi (rendimiento, 27 oct 2026, migración
 * 0163). Antes se traían todas las filas diarias (~17.000 en Panamá). Sin la migración, como antes.
 */
export async function traerDineroPorMes(supabase: SupabaseClient, paisId: string): Promise<{ data: Fila[] | null; error: unknown }> {
  const porMes = await traerTodasConError<Fila>((d, h) => supabase.rpc("dropi_ventas_dinero_por_mes", { p_pais: paisId }).range(d, h));
  if (!porMes.error || !faltaFuncion(porMes.error)) return porMes;
  return traerTodasConError<Fila>((d, h) =>
    supabase.from("dropi_ventas_dinero").select("dropi_producto_id, dia, entregadas, unidades, ganancia, comision, coste, descuentos").eq("pais_id", paisId).order("dropi_producto_id").order("dia").range(d, h),
  );
}
