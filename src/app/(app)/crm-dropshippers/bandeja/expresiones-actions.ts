"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { detectarArchivoWhatsapp } from "@/lib/whatsapp/archivos";
import { descargarPublico } from "@/lib/seguridad/url-externa";
import { createServiceClient } from "@/lib/supabase/server";
import { esIdGiphy, leerArchivosGiphy, leerListaGiphy, type GifVista } from "@/lib/whatsapp/giphy";
import { aSticker } from "@/lib/whatsapp/sticker";
import { usuarioBandeja } from "./datos-bandeja";
import { BUCKET_ARCHIVOS, chatParaEnviar, mandarMedioGuardado, permisoDeSubida } from "./enviar-medio";

// GIF, stickers de GIPHY y stickers del equipo (29 oct 2026). Todo se manda como cualquier otro archivo (`mandarMedioGuardado`): un GIF sale como video MP4 sin sonido y un sticker
// como WebP de 512 × 512.

const ES_ID = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const TABLA = "whatsapp_stickers";
const GIPHY = "https://api.giphy.com/v1";
const MAX_BYTES_GIF = 16 * 1024 * 1024;
const MAX_ORIGEN_STICKER = 5 * 1024 * 1024;

export interface StickerEquipo {
  id: string;
  nombre: string;
  animado: boolean;
  /** Una dirección firmada de una hora para mostrarlo en la lista. */
  vista: string | null;
}

async function pedirGiphy(ruta: string, parametros: Record<string, string>): Promise<{ json: unknown } | { error: string; sinClave?: true }> {
  const clave = process.env.GIPHY_API_KEY;
  if (!clave) return { error: "Falta la clave de GIPHY (GIPHY_API_KEY) en el servidor.", sinClave: true };
  const url = new URL(`${GIPHY}/${ruta}`);
  url.searchParams.set("api_key", clave);
  for (const [k, v] of Object.entries(parametros)) url.searchParams.set(k, v);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!r.ok) return { error: r.status === 429 ? "GIPHY recibió muchas búsquedas. Espera un momento." : "GIPHY no respondió. Inténtalo de nuevo." };
    return { json: await r.json() };
  } catch {
    return { error: "GIPHY no respondió. Inténtalo de nuevo." };
  }
}

/** Busca GIF o stickers en GIPHY; con la búsqueda vacía, lo más visto. El navegador solo recibe id, título y una vista pequeña. */
export async function buscarGifs(consulta: string, clase: "gif" | "sticker"): Promise<{ gifs: GifVista[] } | { error: string; sinClave?: true }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const q = String(consulta ?? "").trim().slice(0, 60);
  const base = clase === "sticker" ? "stickers" : "gifs";
  const r = await pedirGiphy(q ? `${base}/search` : `${base}/trending`, { ...(q ? { q } : {}), limit: "30", rating: "pg-13", lang: "es" });
  if ("error" in r) return r;
  return { gifs: leerListaGiphy(r.json) };
}

/** Manda un GIF de GIPHY: el servidor vuelve a pedirlo por su id y lo manda como un video MP4. */
export async function enviarGif(conversacionId: string, giphyId: string): Promise<{ ok: true } | { error: string }> {
  const e = await chatParaEnviar(conversacionId);
  if ("error" in e) return e;
  if (!esIdGiphy(String(giphyId ?? ""))) return { error: "GIF no válido." };
  const r = await pedirGiphy(`gifs/${giphyId}`, {});
  if ("error" in r) return r;
  const archivos = leerArchivosGiphy(r.json);
  if (!archivos) return { error: "No se encontró ese GIF." };
  let bytes: Uint8Array | null = null;
  for (const url of [archivos.mp4, archivos.mp4Chico]) {
    if (!url) continue;
    const d = await descargarPublico(url, MAX_BYTES_GIF);
    if (!("error" in d)) {
      bytes = d.bytes;
      break;
    }
  }
  if (!bytes) return { error: "No se pudo bajar el GIF. Prueba con otro." };
  const nombre = `gif-${giphyId}.mp4`;
  const clase = detectarArchivoWhatsapp(bytes, nombre);
  if ("error" in clase) return clase;
  if (clase.tipo !== "video") return { error: "Ese GIF no se puede mandar como video." };
  return mandarMedioGuardado(e, { bytes, nombre, pie: "", ruta: `${conversacionId}/enviados/${crypto.randomUUID()}-${nombre}`, tipo: "video", mime: clase.mime, subir: true });
}

/** Manda un sticker de GIPHY: se baja, se pasa a WebP de 512 × 512 y se manda como sticker. */
export async function enviarStickerGiphy(conversacionId: string, giphyId: string): Promise<{ ok: true } | { error: string }> {
  const e = await chatParaEnviar(conversacionId);
  if ("error" in e) return e;
  if (!esIdGiphy(String(giphyId ?? ""))) return { error: "Sticker no válido." };
  const r = await pedirGiphy(`gifs/${giphyId}`, {});
  if ("error" in r) return r;
  const archivos = leerArchivosGiphy(r.json);
  const url = archivos?.webp ?? archivos?.gif;
  if (!url) return { error: "No se encontró ese sticker." };
  const d = await descargarPublico(url, MAX_BYTES_GIF);
  if ("error" in d) return { error: "No se pudo bajar el sticker. Prueba con otro." };
  const s = await aSticker(d.bytes);
  if ("error" in s) return s;
  return mandarMedioGuardado(e, {
    bytes: s.bytes,
    nombre: `sticker-${giphyId}.webp`,
    pie: "",
    ruta: `${conversacionId}/enviados/${crypto.randomUUID()}-sticker.webp`,
    tipo: "sticker",
    mime: "image/webp",
    subir: true,
  });
}

/** Los stickers que subió el equipo, con una vista para la lista. `falta`: todavía no se corrió la migración 0180. */
export async function listarStickers(): Promise<{ stickers: StickerEquipo[]; falta: boolean } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const { data, error } = await supabase.from(TABLA).select("id, nombre, ruta, animado").order("creado_en", { ascending: false }).limit(200);
  if (error) return { stickers: [], falta: true };
  const filas = data ?? [];
  const firmadas = filas.length ? await supabase.storage.from(BUCKET_ARCHIVOS).createSignedUrls(filas.map((f) => f.ruta as string), 3600) : { data: [] };
  const porRuta = new Map((firmadas.data ?? []).map((f) => [f.path ?? "", f.signedUrl]));
  return { stickers: filas.map((f) => ({ id: f.id as string, nombre: f.nombre as string, animado: Boolean(f.animado), vista: porRuta.get(f.ruta as string) ?? null })), falta: false };
}

/** Primer paso de agregar un sticker: un permiso para que el navegador suba la imagen directo al almacén. */
export async function prepararSticker(tamano: number): Promise<{ ruta: string; token: string } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!Number.isFinite(tamano) || tamano <= 0) return { error: "La imagen está vacía." };
  if (tamano > MAX_ORIGEN_STICKER) return { error: `La imagen pesa más de ${MAX_ORIGEN_STICKER / 1024 / 1024} MB.` };
  const ruta = `stickers/origen/${crypto.randomUUID()}`;
  const permiso = await permisoDeSubida(createServiceClient(), ruta);
  if ("error" in permiso) return permiso;
  return { ruta, token: permiso.token };
}

/** Segundo paso: convierte la imagen subida a sticker (WebP de 512 × 512) y lo deja en la lista del equipo. La imagen original se borra. */
export async function crearSticker(ruta: string, nombre: string): Promise<{ sticker: StickerEquipo } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (typeof ruta !== "string" || !/^stickers\/origen\/[0-9a-f-]{36}$/i.test(ruta)) return { error: "Imagen no válida." };
  const supabase = createServiceClient();
  const quitarOrigen = () => supabase.storage.from(BUCKET_ARCHIVOS).remove([ruta]);
  const { data: archivo, error: errorBajada } = await supabase.storage.from(BUCKET_ARCHIVOS).download(ruta);
  if (errorBajada || !archivo) return { error: "La imagen no llegó. Inténtalo de nuevo." };
  if (archivo.size > MAX_ORIGEN_STICKER) {
    await quitarOrigen();
    return { error: `La imagen pesa más de ${MAX_ORIGEN_STICKER / 1024 / 1024} MB.` };
  }
  const s = await aSticker(new Uint8Array(await archivo.arrayBuffer()));
  await quitarOrigen();
  if ("error" in s) return s;
  const rutaFinal = `stickers/${crypto.randomUUID()}.webp`;
  const { error: errorSubida } = await supabase.storage.from(BUCKET_ARCHIVOS).upload(rutaFinal, s.bytes, { contentType: "image/webp", upsert: false });
  if (errorSubida) return { error: "No se pudo guardar el sticker. Inténtalo de nuevo." };
  const limpio = String(nombre ?? "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) || "Sticker";
  const { data, error } = await supabase.from(TABLA).insert({ nombre: limpio, ruta: rutaFinal, animado: s.animado, creado_por: u.nombre || u.email }).select("id, nombre, animado").single();
  if (error || !data) {
    await supabase.storage.from(BUCKET_ARCHIVOS).remove([rutaFinal]);
    return { error: error?.code === "42P01" ? "Falta correr la migración 0180 (stickers)." : "No se pudo guardar el sticker." };
  }
  await registrarAuditoria({ accion: "crear_sticker_whatsapp", entidad: TABLA, entidadId: data.id as string, detalle: limpio });
  revalidatePath("/crm-dropshippers/bandeja");
  const firmada = await supabase.storage.from(BUCKET_ARCHIVOS).createSignedUrl(rutaFinal, 3600);
  return { sticker: { id: data.id as string, nombre: data.nombre as string, animado: Boolean(data.animado), vista: firmada.data?.signedUrl ?? null } };
}

/** Quita un sticker de la lista del equipo (son recursos del equipo, no historial: los chats donde ya se mandó conservan su copia). */
export async function borrarSticker(id: string): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  if (!ES_ID(id)) return { error: "Sticker no válido." };
  const supabase = createServiceClient();
  const { data } = await supabase.from(TABLA).select("ruta, nombre").eq("id", id).maybeSingle();
  if (!data) return { error: "Ese sticker ya no existe." };
  const { error } = await supabase.from(TABLA).delete().eq("id", id);
  if (error) return { error: "No se pudo quitar." };
  await supabase.storage.from(BUCKET_ARCHIVOS).remove([data.ruta as string]);
  await registrarAuditoria({ accion: "eliminar_sticker_whatsapp", entidad: TABLA, entidadId: id, detalle: String(data.nombre ?? "Sticker") });
  revalidatePath("/crm-dropshippers/bandeja");
  return { ok: true };
}

/** Manda un sticker del equipo: se copia a la carpeta del chat (así borrarlo de la lista no rompe lo que ya se mandó) y sale como sticker. */
export async function enviarSticker(conversacionId: string, stickerId: string): Promise<{ ok: true } | { error: string }> {
  const e = await chatParaEnviar(conversacionId);
  if ("error" in e) return e;
  if (!ES_ID(String(stickerId ?? ""))) return { error: "Sticker no válido." };
  const { data } = await e.supabase.from(TABLA).select("ruta").eq("id", stickerId).maybeSingle();
  if (!data) return { error: "Ese sticker ya no existe." };
  const { data: archivo, error } = await e.supabase.storage.from(BUCKET_ARCHIVOS).download(data.ruta as string);
  if (error || !archivo) return { error: "No se pudo abrir el sticker. Inténtalo de nuevo." };
  return mandarMedioGuardado(e, {
    bytes: new Uint8Array(await archivo.arrayBuffer()),
    nombre: "sticker.webp",
    pie: "",
    ruta: `${conversacionId}/enviados/${crypto.randomUUID()}-sticker.webp`,
    tipo: "sticker",
    mime: "image/webp",
    subir: true,
  });
}
