import type { SupabaseClient } from "@supabase/supabase-js";
import { indexar, type IndiceReferencias } from "@/lib/scraping/cruces";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { claveNombre, fotosPorNombre } from "./foto-producto";

export interface FotosDeProductos {
  /** De cada nombre (`claveNombre`), la foto del primer producto que la tiene. */
  porNombre: Map<string, string>;
  /** La foto de cada producto por su id (la suya o, si no tiene, la de otro con el mismo nombre). */
  porId: Map<string, string>;
  /** Los productos con foto, para encontrar el de una compra sin productos (`productoDeCompra`). */
  indice: IndiceReferencias;
}

/** Las fotos comerciales de Producto, para mostrarlas en Compras. Si la consulta falla, sin fotos (la página carga igual). */
export async function cargarFotosDeProductos(supabase: SupabaseClient): Promise<FotosDeProductos> {
  try {
    const filas = await traerTodasLasFilas<{ id: string; codigo: string; nombre: string; foto_url: string | null; foto_huella: string | null }>((desde, hasta) =>
      supabase.from("skus_maestros").select("id, codigo, nombre, foto_url, foto_huella").order("id").range(desde, hasta),
    );
    const porNombre = fotosPorNombre(filas.map((f) => ({ nombre: f.nombre, foto: f.foto_url })));
    const porId = new Map<string, string>();
    for (const f of filas) {
      const foto = f.foto_url ?? porNombre.get(claveNombre(f.nombre));
      if (foto) porId.set(f.id, foto);
    }
    const indice = indexar(filas.filter((f) => f.foto_url).map((f) => ({ tipo: "producto" as const, id: f.id, nombre: f.nombre, huella: f.foto_huella, detalle: f.codigo })));
    return { porNombre, porId, indice };
  } catch {
    return { porNombre: new Map(), porId: new Map(), indice: indexar([]) };
  }
}
