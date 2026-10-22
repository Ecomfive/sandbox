// El servidor de la Actividad con comentarios para un módulo nuevo (el de Compras sigue con su propio código, que tiene planes B
// para migraciones viejas). Cada módulo describe sus tablas con `ConfigComentarios` y, en su archivo "use server", revisa permisos
// y acceso ANTES de llamar a estas funciones: aquí no se revisa quién es la persona, solo se hace el trabajo con las tablas. Los
// archivos se revisan por su contenido (`detectarAdjunto`) y solo se borran los de la carpeta de esa entidad.

import { detectarAdjunto, MAX_ADJUNTOS_COMENTARIO, MAX_BYTES_ADJUNTO, nombreSeguro } from "@/lib/compras/adjuntos";
import { EMOJIS_REACCION } from "@/lib/compras/reacciones";
import { mencionadosValidos, notificarMenciones } from "@/lib/menciones";
import { createServiceClient } from "@/lib/supabase/server";
import type { AdjuntoActividad, AdjuntoSubido, ComentarioActividad, ReaccionComentario } from "./tipos";

export interface ConfigComentarios {
  /** Tabla de comentarios: id, <fk>, autor, autor_id, texto, respuesta_a, editado_en, creado_en. */
  comentarios: string;
  /** Tabla de archivos: id, <fk>, comentario_id, nombre, extension, tamano, clase, ruta, subido_por, creado_en. */
  adjuntos: string;
  /** Tabla de reacciones: comentario_id, usuario_id, usuario_nombre, emoji, creado_en. */
  reacciones: string;
  /** La columna que une un comentario con su registro («publicacion_id»). */
  fk: string;
  bucket: string;
}

export interface Persona {
  id: string;
  nombre: string;
}

const ES_ID = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const carpeta = (entidadId: string) => `comentarios/${entidadId}/`;

function agruparReacciones(filas: { comentario_id: string; usuario_id: string; usuario_nombre: string | null; emoji: string }[], yo: string | null) {
  const m = new Map<string, ReaccionComentario[]>();
  for (const r of filas) {
    const lista = m.get(r.comentario_id) ?? [];
    let g = lista.find((x) => x.emoji === r.emoji);
    if (!g) lista.push((g = { emoji: r.emoji, n: 0, mia: false, nombres: [] }));
    g.n++;
    g.mia ||= r.usuario_id === yo;
    g.nombres.push(r.usuario_nombre ?? "—");
    m.set(r.comentario_id, lista);
  }
  return m;
}

/** Los comentarios de un registro (hasta 500) con sus archivos (enlace firmado de una hora) y reacciones. */
export async function leerComentarios(cfg: ConfigComentarios, entidadId: string, yo: string | null): Promise<{ comentarios: ComentarioActividad[] } | { error: string }> {
  const supabase = createServiceClient();
  const [cs, as] = await Promise.all([
    supabase.from(cfg.comentarios).select("id, autor, autor_id, texto, creado_en, respuesta_a, editado_en").eq(cfg.fk, entidadId).order("creado_en", { ascending: false }).limit(500),
    supabase.from(cfg.adjuntos).select("id, nombre, clase, ruta, creado_en, comentario_id").eq(cfg.fk, entidadId).order("creado_en"),
  ]);
  if (cs.error || as.error) return { error: "No se pudo cargar la actividad." };
  const filas = (cs.data ?? []) as { id: string; autor: string | null; autor_id: string | null; texto: string; creado_en: string; respuesta_a: string | null; editado_en: string | null }[];
  const archivos = (as.data ?? []) as { id: string; nombre: string; clase: string; ruta: string | null; creado_en: string; comentario_id: string | null }[];
  const rutas = archivos.map((a) => a.ruta).filter((r): r is string => !!r);
  const firmadas = new Map<string, string>();
  if (rutas.length) {
    const { data } = await supabase.storage.from(cfg.bucket).createSignedUrls(rutas, 3600);
    for (const f of data ?? []) if (f.path && f.signedUrl) firmadas.set(f.path, f.signedUrl);
  }
  const deComentario = new Map<string, AdjuntoActividad[]>();
  for (const a of archivos)
    if (a.comentario_id) deComentario.set(a.comentario_id, [...(deComentario.get(a.comentario_id) ?? []), { id: a.id, nombre: a.nombre, clase: a.clase, url: (a.ruta && firmadas.get(a.ruta)) || null, creadoEn: a.creado_en }]);
  let reacciones = new Map<string, ReaccionComentario[]>();
  if (filas.length) {
    const { data } = await supabase.from(cfg.reacciones).select("comentario_id, usuario_id, usuario_nombre, emoji, creado_en").in("comentario_id", filas.map((c) => c.id)).order("creado_en");
    reacciones = agruparReacciones((data ?? []) as never, yo);
  }
  return {
    comentarios: filas.map((c) => ({
      id: c.id,
      autor: c.autor,
      texto: c.texto,
      creadoEn: c.creado_en,
      adjuntos: deComentario.get(c.id) ?? [],
      respuestaA: c.respuesta_a,
      reacciones: reacciones.get(c.id) ?? [],
      editadoEn: c.editado_en,
      mio: !!yo && c.autor_id === yo,
    })),
  };
}

/** A qué registro pertenece un comentario (y quién lo escribió), para revisar el acceso antes de tocarlo. */
export async function comentarioDe(cfg: ConfigComentarios, comentarioId: string): Promise<{ entidadId: string; autorId: string | null; texto: string } | null> {
  if (!ES_ID(comentarioId)) return null;
  const { data } = await createServiceClient().from(cfg.comentarios).select(`${cfg.fk}, autor_id, texto`).eq("id", comentarioId).maybeSingle();
  if (!data) return null;
  const d = data as unknown as Record<string, unknown>;
  return { entidadId: String(d[cfg.fk]), autorId: (d.autor_id as string | null) ?? null, texto: String(d.texto ?? "") };
}

/** Borra archivos recién subidos que no se guardaron: solo de la carpeta de ese registro y que ningún comentario use. Nunca lanza. */
async function borrarSubidos(cfg: ConfigComentarios, entidadId: string, rutas: (string | null | undefined)[]) {
  const c = carpeta(entidadId);
  const candidatas = [...new Set(rutas.filter((r): r is string => typeof r === "string" && r.startsWith(c) && !r.includes("..") && r.length <= 300))];
  if (!candidatas.length) return;
  const supabase = createServiceClient();
  const { data: usadas, error } = await supabase.from(cfg.adjuntos).select("ruta").in("ruta", candidatas);
  if (error) return;
  const ocupadas = new Set(((usadas ?? []) as { ruta: string | null }[]).map((u) => u.ruta));
  const libres = candidatas.filter((r) => !ocupadas.has(r));
  if (libres.length) await supabase.storage.from(cfg.bucket).remove(libres);
}

/** Revisa los archivos subidos: de la carpeta del registro, sin repetir, sin usar, que no pesen de más y por su contenido. */
async function revisarSubidos(cfg: ConfigComentarios, entidadId: string, archivos: AdjuntoSubido[]): Promise<{ error: string } | { ruta: string; nombre: string; extension: string; tamano: number; clase: string }[]> {
  const rutas = archivos.map((a) => (a && typeof a.ruta === "string" ? a.ruta : ""));
  const falla = async (error: string) => {
    await borrarSubidos(cfg, entidadId, rutas);
    return { error };
  };
  if (archivos.length > MAX_ADJUNTOS_COMENTARIO) return falla(`Un comentario lleva hasta ${MAX_ADJUNTOS_COMENTARIO} archivos.`);
  const c = carpeta(entidadId);
  if (rutas.some((r) => !r.startsWith(c) || r.includes("..") || r.length > 300)) return falla("Hay un archivo que no es de este registro.");
  if (new Set(rutas).size !== rutas.length) return falla("Hay un archivo repetido.");
  const supabase = createServiceClient();
  const { data: yaUsadas, error: errorUsadas } = await supabase.from(cfg.adjuntos).select("ruta").in("ruta", rutas);
  if (errorUsadas) return { error: "No se pudieron revisar los archivos. Inténtalo de nuevo." };
  if ((yaUsadas ?? []).length) return { error: "Uno de los archivos ya es de otro comentario. Vuelve a adjuntarlo." };
  const storage = supabase.storage.from(cfg.bucket);
  const out: { ruta: string; nombre: string; extension: string; tamano: number; clase: string }[] = [];
  for (const [i, archivo] of archivos.entries()) {
    const ruta = rutas[i];
    const { data, error } = await storage.download(ruta);
    if (error || !data) return falla("No se encontró uno de los archivos. Vuelve a adjuntarlo.");
    if (data.size > MAX_BYTES_ADJUNTO) return falla("Un archivo pesa más de lo permitido.");
    const contenido = new Uint8Array(await data.arrayBuffer());
    const nombre0 = String(archivo.nombre ?? "").trim().slice(0, 120);
    const tipo = detectarAdjunto(contenido, nombre0 || ruta);
    if (!tipo) return falla("Se pueden adjuntar imágenes, PDF, Excel, Word, PowerPoint, CSV y texto (se revisa el contenido, no el nombre).");
    // Se vuelve a guardar con el tipo de su contenido: un texto se abre siempre como texto, nunca como página.
    if ((data.type || "").split(";")[0] !== tipo.tipo.split(";")[0]) {
      const { error: e } = await storage.update(ruta, contenido, { contentType: tipo.tipo, upsert: true });
      if (e) return falla("No se pudo guardar uno de los archivos.");
    }
    out.push({ ruta, nombre: nombre0 || `archivo.${tipo.extension}`, extension: tipo.extension, tamano: data.size, clase: tipo.clase });
  }
  return out;
}

/** Permiso (URL firmada) para subir un archivo de un comentario directo desde el navegador, a la carpeta de ese registro. */
export async function prepararSubida(cfg: ConfigComentarios, entidadId: string, nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  if (!ES_ID(entidadId)) return { error: "Registro no válido." };
  if (typeof nombreArchivo !== "string" || !nombreArchivo.trim()) return { error: "El archivo no tiene nombre." };
  const ruta = `${carpeta(entidadId)}${crypto.randomUUID()}-${nombreSeguro(nombreArchivo)}`;
  const { data, error } = await createServiceClient().storage.from(cfg.bucket).createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

export async function descartarSubida(cfg: ConfigComentarios, entidadId: string, ruta: string): Promise<void> {
  if (!ES_ID(entidadId) || typeof ruta !== "string") return;
  await borrarSubidos(cfg, entidadId, [ruta]);
}

/**
 * Guarda un comentario (o una respuesta, de un solo nivel) con sus archivos y avisa a las personas mencionadas y a quien escribió
 * el comentario respondido. `aviso` arma el título y el enlace de los avisos.
 */
export async function comentar(
  cfg: ConfigComentarios,
  persona: Persona,
  entidadId: string,
  texto: string,
  menciones: string[],
  adjuntos: AdjuntoSubido[],
  respuestaA: string | null,
  aviso: (comentarioId: string) => Promise<{ donde: string; href: string }>,
): Promise<{ error?: string }> {
  if (!ES_ID(entidadId)) return { error: "Registro no válido." };
  const limpio = String(texto ?? "").trim().slice(0, 5000);
  const archivos = Array.isArray(adjuntos) ? adjuntos : [];
  if (!limpio && !archivos.length) return { error: "Escribe el comentario o adjunta un archivo." };
  const supabase = createServiceClient();
  let padre: { id: string; autor_id: string | null } | null = null;
  if (respuestaA) {
    if (!ES_ID(respuestaA)) return { error: "El comentario al que respondes no es válido." };
    const { data: p } = await supabase.from(cfg.comentarios).select("id, autor_id, respuesta_a").eq("id", respuestaA).eq(cfg.fk, entidadId).maybeSingle();
    if (!p) return { error: "El comentario al que respondes ya no existe." };
    padre = { id: (p.respuesta_a as string | null) ?? (p.id as string), autor_id: (p.autor_id as string | null) ?? null };
  }
  const revisados = archivos.length ? await revisarSubidos(cfg, entidadId, archivos) : [];
  if ("error" in revisados) return revisados;
  const { data, error } = await supabase
    .from(cfg.comentarios)
    .insert({ [cfg.fk]: entidadId, autor: persona.nombre, autor_id: persona.id, texto: limpio, respuesta_a: padre?.id ?? null })
    .select("id")
    .single();
  if (error || !data) {
    await borrarSubidos(cfg, entidadId, archivos.map((a) => a.ruta));
    return { error: "No se pudo guardar el comentario." };
  }
  if (revisados.length) {
    const { error: e } = await supabase.from(cfg.adjuntos).insert(revisados.map((a) => ({ [cfg.fk]: entidadId, comentario_id: data.id, ...a, subido_por: persona.nombre })));
    if (e) {
      await supabase.from(cfg.comentarios).delete().eq("id", data.id);
      await borrarSubidos(cfg, entidadId, archivos.map((a) => a.ruta));
      return { error: "No se pudieron guardar los archivos." };
    }
  }
  const mencionados = await mencionadosValidos(menciones, limpio, persona.id);
  const respondido = padre?.autor_id && padre.autor_id !== persona.id && !mencionados.some((m) => m.id === padre!.autor_id) ? padre.autor_id : null;
  if (mencionados.length || respondido) {
    const { donde, href } = await aviso(data.id as string);
    await notificarMenciones({ mencionados, autorId: persona.id, autorNombre: persona.nombre, titulo: `${persona.nombre} te mencionó en ${donde}`, texto: limpio, href });
    if (respondido) await notificarMenciones({ mencionados: [{ id: respondido }], autorId: persona.id, autorNombre: persona.nombre, titulo: `${persona.nombre} respondió tu comentario en ${donde}`, texto: limpio, href });
  }
  return {};
}

/** Edita un comentario propio: texto, quitar archivos suyos y agregar otros (no puede quedar vacío). Avisa solo a las menciones nuevas. */
export async function editar(
  cfg: ConfigComentarios,
  persona: Persona,
  comentarioId: string,
  texto: string,
  menciones: string[],
  archivos: { quitar?: string[]; agregar?: AdjuntoSubido[] },
  aviso: (comentarioId: string) => Promise<{ donde: string; href: string }>,
): Promise<{ error?: string }> {
  const c = await comentarioDe(cfg, comentarioId);
  const agregar = Array.isArray(archivos?.agregar) ? archivos.agregar : [];
  if (!c) return { error: "El comentario ya no existe." };
  if (c.autorId !== persona.id) {
    await borrarSubidos(cfg, c.entidadId, agregar.map((a) => a?.ruta));
    return { error: "Solo quien escribió el comentario lo puede editar." };
  }
  const quitar = Array.isArray(archivos?.quitar) ? archivos.quitar.filter(ES_ID) : [];
  const limpio = String(texto ?? "").trim().slice(0, 5000);
  const supabase = createServiceClient();
  const { data: actuales } = await supabase.from(cfg.adjuntos).select("id, ruta").eq("comentario_id", comentarioId);
  const filas = (actuales ?? []) as { id: string; ruta: string | null }[];
  const aQuitar = filas.filter((a) => quitar.includes(a.id));
  const quedan = filas.length - aQuitar.length;
  if (limpio === c.texto && !aQuitar.length && !agregar.length) return {};
  if (!limpio && quedan + agregar.length === 0) {
    await borrarSubidos(cfg, c.entidadId, agregar.map((a) => a?.ruta));
    return { error: "El comentario no puede quedar vacío: escribe algo, deja un archivo o elimina el comentario." };
  }
  if (quedan + agregar.length > MAX_ADJUNTOS_COMENTARIO) {
    await borrarSubidos(cfg, c.entidadId, agregar.map((a) => a?.ruta));
    return { error: `Un comentario lleva hasta ${MAX_ADJUNTOS_COMENTARIO} archivos.` };
  }
  const revisados = agregar.length ? await revisarSubidos(cfg, c.entidadId, agregar) : [];
  if ("error" in revisados) return revisados;
  const { error } = await supabase.from(cfg.comentarios).update({ texto: limpio, editado_en: new Date().toISOString() }).eq("id", comentarioId);
  if (error) {
    await borrarSubidos(cfg, c.entidadId, revisados.map((a) => a.ruta));
    return { error: "No se pudo guardar el cambio." };
  }
  if (revisados.length) {
    const { error: e } = await supabase.from(cfg.adjuntos).insert(revisados.map((a) => ({ [cfg.fk]: c.entidadId, comentario_id: comentarioId, ...a, subido_por: persona.nombre })));
    if (e) {
      await borrarSubidos(cfg, c.entidadId, revisados.map((a) => a.ruta));
      return { error: "No se pudieron guardar los archivos nuevos." };
    }
  }
  if (aQuitar.length) {
    await supabase.from(cfg.adjuntos).delete().in("id", aQuitar.map((a) => a.id));
    const rutas = aQuitar.map((a) => a.ruta).filter((r): r is string => !!r && r.startsWith(carpeta(c.entidadId)) && !r.includes(".."));
    if (rutas.length) await supabase.storage.from(cfg.bucket).remove(rutas);
  }
  const nuevos = (await mencionadosValidos(menciones, limpio, persona.id)).filter((m) => !c.texto.includes(`@${m.nombre}`));
  if (nuevos.length) {
    const { donde, href } = await aviso(comentarioId);
    await notificarMenciones({ mencionados: nuevos, autorId: persona.id, autorNombre: persona.nombre, titulo: `${persona.nombre} te mencionó en ${donde}`, texto: limpio, href });
  }
  return {};
}

/**
 * Elimina un comentario propio con sus reacciones, sus respuestas propias y sus archivos (también del almacenamiento). Con
 * respuestas de otras personas no se puede. Devuelve el texto borrado para la auditoría.
 */
export async function eliminar(cfg: ConfigComentarios, persona: Persona, comentarioId: string): Promise<{ error?: string; entidadId?: string; texto?: string; archivos?: number }> {
  const c = await comentarioDe(cfg, comentarioId);
  if (!c) return { error: "El comentario ya no existe." };
  if (c.autorId !== persona.id) return { error: "Solo quien escribió el comentario lo puede eliminar." };
  const supabase = createServiceClient();
  const { data: respuestas } = await supabase.from(cfg.comentarios).select("id, autor_id").eq("respuesta_a", comentarioId);
  const filasR = (respuestas ?? []) as { id: string; autor_id: string | null }[];
  if (filasR.some((r) => r.autor_id !== persona.id)) return { error: "Tiene respuestas de otras personas, así que no se puede eliminar." };
  const ids = [comentarioId, ...filasR.map((r) => r.id)];
  const { data: archivos } = await supabase.from(cfg.adjuntos).select("ruta").in("comentario_id", ids);
  const rutas = ((archivos ?? []) as { ruta: string | null }[]).map((a) => a.ruta).filter((r): r is string => !!r && r.startsWith(carpeta(c.entidadId)) && !r.includes(".."));
  const { error } = await supabase.from(cfg.comentarios).delete().eq("id", comentarioId);
  if (error) return { error: "No se pudo eliminar el comentario." };
  if (rutas.length) await supabase.storage.from(cfg.bucket).remove(rutas);
  return { entidadId: c.entidadId, texto: c.texto, archivos: rutas.length };
}

/** Pone o quita una reacción (solo los emojis permitidos) y devuelve cómo quedan las del comentario. */
export async function reaccionar(cfg: ConfigComentarios, persona: Persona, comentarioId: string, emoji: string): Promise<{ error?: string; reacciones?: ReaccionComentario[] }> {
  if (!(EMOJIS_REACCION as readonly string[]).includes(emoji)) return { error: "Esa reacción no está permitida." };
  const supabase = createServiceClient();
  const { data: ya, error: e1 } = await supabase.from(cfg.reacciones).select("emoji").eq("comentario_id", comentarioId).eq("usuario_id", persona.id).eq("emoji", emoji).maybeSingle();
  if (e1) return { error: "No se pudo guardar la reacción." };
  const { error } = ya
    ? await supabase.from(cfg.reacciones).delete().eq("comentario_id", comentarioId).eq("usuario_id", persona.id).eq("emoji", emoji)
    : await supabase.from(cfg.reacciones).insert({ comentario_id: comentarioId, usuario_id: persona.id, usuario_nombre: persona.nombre, emoji });
  if (error) return { error: "No se pudo guardar la reacción." };
  const { data } = await supabase.from(cfg.reacciones).select("comentario_id, usuario_id, usuario_nombre, emoji").eq("comentario_id", comentarioId).order("creado_en");
  return { reacciones: agruparReacciones((data ?? []) as never, persona.id).get(comentarioId) ?? [] };
}
