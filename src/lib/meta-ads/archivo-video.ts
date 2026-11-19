// Anuncios Meta › el archivo de un video: de dónde se saca la dirección temporal para analizarlo o reproducirlo. Lo usan el análisis con IA y el reproductor de la ficha del video.
// Meta no entrega siempre el archivo: depende de quién es dueño del video (la cuenta publicitaria o una página) y de a qué tiene acceso el usuario del sistema; por eso se prueba por tres vías.

import type { SupabaseClient } from "@supabase/supabase-js";
import { pedirMeta } from "./api";

export interface ArchivoDeVideo {
  /** La dirección temporal del archivo (la da Meta en `source`), o null si no se pudo conseguir. */
  fuente: string | null;
  duracion: number | null;
  /** Lo que contestó Meta al pedir el video suelto (para explicar por qué falló). */
  ficha: { ok: boolean; error?: string };
  paginasVistas: string;
  duenoDelVideo: string;
}

/** Si el error de Meta es de permisos (código 200, 10 o 294): el acceso del sistema no llega a ese video. */
export const esErrorDePermiso = (mensaje: string | undefined | null): boolean => /^Meta no deja leer esa cuenta/.test(mensaje ?? "");

/**
 * Busca la dirección del archivo del video. Primero el video suelto; si no la trae, la lista de videos de la cuenta publicitaria (los subidos con ella salen ahí con el permiso de anuncios);
 * y, por último, el token de cada página de Facebook que ve el acceso (los videos de una página se bajan con el de esa página). No lanza.
 */
export async function buscarArchivoDeVideo(supabase: SupabaseClient, token: string, videoId: string, cuentaId: string): Promise<ArchivoDeVideo> {
  const ficha = await pedirMeta(`/${videoId}`, { fields: "source,length" }, token);
  let datos = ficha.ok ? (ficha.datos as { source?: unknown; length?: unknown }) : null;
  if (typeof datos?.source !== "string") {
    const { data: cuenta } = await supabase.from("meta_cuentas").select("act_id").eq("id", cuentaId).maybeSingle();
    if (cuenta?.act_id && /^[0-9]{5,25}$/.test(videoId)) {
      const lista = await pedirMeta(`/${cuenta.act_id as string}/advideos`, { fields: "id,source,length", filtering: JSON.stringify([{ field: "id", operator: "IN", value: [videoId] }]), limit: "5" }, token);
      const fila = lista.ok ? ((lista.datos as { data?: Array<{ id?: string; source?: unknown; length?: unknown }> }).data ?? []).find((x) => x.id === videoId) : null;
      if (fila && typeof fila.source === "string") datos = fila;
    }
  }
  let paginasVistas = "";
  let duenoDelVideo = "";
  if (typeof datos?.source !== "string") {
    const paginas = await pedirMeta("/me/accounts", { fields: "id,name,access_token", limit: "50" }, token);
    const lista = paginas.ok ? ((paginas.datos as { data?: Array<{ id?: string; name?: string; access_token?: string }> }).data ?? []) : [];
    paginasVistas = lista.map((p) => p.name ?? p.id).filter(Boolean).join(", ");
    for (const p of lista) {
      if (!p.access_token) continue;
      const r = await pedirMeta(`/${videoId}`, { fields: "source,length,from" }, p.access_token);
      if (!r.ok) continue;
      const d = r.datos as { source?: unknown; length?: unknown; from?: { name?: string } };
      if (d.from?.name) duenoDelVideo = d.from.name;
      if (typeof d.source === "string") {
        datos = d;
        break;
      }
    }
    if (!duenoDelVideo && ficha.ok) {
      const d = await pedirMeta(`/${videoId}`, { fields: "from" }, token);
      if (d.ok) duenoDelVideo = ((d.datos as { from?: { name?: string } }).from?.name) ?? "";
    }
  }
  return {
    fuente: typeof datos?.source === "string" ? datos.source : null,
    duracion: typeof datos?.length === "number" ? Math.round(datos.length) : null,
    ficha: { ok: ficha.ok, error: ficha.ok ? undefined : ficha.error },
    paginasVistas,
    duenoDelVideo,
  };
}

/**
 * Por qué no se pudo leer el video, en palabras de quien administra el Business Manager: de qué cuenta es, a quién le falta el permiso y dónde se da. Con un error de permisos dice qué hacer;
 * con cualquier otro, lo que contestó Meta.
 */
export function motivoSinArchivoDeVideo(a: ArchivoDeVideo, cuentaNombre: string | null, permisosDados: string): string {
  const cuenta = cuentaNombre ? `la cuenta publicitaria «${cuentaNombre}»` : "la cuenta publicitaria de este video";
  if (!a.ficha.ok && esErrorDePermiso(a.ficha.error)) {
    const pagina = a.duenoDelVideo ? `la página de Facebook «${a.duenoDelVideo}»` : "la página de Facebook que publica el anuncio";
    return `Meta no deja leer el video de ${cuenta}: el usuario del sistema no tiene acceso a ${pagina}, dueña del video. En el Business Manager (Usuarios del sistema › Agregar activos › Páginas) hay que darle acceso a esa página.`;
  }
  if (!a.ficha.ok) return a.ficha.error ?? "Meta no contestó.";
  return `Meta contestó sin el archivo del video de ${cuenta} (no dio error). Permisos: ${permisosDados || "no se pudieron leer"}. Páginas que ve el acceso: ${a.paginasVistas || "ninguna"}. Dueño del video: ${a.duenoDelVideo || "no se pudo saber"}.`;
}
