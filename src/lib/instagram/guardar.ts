import { detectarImagen } from "@/lib/seguridad/imagen";
import { descargarConDetalle, descargarPublico } from "@/lib/seguridad/url-externa";
import { createServiceClient } from "@/lib/supabase/server";
import { extraerCapturas, formatoDeVideo, type CapturaInstagram, type NotaInstagram } from "./extraer";
import { interpretarEmbed, urlDeEmbed, type DatosEmbed } from "./embed";
import { enviosDe, fusionar, unirTextos, type FilaFusionable } from "./fusion";
import { archivoDeLectura, cifrasDeLectura, mezclarLectura } from "./lectura";
import { CAMPOS_MEDIA, interpretarMedia } from "./media";
import { esEnvioPropio } from "./compartir";
import { archivosDeEmbedFacebook, interpretarFacebook, interpretarPaginaFacebook, interpretarTikTok } from "./lectura-externa";
import { codigoDeContenido, reconocerEnlace, type Plataforma } from "./plataformas";
import { sonDeContenidosDistintos } from "./unir";
import { repetidasDe } from "./repetidas";
import { descripcionDeLaPagina, enlaceLegible, interpretarVistaPrevia, lecturaPublicaActiva, tituloDeLaPagina, type VistaPublica } from "./vista-previa";

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
  const html = new TextDecoder("utf-8").decode(pagina.bytes);
  const datos = interpretarVistaPrevia(descripcionDeLaPagina(html), tituloDeLaPagina(html));
  return datos ? { ok: true, datos } : { ok: false, error: "La vista previa no trae cifras." };
}

const ENCABEZADOS_VISTA_PREVIA = {
  "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  accept: "text/html",
  "accept-language": "en-US,en;q=0.9",
};

/**
 * Lee la página pública de «insertar» del reel o la publicación: ahí está la dirección del archivo de video (o de la imagen), las
 * vistas, los me gusta y los comentarios. Es lo que permite completar una captura que llegó solo con el enlace. Mismas reglas que la
 * vista previa: un pedido, descargador seguro, nunca lanza y el motivo de un fallo queda anotado.
 */
async function leerEmbedPublico(enlace: string): Promise<{ ok: true; datos: DatosEmbed } | { ok: false; error: string } | null> {
  const url = urlDeEmbed(enlace);
  if (!lecturaPublicaActiva() || !url) return null;
  const pagina = await descargarPublico(url, 3_000_000, ENCABEZADOS_VISTA_PREVIA);
  if ("error" in pagina) return { ok: false, error: pagina.error };
  const datos = interpretarEmbed(new TextDecoder("utf-8").decode(pagina.bytes));
  return datos ? { ok: true, datos } : { ok: false, error: "La página de insertar no trae datos." };
}

/**
 * Copia el archivo a nuestro almacenamiento: el enlace del aviso de Meta caduca, el archivo guardado no. Una publicación puede ser
 * un video o una imagen (una foto o un carrusel llega como imagen): los dos se guardan, por su firma y no por lo que diga el servidor.
 */
async function copiarVideo(id: string, url: string, encabezados?: Record<string, string>): Promise<{ ruta: string; bytes: number } | { error: string }> {
  const descarga = await descargarPublico(url, MAX_VIDEO, encabezados);
  if ("error" in descarga) return { error: descarga.error };
  const video = formatoDeVideo(descarga.bytes);
  const imagen = video ? null : detectarImagen(descarga.bytes);
  if (!video && !imagen) return { error: "Lo que mandó Meta no es un video ni una imagen." };
  const ruta = video ? `${id}/video.${video.extension}` : `${id}/imagen.${imagen?.extension}`;
  const tipo = video ? video.tipo : (imagen?.tipo as string);
  const { error } = await createServiceClient().storage.from(BUCKET_INSTAGRAM).upload(ruta, descarga.bytes, { contentType: tipo, upsert: true });
  if (error) return { error: "No se pudo guardar el archivo." };
  return { ruta, bytes: descarga.bytes.length };
}

const AGENTE_NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Lo que se leyó de la página pública de un video de TikTok o una publicación de Facebook, ya en la forma en que se guarda. */
interface LecturaExterna {
  copy: string | null;
  usuario: string | null;
  /** El enlace canónico (el de un enlace corto, una vez abierto). */
  enlace: string | null;
  metricas: Record<string, unknown>;
  videoUrl: string | null;
  /** La imagen de la publicación, para las que no son video (la foto de un anuncio o de un post). */
  imagenUrl: string | null;
  /** Las cookies de la página: TikTok solo entrega su video a quien las trae. */
  cookies: string[];
  /** De qué página se pide el archivo (la red lo pide). */
  referer: string;
}

/**
 * Lee la página pública de un contenido de **TikTok** o **Facebook**: un pedido (que sigue las redirecciones de un enlace corto) con el
 * descargador seguro. TikTok se pide como un navegador y Facebook como lo hace su propia vista previa. Nunca lanza: si la red no
 * responde o cambia su formato, devuelve el motivo y la captura se guarda igual.
 */
export async function leerPaginaExterna(enlace: string, plataforma: Exclude<Plataforma, "instagram">): Promise<{ ok: true; lectura: LecturaExterna } | { ok: false; error: string }> {
  if (!lecturaPublicaActiva()) return { ok: false, error: "La lectura de la página pública está apagada." };
  const ahora = new Date().toISOString();
  try {
    if (plataforma === "tiktok") {
      const p = await descargarConDetalle(enlace, 3_000_000, { "user-agent": AGENTE_NAVEGADOR, accept: "text/html", "accept-language": "en-US,en;q=0.9" });
      if ("error" in p) return { ok: false, error: p.error };
      const d = interpretarTikTok(new TextDecoder("utf-8").decode(p.bytes));
      if (!d) return { ok: false, error: "TikTok no entregó los datos del video." };
      const m: Record<string, unknown> = { plataforma, fuente: "vista_previa", leido_en: ahora };
      if (d.megusta !== null) m.like_count = d.megusta;
      if (d.comentarios !== null) m.comments_count = d.comentarios;
      if (d.vistas !== null) m.view_count = d.vistas;
      if (d.compartidos !== null) m.share_count = d.compartidos;
      if (d.fecha) m.fecha_publicacion = d.fecha;
      if (d.nombre) m.nombre_pagina = d.nombre;
      if (d.duracion !== null) m.duracion = d.duracion;
      return { ok: true, lectura: { copy: d.copy, usuario: d.usuario, enlace: d.enlace ?? reconocerEnlace(p.urlFinal)?.enlace ?? null, metricas: m, videoUrl: d.videoUrl, imagenUrl: null, cookies: p.cookies, referer: "https://www.tiktok.com/" } };
    }
    const p = await descargarConDetalle(enlace, 3_000_000, { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", accept: "text/html", "accept-language": "es-ES,es;q=0.9,en;q=0.5" });
    if ("error" in p) return { ok: false, error: p.error };
    const d = interpretarFacebook(new TextDecoder("utf-8").decode(p.bytes));
    if (!d) return { ok: false, error: "Facebook no mostró esa publicación sin iniciar sesión (puede ser privada o estar borrada)." };
    const m: Record<string, unknown> = { plataforma, fuente: "vista_previa", leido_en: ahora };
    if (d.reacciones !== null) m.like_count = d.reacciones;
    if (d.comentarios !== null) m.comments_count = d.comentarios;
    if (d.vistas !== null) m.view_count = d.vistas;
    if (d.compartidos !== null) m.share_count = d.compartidos;
    const canonico = reconocerEnlace(d.enlace) ?? reconocerEnlace(p.urlFinal);
    // El nombre de la página: la página del reel trae su id, y abrir `facebook.com/<id>` da su nombre y su dirección. Es un pedido más
    // que puede fallar (se queda sin nombre) sin afectar lo demás.
    let usuario: string | null = null;
    if (d.paginaId) {
      // La página pesa varios MB y su nombre está en las etiquetas del principio: se lee solo el comienzo.
      const pagina = await descargarConDetalle(`https://www.facebook.com/${d.paginaId}`, 400_000, { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", accept: "text/html", "accept-language": "es-ES,es;q=0.9,en;q=0.5" }, true);
      const dp = "error" in pagina ? null : interpretarPaginaFacebook(new TextDecoder("utf-8").decode(pagina.bytes));
      if (dp?.nombre) m.nombre_pagina = dp.nombre;
      else if (d.nombrePagina) m.nombre_pagina = d.nombrePagina;
      usuario = dp?.usuario ?? null;
      m.pagina_id = d.paginaId;
    }
    // Sin id de página (una publicación que no es video), el título de la vista previa es el nombre de la página.
    if (!d.paginaId && d.nombrePagina) m.nombre_pagina = d.nombrePagina;
    // El archivo: la página de «insertar» del video (pública, sin iniciar sesión) trae las direcciones del video, la de alta calidad y la normal.
    let videoUrl: string | null = null;
    if (canonico && canonico.tipo === "video" && !canonico.corto) {
      const embed = await descargarConDetalle(`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(canonico.enlace)}`, 3_000_000, { "user-agent": AGENTE_NAVEGADOR, accept: "text/html", "accept-language": "es-ES,es;q=0.9,en;q=0.5" });
      if (!("error" in embed)) {
        const archivos = archivosDeEmbedFacebook(new TextDecoder("utf-8").decode(embed.bytes));
        videoUrl = archivos.hd ?? archivos.sd;
      }
    }
    return { ok: true, lectura: { copy: d.copy, usuario, enlace: canonico?.enlace ?? null, metricas: m, videoUrl, imagenUrl: videoUrl ? null : d.imagen, cookies: [], referer: "https://www.facebook.com/" } };
  } catch {
    return { ok: false, error: "No se pudo leer la página." };
  }
}

const TABLA = "instagram_capturas";
const COLUMNAS_FUSION = "id, mensaje_id, recibido_en, remitente_id, remitente_usuario, remitente_nombre, tipo, enlace, titulo, media_id, texto_mensaje, video_ruta, video_bytes, video_error, autor_usuario, metricas, pagina_destino, notas, estado";

/** Cuánto después de una captura se une todavía un mensaje o un enlace suelto de la misma persona. */
const MINUTOS_PARA_UNIR = 20;

type Supabase = ReturnType<typeof createServiceClient>;
type FilaConId = FilaFusionable & { id: string };

/**
 * ¿Ya se procesó este mensaje de Meta? Meta reintenta los avisos que no contesta a tiempo. Un mensaje procesado queda en su captura
 * (`mensaje_id`, la llave única) o, si la captura se fusionó en otra, en los envíos de la que la absorbió (`metricas.envios`) o entre
 * los textos ya unidos (`metricas.notas_unidas`).
 */
async function yaProcesado(supabase: Supabase, mensajeId: string): Promise<boolean> {
  const [envio, nota] = await Promise.all([
    supabase.from(TABLA).select("id").contains("metricas", { envios: [{ mensaje_id: mensajeId }] }).limit(1),
    supabase.from(TABLA).select("id").contains("metricas", { notas_unidas: [mensajeId] }).limit(1),
  ]);
  return (envio.data?.length ?? 0) > 0 || (nota.data?.length ?? 0) > 0;
}

/**
 * La última captura que tocó esa persona en los últimos minutos (la que recibió de ella o en la que se fusionó un envío suyo), para
 * unirle lo que escribió o el enlace que pegó.
 */
async function ultimaCapturaDe(supabase: Supabase, remitenteId: string, sirve: (f: FilaConId) => boolean = () => true): Promise<FilaConId | null> {
  const desde = new Date(Date.now() - MINUTOS_PARA_UNIR * 60_000).toISOString();
  const { data } = await supabase.from(TABLA).select(COLUMNAS_FUSION).gte("actualizado_en", desde).order("actualizado_en", { ascending: false }).limit(20);
  const filas = (data ?? []) as unknown as FilaConId[];
  return filas.find((f) => sirve(f) && (f.remitente_id === remitenteId || enviosDe(f.metricas).some((e) => e.remitente_id === remitenteId && e.recibido_en >= desde))) ?? null;
}

/** Absorbe una captura en otra del mismo contenido (ver `fusionar`): la principal se completa y la absorbida desaparece. */
async function fusionarPar(supabase: Supabase, principalId: string, absorbidaId: string): Promise<boolean> {
  const { data } = await supabase.from(TABLA).select(COLUMNAS_FUSION).in("id", [principalId, absorbidaId]);
  const filas = (data ?? []) as unknown as FilaConId[];
  const principal = filas.find((f) => f.id === principalId);
  const absorbida = filas.find((f) => f.id === absorbidaId);
  if (!principal || !absorbida) return false;
  const { cambios, archivoSobrante } = fusionar(principal, absorbida);
  const { error } = await supabase.from(TABLA).update({ ...cambios, actualizado_en: new Date().toISOString() }).eq("id", principalId);
  if (error) return false;
  await supabase.from(TABLA).delete().eq("id", absorbidaId);
  if (archivoSobrante) await supabase.storage.from(BUCKET_INSTAGRAM).remove([archivoSobrante]);
  return true;
}

/**
 * Si el mismo contenido ya estaba en una captura anterior (mismo identificador de Meta o mismo código de enlace), esta se fusiona en
 * la primera: una sola ficha con todos los datos y un registro de cada envío. Devuelve el id de la captura que queda. Nunca lanza.
 */
async function fusionarEnPrimera(supabase: Supabase, id: string): Promise<string> {
  try {
    const { data } = await supabase.from(TABLA).select(`${COLUMNAS_FUSION}, numero`).eq("id", id).maybeSingle();
    const nueva = data as unknown as (FilaConId & { numero: number }) | null;
    if (!nueva) return id;
    const filtros: string[] = [];
    if (nueva.media_id && /^\d{1,30}$/.test(nueva.media_id)) filtros.push(`media_id.eq.${nueva.media_id}`);
    const codigo = codigoDeContenido(nueva.enlace);
    if (codigo && /^[\w-]{1,90}$/.test(codigo)) filtros.push(`enlace.ilike.*${codigo}*`);
    if (filtros.length === 0) return id;
    const { data: candidatas } = await supabase.from(TABLA).select(`${COLUMNAS_FUSION}, numero`).neq("id", id).or(filtros.join(",")).order("numero").limit(20);
    const principal = ((candidatas ?? []) as unknown as (FilaConId & { numero: number })[]).find(
      (f) => f.numero < nueva.numero && ((nueva.media_id && f.media_id === nueva.media_id) || (codigo && codigoDeContenido(f.enlace) === codigo)),
    );
    if (!principal) return id;
    return (await fusionarPar(supabase, principal.id, id)) ? principal.id : id;
  } catch {
    return id;
  }
}

/**
 * Completa una captura de **TikTok** o **Facebook** con lo que dice su página pública: el copy (solo si no tenía), la cuenta, las cifras,
 * la fecha, el nombre de la página y, en TikTok, el video (copiado a nuestro almacenamiento por su firma, con las cookies de la página).
 * Si la captura venía de un enlace corto, se queda con el enlace canónico. Lo que una persona corrigió a mano no se pisa.
 */
async function aplicarLecturaExterna(
  supabase: Supabase,
  fila: { id: string; enlace: string; titulo: string | null; autor_usuario: string | null; metricas: Record<string, unknown> | null; video_ruta: string | null },
  plataforma: Exclude<Plataforma, "instagram">,
): Promise<{ ok: true; archivo: boolean } | { ok: false; error: string }> {
  const leida = await leerPaginaExterna(fila.enlace, plataforma);
  if (!leida.ok) {
    // El motivo queda anotado para revisarlo; la captura no pierde lo que ya tenía.
    await supabase.from(TABLA).update({ metricas: { ...(fila.metricas ?? {}), plataforma, vista_previa_error: leida.error }, actualizado_en: new Date().toISOString() }).eq("id", fila.id);
    return leida;
  }
  const { lectura } = leida;
  const cambios: Record<string, unknown> = { metricas: mezclarLectura({ ...(fila.metricas ?? {}), vista_previa_error: undefined }, lectura.metricas), actualizado_en: new Date().toISOString() };
  if (!fila.titulo && lectura.copy) cambios.titulo = lectura.copy;
  if (!fila.autor_usuario && lectura.usuario) cambios.autor_usuario = lectura.usuario;
  if (lectura.enlace && lectura.enlace !== fila.enlace) cambios.enlace = lectura.enlace;

  let archivo = false;
  // El video; si la publicación no es un video, su imagen (la foto de un anuncio).
  const urlArchivo = lectura.videoUrl ?? lectura.imagenUrl;
  if (!fila.video_ruta && urlArchivo) {
    const copia = await copiarVideo(fila.id, urlArchivo, { accept: "*/*", referer: lectura.referer, "user-agent": AGENTE_NAVEGADOR, ...(lectura.cookies.length > 0 ? { cookie: lectura.cookies.join("; ") } : {}) });
    if ("error" in copia) cambios.video_error = copia.error;
    else {
      cambios.video_ruta = copia.ruta;
      cambios.video_bytes = copia.bytes;
      cambios.video_error = null;
      archivo = true;
    }
  }
  const { error } = await supabase.from(TABLA).update(cambios).eq("id", fila.id);
  if (error) return { ok: false, error: "No se pudieron guardar los datos leídos." };
  return { ok: true, archivo };
}

/**
 * Un enlace de reel o publicación que alguien pega después de compartir el archivo («copiar enlace»): en vez de crear otra captura,
 * se le pone a la última de esa persona que no tenga enlace y se lee su página para completarla. Devuelve true si lo unió.
 */
async function pegarEnlaceALaUltima(supabase: Supabase, c: CapturaInstagram): Promise<boolean> {
  if (!c.enlace || !c.mensajeId.endsWith(":texto")) return false;
  const previa = await ultimaCapturaDe(supabase, c.remitenteId, (f) => !f.enlace);
  if (!previa) return false;
  const metricas = { ...(previa.metricas ?? {}) } as Record<string, unknown>;
  const unidas = Array.isArray(metricas.notas_unidas) ? (metricas.notas_unidas as string[]) : [];
  metricas.notas_unidas = [...unidas, c.mensajeId].slice(-20);
  const { error } = await supabase
    .from(TABLA)
    .update({ enlace: c.enlace, texto_mensaje: unirTextos(previa.texto_mensaje, c.textoMensaje), metricas, actualizado_en: new Date().toISOString() })
    .eq("id", previa.id);
  if (error) return false;
  await completarCaptura(previa.id);
  await fusionarEnPrimera(supabase, previa.id);
  return true;
}

/**
 * Guarda las capturas de un aviso de Meta. Cada contenido tiene **una sola captura**: si ya había una del mismo contenido (mismo
 * identificador de Meta o mismo código de enlace), la nueva llegada se fusiona en ella; si lo que llegó es un enlace pegado después
 * de compartir un archivo, se le une a esa captura. `remitentePropio` es quien compartió desde la plataforma (no desde un mensaje de
 * Meta). El aviso completo queda en `payload`. Meta reintenta los avisos que no contesta a
 * tiempo: el mismo mensaje no se procesa dos veces. Nunca lanza: lo que falle queda anotado en `video_error` o se pierde sin tumbar
 * la respuesta al webhook.
 */
export async function guardarCapturas(aviso: unknown, capturas: CapturaInstagram[], remitentePropio?: { usuario: string | null; nombre: string | null }): Promise<{ nuevas: number; ids: string[] }> {
  const supabase = createServiceClient();
  let nuevas = 0;
  const ids: string[] = [];
  for (const c of capturas) {
    try {
      if (await yaProcesado(supabase, c.mensajeId)) continue;
      if (await pegarEnlaceALaUltima(supabase, c)) continue;
      const { data, error } = await supabase
        .from(TABLA)
        .insert({
          mensaje_id: c.mensajeId,
          remitente_id: c.remitenteId,
          tipo: c.tipo,
          enlace: c.enlace,
          titulo: c.titulo,
          media_id: c.mediaId,
          texto_mensaje: c.textoMensaje,
          pagina_destino: c.paginaDestino,
          // La red de lo compartido (sin dato es Instagram): queda desde el primer momento, aunque la lectura de su página falle.
          ...(c.plataforma && c.plataforma !== "instagram" ? { metricas: { plataforma: c.plataforma } } : {}),
          payload: aviso as object,
        })
        .select("id")
        .single();
      if (error || !data) continue; // 23505 = ya la teníamos (un reintento de Meta); lo demás tampoco se puede arreglar aquí
      nuevas++;

      // Facebook y TikTok: se lee su página pública (copy, cuenta, cifras y, en TikTok, el video) y se une con lo que ya hubiera del mismo contenido.
      if (c.plataforma && c.plataforma !== "instagram" && c.enlace) {
        const propio = esEnvioPropio(c.remitenteId) ? remitentePropio : null;
        if (propio) await supabase.from(TABLA).update({ remitente_usuario: propio.usuario, remitente_nombre: propio.nombre }).eq("id", data.id);
        await aplicarLecturaExterna(supabase, { id: data.id, enlace: c.enlace, titulo: c.titulo, autor_usuario: null, metricas: { plataforma: c.plataforma }, video_ruta: null }, c.plataforma);
        ids.push(await fusionarEnPrimera(supabase, data.id));
        continue;
      }

      // Lo compartido desde la plataforma (celular instalado como app) ya trae quién es: no se le pregunta a Instagram.
      const [remitente, consulta] = await Promise.all([
        esEnvioPropio(c.remitenteId) ? Promise.resolve(remitentePropio ?? null) : consultarRemitente(c.remitenteId),
        c.mediaId ? consultarMedia(c.mediaId) : Promise.resolve(null),
      ]);
      const media = consulta?.ok ? interpretarMedia(consulta.datos) : null;
      const urlVideo = c.urlVideo ?? media?.urlVideo ?? null;
      const enlaceFinal = c.enlace ?? media?.enlace ?? null;
      // Con el enlace se lee la página pública (vista previa y «insertar»): de ahí salen las cifras y, si la captura no trajo archivo, el video.
      const [vista, embed] = await Promise.all([enlaceFinal ? leerVistaPublica(enlaceFinal) : null, enlaceFinal ? leerEmbedPublico(enlaceFinal) : null]);
      const urlArchivo = urlVideo ?? archivoDeLectura(embed);
      const video = urlArchivo ? await copiarVideo(data.id, urlArchivo) : null;

      const cambios: Record<string, unknown> = {};
      if (remitente) {
        cambios.remitente_usuario = remitente.usuario;
        cambios.remitente_nombre = remitente.nombre;
      }
      // Las cifras: lo que entrega la API de Meta manda; si no, lo de la página pública (dato no oficial, marcado como tal).
      const lectura = cifrasDeLectura(vista, embed);
      const metricas: Record<string, unknown> = { ...lectura.metricas };
      if (consulta) metricas.consulta = consulta.ok ? consulta.datos : { error: consulta.error };
      if (media?.megusta != null) metricas.like_count = media.megusta;
      if (media?.comentarios != null) metricas.comments_count = media.comentarios;
      if (Object.keys(metricas).length > 0) cambios.metricas = metricas;
      const autor = media?.usuario ?? lectura.autor;
      if (autor) cambios.autor_usuario = autor;
      // Sin copy en el aviso (un enlace compartido desde el celular no lo trae), se toma el de la vista previa pública.
      if (!c.titulo && lectura.copy) cambios.titulo = lectura.copy;
      if (media?.enlace && !c.enlace) cambios.enlace = media.enlace;
      if (video) {
        if ("error" in video) cambios.video_error = video.error;
        else {
          cambios.video_ruta = video.ruta;
          cambios.video_bytes = video.bytes;
        }
      }
      if (Object.keys(cambios).length > 0) await supabase.from(TABLA).update(cambios).eq("id", data.id);
      ids.push(await fusionarEnPrimera(supabase, data.id));
    } catch {
      // Una captura que falla no debe impedir guardar las demás del mismo aviso.
    }
  }
  return { nuevas, ids };
}

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
      if (await yaProcesado(supabase, n.mensajeId)) continue;
      const captura = await ultimaCapturaDe(supabase, n.remitenteId);
      if (!captura) continue;
      const metricas = (captura.metricas ?? {}) as Record<string, unknown>;
      const yaUnidas = Array.isArray(metricas.notas_unidas) ? (metricas.notas_unidas as string[]) : [];
      const cambios: Record<string, unknown> = {
        texto_mensaje: unirTextos(captura.texto_mensaje, n.texto),
        metricas: { ...metricas, notas_unidas: [...yaUnidas, n.mensajeId].slice(-20) },
        actualizado_en: new Date().toISOString(),
      };
      if (!captura.pagina_destino && n.paginaDestino) cambios.pagina_destino = n.paginaDestino;
      const { error } = await supabase.from(TABLA).update(cambios).eq("id", captura.id);
      if (!error) unidas++;
    } catch {
      // Una nota que falla no debe impedir unir las demás.
    }
  }
  return { unidas };
}

/**
 * Vuelve a completar una captura que ya existe: lee la página pública de su enlace (cifras, cuenta, nombre de la página y el archivo si
 * no lo tiene) y, si todavía no tiene archivo, **vuelve a descargarlo del aviso de Meta que guardamos** (así se recupera, por
 * ejemplo, una imagen que antes no se sabía guardar). Lo que una persona corrigió a mano no se pisa. Devuelve un mensaje de error si
 * no hay nada que leer ni que descargar.
 */
export async function completarCaptura(id: string): Promise<{ ok: true; archivo: boolean } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { data } = await supabase.from(TABLA).select("id, mensaje_id, enlace, titulo, video_ruta, autor_usuario, metricas, payload").eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "La captura ya no existe." };
  const red = reconocerEnlace(data.enlace);
  if (data.enlace && red && red.plataforma !== "instagram") {
    if (!lecturaPublicaActiva()) return { ok: false, error: "La lectura de la página pública está apagada." };
    const r = await aplicarLecturaExterna(supabase, { id: data.id, enlace: data.enlace, titulo: data.titulo, autor_usuario: data.autor_usuario, metricas: (data.metricas ?? null) as Record<string, unknown> | null, video_ruta: data.video_ruta }, red.plataforma);
    if (r.ok) await fusionarEnPrimera(supabase, data.id);
    return r;
  }
  const delAviso = data.video_ruta ? null : (extraerCapturas(data.payload).find((c) => c.mensajeId === data.mensaje_id)?.urlVideo ?? null);

  const cambios: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  const metricasActuales = (data.metricas ?? null) as Record<string, unknown> | null;
  const enlace: string | null = data.enlace;
  if (!enlace && !delAviso) return { ok: false, error: "Esta captura no tiene enlace de Instagram ni un archivo que volver a descargar." };

  let embed: Awaited<ReturnType<typeof leerEmbedPublico>> = null;
  let leyoPagina = false;
  if (enlace) {
    if (!lecturaPublicaActiva()) return { ok: false, error: "La lectura de la página pública está apagada." };
    const [vista, e] = await Promise.all([leerVistaPublica(enlace), leerEmbedPublico(enlace)]);
    embed = e;
    const lectura = cifrasDeLectura(vista, embed);
    if (Object.keys(lectura.metricas).length > 0) {
      leyoPagina = true;
      cambios.metricas = mezclarLectura(metricasActuales, lectura.metricas);
    }
    if (lectura.autor && !data.autor_usuario) cambios.autor_usuario = lectura.autor;
    if (lectura.copy && !data.titulo) cambios.titulo = lectura.copy;
  }

  let archivo = false;
  let errorArchivo: string | null = null;
  if (!data.video_ruta) {
    for (const url of [delAviso, archivoDeLectura(embed)]) {
      if (!url) continue;
      const copia = await copiarVideo(data.id, url);
      if ("error" in copia) errorArchivo = copia.error;
      else {
        cambios.video_ruta = copia.ruta;
        cambios.video_bytes = copia.bytes;
        cambios.video_error = null;
        archivo = true;
        break;
      }
    }
    if (!archivo && errorArchivo) cambios.video_error = errorArchivo;
  }
  const huboDatos = leyoPagina || cambios.enlace !== undefined || cambios.autor_usuario !== undefined || cambios.titulo !== undefined || archivo;
  if (!huboDatos) {
    if (errorArchivo || cambios.metricas !== undefined) await supabase.from(TABLA).update({ ...(errorArchivo ? { video_error: errorArchivo } : {}), ...(cambios.metricas !== undefined ? { metricas: cambios.metricas } : {}) }).eq("id", id);
    return { ok: false, error: errorArchivo ?? "Instagram no devolvió datos de este enlace." };
  }
  const { error } = await supabase.from(TABLA).update(cambios).eq("id", id);
  if (error) return { ok: false, error: "No se pudieron guardar los datos leídos." };
  return { ok: true, archivo };
}

/**
 * Fusiona de una vez las capturas que ya estaban repetidas (las anteriores a que se fusionaran solas): cada grupo del mismo contenido
 * queda en su primera captura. Devuelve cuántas se fusionaron.
 */
export async function fusionarRepetidas(): Promise<{ fusionadas: number }> {
  const supabase = createServiceClient();
  const filas: { id: string; numero: number; enlace: string | null; media_id: string | null }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await supabase.from(TABLA).select("id, numero, enlace, media_id").order("numero").range(desde, desde + 999);
    if (!data || data.length === 0) break;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  const idPorNumero = new Map(filas.map((f) => [f.numero, f.id]));
  const grupos = repetidasDe(filas.map((f) => ({ numero: f.numero, enlace: f.enlace, mediaId: f.media_id })));
  let fusionadas = 0;
  for (const [absorbida, principal] of [...grupos.entries()].sort((a, b) => a[0] - b[0])) {
    const p = idPorNumero.get(principal);
    const a = idPorNumero.get(absorbida);
    if (p && a && (await fusionarPar(supabase, p, a))) fusionadas++;
  }
  return { fusionadas };
}

/**
 * Une dos capturas que una persona decidió que son el mismo contenido (un anuncio que llegó como archivo y el mismo compartido después
 * como enlace): la **más antigua** queda y absorbe a la otra con `fusionar` (solo se completa lo que le falta; nada de lo que ya tenía se
 * pisa) y la otra desaparece, con sus envíos anotados en «Compartida N veces». Se rechaza si las dos tienen enlace y no es el mismo. Nunca
 * lanza.
 */
export async function unirCapturas(idA: string, idB: string): Promise<{ ok: true; principal: { id: string; numero: number }; absorbida: { numero: number } } | { ok: false; error: string }> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase.from(TABLA).select(`${COLUMNAS_FUSION}, numero`).in("id", [idA, idB]);
    const filas = ((data ?? []) as unknown as (FilaConId & { numero: number })[]).sort((a, b) => a.numero - b.numero);
    if (filas.length !== 2) return { ok: false, error: "Una de las capturas ya no existe." };
    const [principal, absorbida] = filas;
    if (sonDeContenidosDistintos(principal, absorbida)) return { ok: false, error: "Las dos capturas tienen un enlace de Instagram distinto: no son el mismo contenido." };
    if (!(await fusionarPar(supabase, principal.id, absorbida.id))) return { ok: false, error: "No se pudieron unir las capturas." };
    return { ok: true, principal: { id: principal.id, numero: principal.numero }, absorbida: { numero: absorbida.numero } };
  } catch {
    return { ok: false, error: "No se pudieron unir las capturas." };
  }
}
