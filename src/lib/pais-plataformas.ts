import type { SupabaseClient } from "@supabase/supabase-js";
import { conTtl } from "@/lib/cache-ttl";

export interface PlataformaPais {
  nombre: string;
  tipoOperacion: "proveeduria" | "tienda";
  tieneDatos: boolean;
}

/** Las plataformas de un país arman el menú de todas las páginas y cambian muy de vez en cuando: un minuto basta. */
const TTL_PLATAFORMAS_MS = 60 * 1000;

const consultarPlataformasPais = conTtl(
  TTL_PLATAFORMAS_MS,
  (paisId: string) => paisId,
  async (paisId: string, supabase: SupabaseClient): Promise<PlataformaPais[]> => {
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
  },
  // Una consulta que no trajo nada (¿error?) no se guarda: mejor reintentar que dejar un menú vacío un minuto.
  { esValido: (plataformas) => plataformas.length > 0 }
);

/** Plataformas de proveeduría/tiendas habilitadas para un país, según `pais_plataformas` (guardadas un minuto). */
export function obtenerPlataformasPais(supabase: SupabaseClient, paisId: string): Promise<PlataformaPais[]> {
  return consultarPlataformasPais(paisId, supabase);
}
