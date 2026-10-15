"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { enlaceDeCompartido, llaveDeEnvio } from "@/lib/instagram/compartir";
import { guardarCapturas } from "@/lib/instagram/guardar";
import { enviosDe } from "@/lib/instagram/fusion";
import { codigoDePublicacion } from "@/lib/instagram/repetidas";
import { createServiceClient } from "@/lib/supabase/server";

export interface ResultadoCompartido {
  error?: string;
  /** El N.º de la captura en la que quedó (la primera del mismo contenido, si ya existía). */
  numero?: number;
  /** ¿Era la primera vez que llegaba este contenido? */
  nueva?: boolean;
  /** Cuántas veces se compartió ya este contenido. */
  veces?: number;
  nombrePagina?: string | null;
  tieneArchivo?: boolean;
}

/**
 * Guarda lo que alguien compartió desde la hoja de «Compartir en…» de Instagram en el celular (la plataforma instalada como app, ver
 * `src/app/manifest.ts`): saca el enlace del reel o la publicación y lo guarda igual que un mensaje directo, con quien compartió como
 * remitente. Se lee la página pública del enlace (cifras, cuenta, video) y, si el contenido ya existía, se fusiona en su captura.
 * Devuelve el error como valor: en producción Next.js oculta el mensaje de una excepción.
 */
export async function compartirDesdeCelular(compartido: { title?: string; text?: string; url?: string }): Promise<ResultadoCompartido> {
  const usuario = await requireModuloEscritura("instagram");
  const dato = enlaceDeCompartido({ title: compartido?.title, text: compartido?.text, url: compartido?.url });
  if (!dato) return { error: "No encontré el enlace de un reel o una publicación en lo que compartiste. Ábrelo en Instagram y compártelo desde ahí." };
  const llave = llaveDeEnvio(usuario.id, dato.enlace);
  const codigo = codigoDePublicacion(dato.enlace);
  if (!llave || !codigo) return { error: "El enlace compartido no es de un reel o una publicación." };

  const { nuevas } = await guardarCapturas(
    { origen: "compartir_celular", usuario: usuario.id, enlace: dato.enlace },
    [{ mensajeId: llave, remitenteId: `web:${usuario.id}`, tipo: dato.tipo, enlace: dato.enlace, titulo: null, mediaId: null, textoMensaje: null, paginaDestino: dato.paginaDestino, urlVideo: null }],
    { usuario: null, nombre: usuario.nombre || usuario.email },
  );

  // Si el contenido ya tenía captura, la nueva llegada se fusionó en ella: se busca la primera del mismo contenido.
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("instagram_capturas")
    .select("id, numero, metricas, video_ruta")
    .ilike("enlace", `%/${codigo.replace(/_/g, "\\_")}%`)
    .order("numero", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return { error: "No se pudo guardar. Inténtalo de nuevo." };

  if (nuevas > 0) await registrarAuditoria({ accion: "compartir_captura_instagram", entidad: "instagram_capturas", entidadId: data.id, detalle: dato.enlace });
  revalidatePath("/instagram");
  const metricas = (data.metricas ?? {}) as Record<string, unknown>;
  return {
    numero: data.numero,
    nueva: nuevas > 0 && enviosDe(metricas).length === 0,
    veces: enviosDe(metricas).length + 1,
    nombrePagina: typeof metricas.nombre_pagina === "string" ? metricas.nombre_pagina : null,
    tieneArchivo: !!data.video_ruta,
  };
}
