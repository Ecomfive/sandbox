
import { createServiceClient } from "@/lib/supabase/server";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Las personas etiquetadas con «@» en un comentario o una nota que siguen nombradas en el texto: el campo manda los ids de
 * las que se eligieron de la lista, y aquí solo quedan las que existen, están activas, siguen escritas («@Nombre») y no son
 * quien escribe.
 */
export async function mencionadosValidos(ids: string[], texto: string, autorId: string): Promise<{ id: string; nombre: string }[]> {
  const unicos = [...new Set(ids.filter(ES_ID))].filter((id) => id !== autorId).slice(0, 50);
  if (unicos.length === 0) return [];
  const { data } = await createServiceClient().from("perfiles").select("id, nombre, email, activo").in("id", unicos);
  return (data ?? [])
    .filter((p) => p.activo)
    .map((p) => ({ id: p.id as string, nombre: ((p.nombre as string | null) || (p.email as string)).trim() }))
    .filter((p) => texto.includes(`@${p.nombre}`));
}

/**
 * Deja un aviso «Para ti» a cada persona mencionada: quién la mencionó, dónde (`titulo`), el texto (recortado) y a dónde
 * lleva (`href`). Si no se puede guardar, el comentario ya quedó: no se deshace.
 */
export async function notificarMenciones(opciones: {
  mencionados: { id: string }[];
  autorId: string;
  autorNombre: string;
  titulo: string;
  texto: string;
  href: string;
}): Promise<void> {
  if (opciones.mencionados.length === 0) return;
  await createServiceClient()
    .from("notificaciones_usuario")
    .insert(
      opciones.mencionados.map((m) => ({
        usuario_id: m.id,
        tipo: "mencion",
        titulo: opciones.titulo.slice(0, 300),
        texto: opciones.texto.slice(0, 600),
        href: opciones.href,
        autor_id: opciones.autorId,
        autor_nombre: opciones.autorNombre,
      })),
    );
}

/** Cuántos avisos personales sin leer tiene una persona (para el contador de Avisos). */
export async function contarParaTi(usuarioId: string): Promise<number> {
  const { count } = await createServiceClient()
    .from("notificaciones_usuario")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
    .is("leida_en", null);
  return count ?? 0;
}
