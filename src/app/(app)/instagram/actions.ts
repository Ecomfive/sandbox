"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { enviosDe } from "@/lib/instagram/fusion";
import { enlaceLegible } from "@/lib/instagram/vista-previa";
import { BUCKET_INSTAGRAM, completarCaptura, fusionarRepetidas as fusionarRepetidasEnBase, unirCapturas as unirCapturasEnBase } from "@/lib/instagram/guardar";
import { createServiceClient } from "@/lib/supabase/server";
import { ESTADOS_INSTAGRAM, etiquetaEstadoInstagram } from "./def-instagram";

const MODULO = "instagram";
const ENTIDAD = "instagram_capturas";
const RUTA = "/instagram";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Las cifras de la publicación que se completan a mano: el campo en `metricas` y su etiqueta. */
const CIFRAS = [
  ["like_count", "Me gusta"],
  ["comments_count", "Comentarios"],
  ["view_count", "Vistas"],
  ["share_count", "Compartidos"],
] as const;
const ESTADOS: Set<string> = new Set(ESTADOS_INSTAGRAM.map((e) => e.valor));

/** Un enlace: solo http(s), para que un `javascript:` no termine en un `href`. */
function enlace(formData: FormData, campo: string, nombre: string): string | null | { error: string } {
  const t = String(formData.get(campo) ?? "").trim().slice(0, 2000);
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u.toString();
  } catch {
    return { error: `${nombre}: pega un enlace completo (https://…).` };
  }
}

/**
 * Guarda lo que se completa a mano en una captura: su estado, la página de destino y las notas. Lo demás (quién lo envió, el
 * enlace, el copy, el video) lo pone el webhook y no se edita. Devuelve el error como valor: en producción Next.js oculta el
 * mensaje de una excepción.
 */
export async function actualizarCaptura(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { error: "Captura no válida." };
  const estado = String(formData.get("estado") ?? "");
  if (!ESTADOS.has(estado)) return { error: "Estado no válido." };
  const pagina = enlace(formData, "pagina_destino", "Página de destino");
  if (pagina !== null && typeof pagina === "object") return pagina;
  const notas = String(formData.get("notas") ?? "").trim().slice(0, 4000) || null;
  // La cuenta del video, sin la arroba; vacía = sin dato.
  const autorTexto = String(formData.get("autor_usuario") ?? "").trim().replace(/^@/, "");
  if (autorTexto && !/^[\w.]{1,100}$/.test(autorTexto)) return { error: "Cuenta del video: solo letras, números, puntos y guiones bajos." };
  const autor = autorTexto || null;
  const nombrePagina = String(formData.get("nombre_pagina") ?? "").trim().slice(0, 120) || null;
  // El enlace de Instagram: solo de un reel o una publicación de instagram.com, sin parámetros; vacío = sin enlace.
  const enlaceTexto = String(formData.get("enlace") ?? "").trim().slice(0, 2000);
  let enlaceNuevo: string | null = null;
  if (enlaceTexto) {
    if (!enlaceLegible(enlaceTexto)) return { error: "Enlace de Instagram: pega el enlace de un reel o una publicación (https://www.instagram.com/reel/…)." };
    const u = new URL(enlaceTexto);
    enlaceNuevo = `https://www.instagram.com${u.pathname}`;
  }
  const fechaTexto = String(formData.get("fecha_publicacion") ?? "").trim();
  if (fechaTexto && (!/^\d{4}-\d{2}-\d{2}$/.test(fechaTexto) || Number.isNaN(Date.parse(fechaTexto)))) return { error: "Fecha de publicación no válida." };
  const fechaPublicacion = fechaTexto || null;
  // Las cifras de la publicación: enteros desde 0; vacío = sin dato.
  const cifras: Record<string, number | null> = {};
  for (const [campo, nombre] of CIFRAS) {
    const t = String(formData.get(campo) ?? "").trim();
    if (!t) {
      cifras[campo] = null;
      continue;
    }
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 2_000_000_000) return { error: `${nombre}: escribe un número entero desde 0.` };
    cifras[campo] = n;
  }
  // Cuántos anuncios de la misma página llevan este copy: lo llena la lectura de la Biblioteca y se puede corregir; vacío = sin dato.
  const anunciosTexto = String(formData.get("anuncios_mismo_copy") ?? "").trim();
  let anuncios: number | null = null;
  if (anunciosTexto) {
    const n = Number(anunciosTexto);
    if (!Number.isInteger(n) || n < 0 || n > 100_000) return { error: "Anuncios con el mismo copy: escribe un número entero desde 0." };
    anuncios = n;
  }

  const supabase = createServiceClient();
  const { data: antes } = await supabase.from(ENTIDAD).select("estado, pagina_destino, notas, autor_usuario, metricas, enlace").eq("id", id).maybeSingle();
  if (!antes) return { error: "La captura ya no existe." };
  // Las cifras se mezclan con lo que ya hay en `metricas` (la consulta a Instagram, por ejemplo): no se pierde nada.
  const metricasAntes = (antes.metricas ?? {}) as Record<string, unknown>;
  const metricas: Record<string, unknown> = { ...metricasAntes };
  for (const [campo] of CIFRAS) {
    if (cifras[campo] === null) delete metricas[campo];
    else metricas[campo] = cifras[campo];
  }
  const anunciosAntes = typeof metricasAntes.anuncios_mismo_copy === "number" ? metricasAntes.anuncios_mismo_copy : null;
  if (anuncios === null) delete metricas.anuncios_mismo_copy;
  else metricas.anuncios_mismo_copy = anuncios;
  const fechaAntes = typeof metricasAntes.fecha_publicacion === "string" ? metricasAntes.fecha_publicacion : null;
  if (fechaPublicacion === null) delete metricas.fecha_publicacion;
  else metricas.fecha_publicacion = fechaPublicacion;
  const nombreAntes = typeof metricasAntes.nombre_pagina === "string" ? metricasAntes.nombre_pagina : null;
  if (nombrePagina === null) delete metricas.nombre_pagina;
  else metricas.nombre_pagina = nombrePagina;
  // Si una persona cambia alguna cifra, la cuenta o la fecha, el dato ya no es el que se leyó solo.
  const cifrasCambiaron = CIFRAS.some(([campo]) => (typeof metricasAntes[campo] === "number" ? metricasAntes[campo] : null) !== cifras[campo]);
  if (cifrasCambiaron || (antes.autor_usuario ?? null) !== autor || fechaAntes !== fechaPublicacion || nombreAntes !== nombrePagina) metricas.fuente = "manual";
  const { error } = await supabase.from(ENTIDAD).update({ estado, pagina_destino: pagina, notas, autor_usuario: autor, enlace: enlaceNuevo, metricas, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudieron guardar los cambios." };

  const cambio: { antes: Record<string, string>; despues: Record<string, string> } = { antes: {}, despues: {} };
  if (antes.estado !== estado) {
    cambio.antes.Estado = etiquetaEstadoInstagram(antes.estado);
    cambio.despues.Estado = etiquetaEstadoInstagram(estado);
  }
  if ((antes.pagina_destino ?? null) !== pagina) {
    cambio.antes["Página de destino"] = antes.pagina_destino ?? "—";
    cambio.despues["Página de destino"] = pagina ?? "—";
  }
  if ((antes.notas ?? null) !== notas) {
    cambio.antes.Notas = antes.notas ? "(texto)" : "—";
    cambio.despues.Notas = notas ? "(texto)" : "—";
  }
  if ((antes.autor_usuario ?? null) !== autor) {
    cambio.antes["Cuenta del video"] = antes.autor_usuario ? `@${antes.autor_usuario}` : "—";
    cambio.despues["Cuenta del video"] = autor ? `@${autor}` : "—";
  }
  if ((antes.enlace ?? null) !== enlaceNuevo) {
    cambio.antes["Enlace de Instagram"] = antes.enlace ?? "—";
    cambio.despues["Enlace de Instagram"] = enlaceNuevo ?? "—";
  }
  if (nombreAntes !== nombrePagina) {
    cambio.antes["Nombre de la página"] = nombreAntes ?? "—";
    cambio.despues["Nombre de la página"] = nombrePagina ?? "—";
  }
  if (fechaAntes !== fechaPublicacion) {
    cambio.antes["Fecha de publicación"] = fechaAntes ?? "—";
    cambio.despues["Fecha de publicación"] = fechaPublicacion ?? "—";
  }
  if (anunciosAntes !== anuncios) {
    cambio.antes["Anuncios con el mismo copy"] = anunciosAntes === null ? "—" : String(anunciosAntes);
    cambio.despues["Anuncios con el mismo copy"] = anuncios === null ? "—" : String(anuncios);
  }
  for (const [campo, nombre] of CIFRAS) {
    const previo = typeof metricasAntes[campo] === "number" ? (metricasAntes[campo] as number) : null;
    if (previo !== cifras[campo]) {
      cambio.antes[nombre] = previo === null ? "—" : String(previo);
      cambio.despues[nombre] = cifras[campo] === null ? "—" : String(cifras[campo]);
    }
  }
  if (Object.keys(cambio.despues).length > 0) await registrarAuditoria({ accion: "actualizar_captura_instagram", entidad: ENTIDAD, entidadId: id, ...cambio });
  // Un enlace nuevo (pegado a mano) se lee enseguida: la página pública completa el archivo, las vistas, las cifras, la cuenta y el nombre.
  if (enlaceNuevo && enlaceNuevo !== (antes.enlace ?? null)) await completarCaptura(id).catch(() => null);
  revalidatePath(RUTA);
  return {};
}

/**
 * Cambia solo el estado de una captura (desde su celda en la lista, sin abrir la ficha). Deja la misma línea de actividad que
 * al cambiarlo desde la ficha. Devuelve el error como valor.
 */
export async function cambiarEstadoCaptura(id: string, estado: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Captura no válida." };
  if (!ESTADOS.has(estado)) return { error: "Estado no válido." };

  const supabase = createServiceClient();
  const { data: antes } = await supabase.from(ENTIDAD).select("estado").eq("id", id).maybeSingle();
  if (!antes) return { error: "La captura ya no existe." };
  if (antes.estado === estado) return {};
  const { error } = await supabase.from(ENTIDAD).update({ estado, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo cambiar el estado." };

  await registrarAuditoria({
    accion: "actualizar_captura_instagram",
    entidad: ENTIDAD,
    entidadId: id,
    antes: { Estado: etiquetaEstadoInstagram(antes.estado) },
    despues: { Estado: etiquetaEstadoInstagram(estado) },
  });
  revalidatePath(RUTA);
  return {};
}

/**
 * Vuelve a leer la página pública del enlace de una captura y la completa (archivo, me gusta, comentarios, vistas, cuenta y nombre de
 * la página). Deja una línea en la actividad. Devuelve el error como valor.
 */
export async function leerEnlaceDeCaptura(id: string): Promise<{ error?: string; archivo?: boolean }> {
  await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Captura no válida." };
  const r = await completarCaptura(id);
  if (!r.ok) return { error: r.error };
  await registrarAuditoria({ accion: "leer_enlace_captura_instagram", entidad: ENTIDAD, entidadId: id, detalle: r.archivo ? "Se guardó el archivo y se leyeron las cifras" : "Se leyeron las cifras" });
  revalidatePath(RUTA);
  return { archivo: r.archivo };
}

/**
 * Fusiona de una vez las capturas que ya estaban repetidas: cada grupo del mismo contenido queda en su primera captura, con todos los
 * datos y el registro de cada envío. Deja una línea en la actividad. Devuelve el error como valor.
 */
export async function fusionarCapturasRepetidas(): Promise<{ error?: string; fusionadas?: number }> {
  await requireModuloEscritura(MODULO);
  const r = await fusionarRepetidasEnBase().catch(() => null);
  if (!r) return { error: "No se pudieron fusionar las capturas." };
  if (r.fusionadas > 0) await registrarAuditoria({ accion: "fusionar_capturas_instagram", entidad: ENTIDAD, detalle: `Fusionó ${r.fusionadas} ${r.fusionadas === 1 ? "captura repetida" : "capturas repetidas"}` });
  revalidatePath(RUTA);
  return { fusionadas: r.fusionadas };
}

/**
 * Elimina una captura (y su archivo del almacenamiento, si ninguna otra lo usa). No se puede deshacer; deja una línea en la actividad
 * general. Devuelve el error como valor.
 */
export async function eliminarCaptura(id: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Captura no válida." };
  const supabase = createServiceClient();
  const { data } = await supabase.from(ENTIDAD).select("numero, video_ruta").eq("id", id).maybeSingle();
  if (!data) return { error: "La captura ya no existe." };
  const { error } = await supabase.from(ENTIDAD).delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar la captura." };
  if (data.video_ruta) {
    const { count } = await supabase.from(ENTIDAD).select("id", { count: "exact", head: true }).eq("video_ruta", data.video_ruta);
    if (!count) await supabase.storage.from(BUCKET_INSTAGRAM).remove([data.video_ruta]);
  }
  await registrarAuditoria({ accion: "eliminar_captura_instagram", entidad: ENTIDAD, entidadId: id, detalle: `IG-${String(data.numero).padStart(4, "0")}` });
  revalidatePath(RUTA);
  return {};
}

/**
 * Quita un envío de la lista de los que se fusionaron en una captura («Compartida N veces»), por ejemplo uno que fue una prueba. No
 * deshace los datos que ese envío haya completado. Devuelve el error como valor.
 */
export async function quitarEnvioDeCaptura(id: string, mensajeId: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id) || typeof mensajeId !== "string" || !mensajeId) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data } = await supabase.from(ENTIDAD).select("numero, metricas").eq("id", id).maybeSingle();
  if (!data) return { error: "La captura ya no existe." };
  const metricas = (data.metricas ?? {}) as Record<string, unknown>;
  const envios = enviosDe(metricas);
  const quedan = envios.filter((e) => e.mensaje_id !== mensajeId);
  if (quedan.length === envios.length) return { error: "Ese envío ya no está en la lista." };
  const { error } = await supabase.from(ENTIDAD).update({ metricas: { ...metricas, envios: quedan }, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo quitar el envío." };
  await registrarAuditoria({ accion: "quitar_envio_captura_instagram", entidad: ENTIDAD, entidadId: id, detalle: "Quitó un envío de la lista" });
  revalidatePath(RUTA);
  return {};
}

/**
 * Une dos capturas que son el mismo contenido (la más antigua queda y absorbe a la otra: enlace, copy, cifras, archivo, envíos). Deja una
 * línea en la actividad de la que queda. Devuelve el error como valor.
 */
export async function unirCapturas(idA: string, idB: string): Promise<{ error?: string; numero?: number; absorbida?: number }> {
  await requireModuloEscritura(MODULO);
  if (typeof idA !== "string" || typeof idB !== "string" || !UUID.test(idA) || !UUID.test(idB) || idA === idB) return { error: "Elige dos capturas distintas." };
  const r = await unirCapturasEnBase(idA, idB);
  if (!r.ok) return { error: r.error };
  await registrarAuditoria({
    accion: "unir_capturas_instagram",
    entidad: ENTIDAD,
    entidadId: r.principal.id,
    detalle: `Unió IG-${String(r.absorbida.numero).padStart(4, "0")} en esta captura`,
  });
  revalidatePath(RUTA);
  return { numero: r.principal.numero, absorbida: r.absorbida.numero };
}

/** El enlace firmado (una hora) del video de una captura, para verlo en su ficha. El bucket es privado. */
export async function urlVideoCaptura(id: string): Promise<{ url: string } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Captura no válida." };
  const supabase = createServiceClient();
  const { data } = await supabase.from(ENTIDAD).select("video_ruta").eq("id", id).maybeSingle();
  if (!data?.video_ruta) return { error: "Esta captura no tiene video." };
  const firmado = await supabase.storage.from(BUCKET_INSTAGRAM).createSignedUrl(data.video_ruta, 3600);
  if (firmado.error || !firmado.data) return { error: "No se pudo abrir el video." };
  return { url: firmado.data.signedUrl };
}

/** La actividad de una captura (de la auditoría), de la más nueva a la más vieja. Basta poder abrir el módulo. */
export async function obtenerHistorialCaptura(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Captura no válida." };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", ENTIDAD)
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}
