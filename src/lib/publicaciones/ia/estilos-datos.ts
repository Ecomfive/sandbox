import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstiloImagen } from "./estilos";

export interface EstiloGuardado extends EstiloImagen {
  creadoPor: string | null;
  creadoEn: string;
}

/** Las guías de estilo de las imágenes modelo, de la más nueva a la más vieja. `disponible` es false si falta la migración 0135. */
export async function cargarEstilos(supabase: SupabaseClient): Promise<{ estilos: EstiloGuardado[]; disponible: boolean }> {
  const { data, error } = await supabase.from("dropi_ia_estilos_imagen").select("id, nombre, tipo, guia, activo, creado_por_nombre, creado_en").order("creado_en", { ascending: false }).limit(60);
  if (error) return { estilos: [], disponible: false };
  return {
    disponible: true,
    estilos: (data ?? []).map((f) => ({
      id: f.id as string,
      nombre: String(f.nombre ?? ""),
      tipo: String(f.tipo ?? "general"),
      guia: String(f.guia ?? ""),
      activo: f.activo !== false,
      creadoPor: (f.creado_por_nombre as string | null) ?? null,
      creadoEn: f.creado_en as string,
    })),
  };
}
