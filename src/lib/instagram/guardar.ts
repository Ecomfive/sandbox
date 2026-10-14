import { descargarPublico } from "@/lib/seguridad/url-externa";
import { createServiceClient } from "@/lib/supabase/server";
import { formatoDeVideo, type CapturaInstagram, type NotaInstagram } from "./extraer";
import { CAMPOS_MEDIA, interpretarMedia } from "./media";
import { descripcionDeLaPagina, enlaceLegible, interpretarVistaPrevia, lecturaPublicaActiva, type VistaPublica } from "./vista-previa";

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

/**
 * Pide a Instagram lo que deja leer del reel o la publicación compartida (autor, me gusta, comentarios, enlace, video). Para una
 * publicación de otra cuenta Meta puede negarlo: la respuesta o el error se guardan tal cual para revisarlos. Nunca lanza.
 */
async function consultarMedia(id: string): Promise<{ ok: true; datos: unknown } | { ok: false; error: string } | null> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token || !/^\d{5,25}$/.test(id)) return null;
  try {
    const r = await fetch(`https://graph.instagram.com/v23.0/${id}?fields=${CAMPOS_MEDIA}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const d = (await r.json().catch(() => null)) as { error?: { message?: unknown } } | null;
    if (r.ok && d) return { ok: true, datos: d };
    return { ok: false, error: typeof d?.error?.message === "string" ? d.error.message.slice(0, 500) : `HTTP ${r.status}` };
  } catch {
    return { ok: false, error: "Instagram no respondió." };
  }
}

/**
 * Lee la vista previa pública del reel o la publicación (me gusta, comentarios, cuenta y fecha): lo mismo que ven WhatsApp o
 * Facebook al pegar el enlace. Un solo pedido por captura, solo al enlace de un reel o una publicación de instagram.com, con el
 * descargador seguro y pidiendo la página como lo hace Facebook para sus vistas previas. Nunca lanza: si Instagram no responde o
 * cambia el formato, el motivo queda anotado y la captura se guarda igual.
 */
async function leerVistaPublica(enlace: string): Promise<{ ok: true; datos: VistaPublica } | { ok: false; error: string } | null> {
  if (!lecturaPublicaActiva() || !enlaceLegible(enlace)) return null;
  const pagina = await descargarPublico(enlace, 3_000_000, {
    "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    accept: "text/html",
    "accept-language": "en-US,en;q=0.9",
  });
  if ("error" in pagina) return { ok: false, error: pagina.error };
  const datos = interpretarVistaPrevia(descripcionDeLaPagina(new TextDecoder("utf-8").decode(pagina.bytes)));
  return datos ? { ok: true, datos } : { ok: false, error: "La vista previa no trae cifras." };
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

      const [remitente, consulta] = await Promise.all([consultarRemitente(c.remitenteId), c.mediaId ? consultarMedia(c.mediaId) : Promise.resolve(null)]);
      const media = consulta?.ok ? interpretarMedia(consulta.datos) : null;
      const urlVideo = c.urlVideo ?? media?.urlVideo ?? null;
      const enlaceFinal = c.enlace ?? media?.enlace ?? null;
      const [video, vista] = await Promise.all([urlVideo ? copiarVideo(data.id, urlVideo) : null, enlaceFinal ? leerVistaPublica(enlaceFinal) : null]);

      const cambios: Record<string, unknown> = {};
      if (remitente) {
        cambios.remitente_usuario = remitente.usuario;
        cambios.remitente_nombre = remitente.nombre;
      }
      // Las cifras: lo que entrega la API de Meta manda; si no, lo de la vista previa pública (dato no oficial, marcado como tal).
      const metricas: Record<string, unknown> = {};
      if (consulta) metricas.consulta = consulta.ok ? consulta.datos : { error: consulta.error };
      if (vista?.ok) {
        const v = vista.datos;
        if (v.megusta !== null) metricas.like_count = v.megusta;
        if (v.comentarios !== null) metricas.comments_count = v.comentarios;
        if (v.fecha) metricas.fecha_publicacion = v.fecha;
        metricas.fuente = "vista_previa";
        metricas.leido_en = new Date().toISOString();
      } else if (vista) {
        metricas.vista_previa_error = vista.error;
      }
      if (media?.megusta != null) metricas.like_count = media.megusta;
      if (media?.comentarios != null) metricas.comments_count = media.comentarios;
      if (Object.keys(metricas).length > 0) cambios.metricas = metricas;
      const autor = media?.usuario ?? (vista?.ok ? vista.datos.usuario : null);
      if (autor) cambios.autor_usuario = autor;
      if (media?.enlace && !c.enlace) cambios.enlace = media.enlace;
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

/** Cuánto después de una captura se une todavía un mensaje de texto de la misma persona. */
const MINUTOS_PARA_UNIR_NOTA = 20;

/**
 * Une cada mensaje de texto suelto a la **última captura de esa misma persona** de los últimos minutos: lo que escribió al
 * compartir pasa a «Mensaje que escribió» y, si trae una página que no sea de Instagram ni de Facebook y la captura aún no tiene
 * página de destino, esa queda como su destino. Meta reintenta los avisos: el id de cada mensaje ya unido queda en
 * `metricas.notas_unidas` para no repetirlo. Un texto sin captura reciente se ignora. Nunca lanza.
 */
export async function guardarNotas(notas: NotaInstagram[]): Promise<{ unidas: number }> {
  const supabase = createServiceClient();
  let unidas = 0;
  for (const n of notas) {
    try {
      const desde = new Date(Date.now() - MINUTOS_PARA_UNIR_NOTA * 60_000).toISOString();
      const { data: captura } = await supabase
        .from("instagram_capturas")
        .select("id, texto_mensaje, pagina_destino, metricas")
        .eq("remitente_id", n.remitenteId)
        .gte("recibido_en", desde)
        .order("recibido_en", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!captura) continue;
      const metricas = (captura.metricas ?? {}) as Record<string, unknown>;
      const yaUnidas = Array.isArray(metricas.notas_unidas) ? (metricas.notas_unidas as string[]) : [];
      if (yaUnidas.includes(n.mensajeId)) continue;
      const cambios: Record<string, unknown> = {
        texto_mensaje: (captura.texto_mensaje ? `${captura.texto_mensaje}\n${n.texto}` : n.texto).slice(0, 4000),
        metricas: { ...metricas, notas_unidas: [...yaUnidas, n.mensajeId].slice(-20) },
      };
      if (!captura.pagina_destino && n.paginaDestino) cambios.pagina_destino = n.paginaDestino;
      const { error } = await supabase.from("instagram_capturas").update(cambios).eq("id", captura.id);
      if (!error) unidas++;
    } catch {
      // Una nota que falla no debe impedir unir las demás.
    }
  }
  return { unidas };
}
