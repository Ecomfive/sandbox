// Los cambios de precio de Drop y Dunamixfy que esperan «Aplicar precios» (migración 0266), para las listas y fichas. Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlataformaPrecios } from "./marcador-aplicar-precios";
import type { CambioPrecioEsperando } from "./precios-plataforma-actions";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** El cambio que espera (o que falló) de cada publicación de la plataforma en el país. Sin la migración, ninguno. */
export async function cambiosPrecioEsperando(supabase: SupabaseClient, plataforma: PlataformaPrecios, paisId: string): Promise<Map<string, CambioPrecioEsperando>> {
  const { data, error } = await supabase
    .from("plataforma_cambios_precio")
    .select("id, publicacion_id, precio, precio_sugerido, precio_antes, precio_sugerido_antes, estado, error, creado_por_nombre, creado_en")
    .eq("plataforma", plataforma)
    .eq("pais_id", paisId)
    .in("estado", ["pendiente", "error"])
    .order("creado_en", { ascending: false })
    .limit(500);
  const porPublicacion = new Map<string, CambioPrecioEsperando>();
  if (error) return porPublicacion;
  for (const f of data ?? []) {
    const id = f.publicacion_id as string;
    if (porPublicacion.has(id)) continue;
    porPublicacion.set(id, {
      id: f.id as string,
      publicacionId: id,
      precio: num(f.precio),
      sugerido: num(f.precio_sugerido),
      precioAntes: num(f.precio_antes),
      sugeridoAntes: num(f.precio_sugerido_antes),
      estado: f.estado as "pendiente" | "error",
      error: (f.error as string | null) ?? null,
      creadoPor: (f.creado_por_nombre as string | null) ?? null,
      creadoEn: f.creado_en as string,
    });
  }
  return porPublicacion;
}
