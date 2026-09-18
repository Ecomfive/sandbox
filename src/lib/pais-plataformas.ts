import type { SupabaseClient } from "@supabase/supabase-js";

export interface PlataformaPais {
  nombre: string;
  tipoOperacion: "proveeduria" | "tienda";
  tieneDatos: boolean;
}

/** Plataformas de proveeduría/tiendas habilitadas para un país, según `pais_plataformas`. */
export async function obtenerPlataformasPais(
  supabase: SupabaseClient,
  paisId: string
): Promise<PlataformaPais[]> {
  const { data } = await supabase
    .from("pais_plataformas")
    .select("tiene_datos, plataformas(nombre, tipo_operacion)")
    .eq("pais_id", paisId);

  return (data ?? [])
    .map((fila) => {
      const plataforma = fila.plataformas as unknown as { nombre: string; tipo_operacion: string } | null;
      if (!plataforma) return null;
      return {
        nombre: plataforma.nombre,
        tipoOperacion: plataforma.tipo_operacion as "proveeduria" | "tienda",
        tieneDatos: fila.tiene_datos,
      };
    })
    .filter((p): p is PlataformaPais => p !== null)
    .sort((a, b) => Number(b.tieneDatos) - Number(a.tieneDatos) || a.nombre.localeCompare(b.nombre));
}
