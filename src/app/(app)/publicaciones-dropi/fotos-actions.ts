"use server";

import { requireModulo } from "@/lib/auth";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { claveFoto } from "@/lib/publicaciones/republicar-dropi";
import { createServiceClient } from "@/lib/supabase/server";

// Las fotos de una publicación copiadas de Dropi al sistema (migración 0153): las lee la sección «Fotos» de su ficha. Basta poder abrir
// Gestión de IDs Dropi y ver el país de la publicación. Devuelve el error como valor.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FotoPublicacion {
  id: string;
  nombre: string;
  url: string;
  principal: boolean;
  enDropi: boolean;
  /** El producto de Dropi del que salió. */
  dropiId: number | null;
  copiadaEn: string;
}

export async function obtenerFotosPublicacion(id: string): Promise<{ fotos: FotoPublicacion[] } | { error: string }> {
  const usuario = await requireModulo("publicaciones-dropi");
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Publicación no válida." };
  const supabase = createServiceClient();
  const { data: pub } = await supabase.from("dropi_publicaciones").select("pais_id").eq("id", id).maybeSingle();
  if (!pub || !(await puedeVerPaisId(supabase, usuario.paisesPermitidos, pub.pais_id as string))) return { error: "La publicación ya no existe o no es de tus países." };
  const { data, error } = await supabase
    .from("dropi_publicacion_fotos")
    .select("id, nombre, url, principal, en_dropi, dropi_producto_id, creado_en")
    .eq("publicacion_id", id)
    .order("en_dropi", { ascending: false })
    .order("principal", { ascending: false })
    .order("orden");
  if (error) return /does not exist|schema cache/i.test(error.message) ? { error: "Falta correr en Supabase la migración 0153." } : { error: "No se pudieron leer las fotos." };
  // Una misma foto subida varias veces a Dropi se ve una sola vez (la primera de la lista: la que sigue en Dropi o la principal).
  const vistas = new Set<string>();
  return {
    fotos: (data ?? [])
      .filter((f) => !vistas.has(claveFoto(f.nombre as string)) && vistas.add(claveFoto(f.nombre as string)))
      .map((f) => ({
        id: f.id as string,
        nombre: f.nombre as string,
        url: f.url as string,
        principal: !!f.principal,
        enDropi: !!f.en_dropi,
        dropiId: f.dropi_producto_id == null ? null : Number(f.dropi_producto_id),
        copiadaEn: f.creado_en as string,
      })),
  };
}
