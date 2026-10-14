import { descargarPublico } from "@/lib/seguridad/url-externa";
import { createServiceClient } from "@/lib/supabase/server";
import { formatoDeVideo, type CapturaInstagram } from "./extraer";

export const BUCKET_INSTAGRAM = "instagram-fuentes";
/** Un reel pesa unos MB; el bucket acepta hasta 100 MB. */
const MAX_VIDEO = 100 * 1024 * 1024;

/**
 * Quién es el que compartió (su usuario y nombre), si la app tiene un token de la cuenta (`INSTAGRAM_ACCESS_TOKEN`). Es un
 * dato de más: sin token o si Meta no responde, la captura se guarda igual con solo el id de Instagram.
 */
async function consultarRemitente(id: string): Promise<{ usuario: string | null; nombre: string | null } | null> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token || !/^\d{5,25}$/.test(id)) return null;
  try {
    const r = await fetch(`https://graph.instagram.com/v23.0/${id}?fields=username,name`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { username?: unknown; name?: unknown };
    return {
      usuario: typeof d.username === "string" ? d.username.slice(0, 100) : null,
      nombre: typeof d.name === "string" ? d.name.slice(0, 200) : null,
    };
  } catch {
    return null;
  }
}

/** Copia el video a nuestro almacenamiento: el enlace del aviso de Meta caduca, el archivo guardado no. */
async function copiarVideo(id: string, url: string): Promise<{ ruta: string; bytes: number } | { error: string }> {
  const descarga = await descargarPublico(url, MAX_VIDEO);
  if ("error" in descarga) return { error: descarga.error };
  const formato = formatoDeVideo(descarga.bytes);
  if (!formato) return { error: "Lo que mandó Meta no es un video." };
  const ruta = `${id}/video.${formato.extension}`;
  const { error } = await createServiceClient().storage.from(BUCKET_INSTAGRAM).upload(ruta, descarga.bytes, { contentType: formato.tipo, upsert: true });
  if (error) return { error: "No se pudo guardar el video." };
  return { ruta, bytes: descarga.bytes.length };
}

/**
 * Guarda las capturas de un aviso de Meta: una fila por cada una (con el aviso completo en `payload`) y, después, el video.
 * Meta reintenta los avisos que no contesta a tiempo, así que el mismo mensaje puede llegar dos veces: la llave única
 * `mensaje_id` hace que la segunda vez no cree nada. Nunca lanza: lo que falle queda anotado en `video_error` o se pierde
 * sin tumbar la respuesta al webhook.
 */
export async function guardarCapturas(aviso: unknown, capturas: CapturaInstagram[]): Promise<{ nuevas: number }> {
  const supabase = createServiceClient();
  let nuevas = 0;
  for (const c of capturas) {
    try {
      const { data, error } = await supabase
        .from("instagram_capturas")
        .insert({
          mensaje_id: c.mensajeId,
          remitente_id: c.remitenteId,
          tipo: c.tipo,
          enlace: c.enlace,
          titulo: c.titulo,
          media_id: c.mediaId,
          texto_mensaje: c.textoMensaje,
          pagina_destino: c.paginaDestino,
          payload: aviso as object,
        })
        .select("id")
        .single();
      if (error || !data) continue; // 23505 = ya la teníamos (un reintento de Meta); lo demás tampoco se puede arreglar aquí
      nuevas++;

      const [remitente, video] = await Promise.all([consultarRemitente(c.remitenteId), c.urlVideo ? copiarVideo(data.id, c.urlVideo) : Promise.resolve(null)]);
      const cambios: Record<string, unknown> = {};
      if (remitente) {
        cambios.remitente_usuario = remitente.usuario;
        cambios.remitente_nombre = remitente.nombre;
      }
      if (video) {
        if ("error" in video) cambios.video_error = video.error;
        else {
          cambios.video_ruta = video.ruta;
          cambios.video_bytes = video.bytes;
        }
      }
      if (Object.keys(cambios).length > 0) await supabase.from("instagram_capturas").update(cambios).eq("id", data.id);
    } catch {
      // Una captura que falla no debe impedir guardar las demás del mismo aviso.
    }
  }
  return { nuevas };
}
