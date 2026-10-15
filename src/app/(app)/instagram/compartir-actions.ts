"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { enlaceDeCompartido, llaveDeEnvio } from "@/lib/instagram/compartir";
import { guardarCapturas } from "@/lib/instagram/guardar";
import { enviosDe } from "@/lib/instagram/fusion";
import type { Plataforma } from "@/lib/instagram/plataformas";
import { createServiceClient } from "@/lib/supabase/server";

export interface ResultadoCompartido {
  error?: string;
  /** El N.º de la captura en la que quedó (la primera del mismo contenido, si ya existía). */
  numero?: number;
  /** ¿Era la primera vez que llegaba este contenido? */
  nueva?: boolean;
  /** Cuántas veces se compartió ya este contenido. */
  veces?: number;
  /** La red de lo compartido. */
  plataforma?: Plataforma;
  nombrePagina?: string | null;
  tieneArchivo?: boolean;
  /** ¿Se pudo leer la página pública de la red (copy y cifras)? Si no, la captura queda con lo básico. */
  leida?: boolean;
}

/**
 * Guarda lo que alguien compartió desde la hoja de «Compartir en…» de Instagram, Facebook o TikTok en el celular (la plataforma
 * instalada como app, ver `src/app/manifest.ts`, o el atajo de iPhone): saca el enlace del reel, video o publicación y lo guarda igual
 * que un mensaje directo, con quien compartió como remitente. Se lee la página pública del enlace (copy, cuenta, cifras y, si la red
 * lo deja, el video) y, si el contenido ya existía, se fusiona en su captura. Devuelve el error como valor: en producción Next.js
 * oculta el mensaje de una excepción.
 */
export async function compartirDesdeCelular(compartido: { title?: string; text?: string; url?: string }): Promise<ResultadoCompartido> {
  const usuario = await requireModuloEscritura("instagram");
  const dato = enlaceDeCompartido({ title: compartido?.title, text: compartido?.text, url: compartido?.url });
  if (!dato) return { error: "No encontré el enlace de un reel, video o publicación de Instagram, Facebook o TikTok en lo que compartiste. Ábrelo en la app y compártelo desde ahí." };
  const llave = llaveDeEnvio(usuario.id, dato.enlace);
  if (!llave) return { error: "El enlace compartido no es de un reel, video o publicación." };

  const { nuevas, ids } = await guardarCapturas(
    { origen: "compartir_celular", usuario: usuario.id, enlace: dato.enlace, plataforma: dato.plataforma },
    [{ mensajeId: llave, remitenteId: `web:${usuario.id}`, tipo: dato.tipo, enlace: dato.enlace, titulo: null, mediaId: null, textoMensaje: null, paginaDestino: dato.paginaDestino, urlVideo: null, plataforma: dato.plataforma }],
    { usuario: null, nombre: usuario.nombre || usuario.email },
  );

  // La captura en la que quedó: si el contenido ya tenía una, la nueva llegada se fusionó en ella. Con un reintento (el mismo envío en los
  // últimos minutos) no hay captura nueva: se busca por la llave del envío.
  const supabase = createServiceClient();
  let id: string | null = ids[0] ?? null;
  if (!id) {
    const propia = await supabase.from("instagram_capturas").select("id").eq("mensaje_id", llave).maybeSingle();
    id = (propia.data?.id as string | undefined) ?? null;
  }
  if (!id) {
    const fusionada = await supabase.from("instagram_capturas").select("id").contains("metricas", { envios: [{ mensaje_id: llave }] }).limit(1).maybeSingle();
    id = (fusionada.data?.id as string | undefined) ?? null;
  }
  if (!id) return { error: "No se pudo guardar. Inténtalo de nuevo." };
  const { data } = await supabase.from("instagram_capturas").select("id, numero, metricas, video_ruta").eq("id", id).maybeSingle();
  if (!data) return { error: "No se pudo guardar. Inténtalo de nuevo." };

  if (nuevas > 0) await registrarAuditoria({ accion: "compartir_captura_instagram", entidad: "instagram_capturas", entidadId: data.id, detalle: dato.enlace });
  revalidatePath("/instagram");
  const metricas = (data.metricas ?? {}) as Record<string, unknown>;
  return {
    numero: data.numero,
    nueva: nuevas > 0 && enviosDe(metricas).length === 0,
    veces: enviosDe(metricas).length + 1,
    plataforma: dato.plataforma,
    nombrePagina: typeof metricas.nombre_pagina === "string" ? metricas.nombre_pagina : null,
    tieneArchivo: !!data.video_ruta,
    leida: typeof metricas.leido_en === "string",
  };
}
