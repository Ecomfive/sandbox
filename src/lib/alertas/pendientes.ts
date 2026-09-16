import type { SupabaseClient } from "@supabase/supabase-js";

export interface Pendiente {
  pais_id: string;
  pais_nombre: string;
  producto_id: string;
  sku: string;
  nombre: string;
  pendiente: number;
}

/**
 * Salidas menos entradas por producto, a partir de todo lo cargado en inventario.
 * Sin `paisId` calcula para todos los países (usado por el cron); la UI lo pasa
 * para mostrar solo el país activo.
 */
export async function calcularPendientes(
  supabase: SupabaseClient,
  paisId?: string
): Promise<Pendiente[]> {
  let query = supabase
    .from("movimientos_inventario")
    .select("producto_id, pais_id, tipo, cantidad, productos(sku, nombre), paises(nombre)");
  if (paisId) query = query.eq("pais_id", paisId);
  const { data: movimientos } = await query;

  const mapa = new Map<string, Pendiente>();
  for (const m of movimientos ?? []) {
    const producto = m.productos as unknown as { sku: string; nombre: string } | null;
    const pais = m.paises as unknown as { nombre: string } | null;
    if (!producto || !m.producto_id) continue;
    const actual = mapa.get(m.producto_id) ?? {
      pais_id: m.pais_id,
      pais_nombre: pais?.nombre ?? "?",
      producto_id: m.producto_id,
      sku: producto.sku,
      nombre: producto.nombre,
      pendiente: 0,
    };
    actual.pendiente += m.tipo === "salida" ? Number(m.cantidad) : -Number(m.cantidad);
    mapa.set(m.producto_id, actual);
  }
  return Array.from(mapa.values()).filter((p) => p.pendiente > 0);
}

/** Crea la alerta si no hay una abierta para ese producto, o actualiza la cantidad si ya existe. */
export async function upsertAlerta(
  supabase: SupabaseClient,
  p: Pick<Pendiente, "pais_id" | "producto_id" | "pendiente">
) {
  const { data: existente } = await supabase
    .from("alertas_inventario_no_retornado")
    .select("id")
    .eq("producto_id", p.producto_id)
    .eq("estado", "abierta")
    .maybeSingle();

  if (existente) {
    await supabase
      .from("alertas_inventario_no_retornado")
      .update({ cantidad: p.pendiente, fecha_deteccion: new Date().toISOString().slice(0, 10) })
      .eq("id", existente.id);
  } else {
    await supabase
      .from("alertas_inventario_no_retornado")
      .insert({ pais_id: p.pais_id, producto_id: p.producto_id, cantidad: p.pendiente });
  }
}
