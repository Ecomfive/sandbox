// Gestión de IDs Dropi › Fotos de cada publicación (migración 0153, pedido de Alcides, 25 oct 2026). Con la galería que trae la lectura
// diaria de «Mis productos» de Dropi, copia al bucket `wms-productos` (publicaciones/<id>/dropi/) las fotos de cada publicación que
// todavía no están y pone al día las ya copiadas (principal, orden, si Dropi aún la lista). El servidor sí puede bajar del CDN de Dropi
// (el navegador, desde la pestaña de Dropi, no: el CDN guarda copias sin la cabecera CORS). Lo llama `guardarNuestrosProductos`.
// Sin la migración no hace nada. Cada foto se revisa por su firma; una que no se puede bajar se intenta otra vez en la próxima lectura.

import type { SupabaseClient } from "@supabase/supabase-js";
import { galeriaDeProducto, planFotos, rutaFotoDropi, type FotoGaleria, type FotoGuardada } from "../src/lib/publicaciones/fotos-dropi";
import { idsDeDropi, productoPrincipal, type ProductoProveedor } from "../src/lib/publicaciones/sincronizar-dropi";
import { detectarImagen } from "../src/lib/seguridad/imagen";
import { descargarPublico } from "../src/lib/seguridad/url-externa";

const BUCKET = "wms-productos";
const MAX_BYTES = 15 * 1024 * 1024;

export interface ResumenFotos {
  sinTabla?: boolean;
  copiadas: number;
  actualizadas: number;
  fueraDeDropi: number;
  /** Copias repetidas de una misma foto que se quitaron. */
  repetidasQuitadas: number;
  errores: string[];
  /** Las que quedaron para la próxima lectura por el tope de esta. */
  pendientes: number;
}

async function bajar(f: FotoGaleria): Promise<{ bytes: Uint8Array; tipo: string; extension: string } | { error: string }> {
  let ultimo = "sin dirección";
  for (const url of [f.url, ...f.alternas]) {
    const r = await descargarPublico(url, MAX_BYTES);
    if ("error" in r) {
      ultimo = r.error;
      continue;
    }
    const img = detectarImagen(r.bytes);
    if (!img) {
      ultimo = "no es una imagen";
      continue;
    }
    return { bytes: r.bytes, tipo: img.tipo, extension: img.extension };
  }
  return { error: ultimo };
}

export async function copiarFotosDropi(
  supabase: SupabaseClient,
  pais: { id: string; codigo: string },
  crudos: (Record<string, unknown> & { archivado?: boolean })[],
  productos: Map<number, ProductoProveedor>,
  pubs: { id: string; dropi_id: string | null; estado_publicacion: string | null }[],
  max = 300,
): Promise<ResumenFotos> {
  const resumen: ResumenFotos = { copiadas: 0, actualizadas: 0, fueraDeDropi: 0, repetidasQuitadas: 0, errores: [], pendientes: 0 };
  // La galería de cada producto (la de activos manda si vino en las dos pestañas). Una lectura vieja sin direcciones no trae galería.
  const crudoDe = new Map<number, Record<string, unknown>>();
  for (const o of crudos) {
    const id = Number(o.id);
    if (Number.isInteger(id) && (!crudoDe.has(id) || !o.archivado)) crudoDe.set(id, o);
  }

  const trabajo: { pubId: string; productoId: number; galeria: FotoGaleria[] }[] = [];
  for (const pub of pubs) {
    if (pub.estado_publicacion === "borrador") continue;
    const p = productoPrincipal(idsDeDropi(pub.dropi_id), productos);
    const crudo = p ? crudoDe.get(p.id) : undefined;
    if (!p || !crudo) continue;
    const galeria = galeriaDeProducto({ id: p.id, gallery: crudo.gallery }, pais.codigo.toLowerCase());
    if (galeria.length) trabajo.push({ pubId: pub.id, productoId: p.id, galeria });
  }
  if (!trabajo.length) return resumen;

  // Lo ya copiado de esas publicaciones, de a 200 (sin la migración 0153, nada que hacer).
  const guardadas = new Map<string, FotoGuardada[]>();
  for (let i = 0; i < trabajo.length; i += 200) {
    const ids = trabajo.slice(i, i + 200).map((t) => t.pubId);
    const { data, error } = await supabase.from("dropi_publicacion_fotos").select("publicacion_id, nombre, principal, orden, en_dropi, ruta").in("publicacion_id", ids);
    if (error) return { ...resumen, sinTabla: /does not exist|schema cache/i.test(error.message) || undefined, errores: /does not exist|schema cache/i.test(error.message) ? [] : [error.message] };
    for (const g of data ?? [])
      guardadas.set(g.publicacion_id as string, [...(guardadas.get(g.publicacion_id as string) ?? []), { nombre: g.nombre as string, principal: !!g.principal, orden: Number(g.orden), enDropi: !!g.en_dropi, ruta: (g.ruta as string | null) ?? undefined }]);
  }

  const ahora = new Date().toISOString();
  let bajadas = 0;
  for (const t of trabajo) {
    const plan = planFotos(t.galeria, guardadas.get(t.pubId) ?? []);
    for (const a of plan.actualizar) {
      const { error } = await supabase.from("dropi_publicacion_fotos").update({ principal: a.principal, orden: a.orden, en_dropi: true, actualizado_en: ahora }).eq("publicacion_id", t.pubId).eq("nombre", a.nombre);
      if (error) resumen.errores.push(`${t.productoId} ${a.nombre}: ${error.message}`);
      else resumen.actualizadas++;
    }
    if (plan.fuera.length) {
      const { error } = await supabase.from("dropi_publicacion_fotos").update({ en_dropi: false, principal: false, actualizado_en: ahora }).eq("publicacion_id", t.pubId).in("nombre", plan.fuera);
      if (error) resumen.errores.push(`${t.productoId}: ${error.message}`);
      else resumen.fueraDeDropi += plan.fuera.length;
    }
    // La misma foto subida varias veces a Dropi (28 oct 2026, PUB-0446: 17 «Principal»): se queda una copia por foto.
    if (plan.repetidas.length) {
      const { error } = await supabase.from("dropi_publicacion_fotos").delete().eq("publicacion_id", t.pubId).in("nombre", plan.repetidas);
      if (error) resumen.errores.push(`${t.productoId}: ${error.message}`);
      else {
        resumen.repetidasQuitadas += plan.repetidas.length;
        if (plan.rutasBorrar.length) await supabase.storage.from(BUCKET).remove(plan.rutasBorrar);
      }
    }
    for (const f of plan.bajar) {
      if (bajadas >= max) {
        resumen.pendientes++;
        continue;
      }
      bajadas++;
      const b = await bajar(f);
      if ("error" in b) {
        resumen.errores.push(`${t.productoId} ${f.nombre}: ${b.error}`);
        continue;
      }
      const ruta = rutaFotoDropi(t.pubId, f.nombre, b.extension);
      const subida = await supabase.storage.from(BUCKET).upload(ruta, b.bytes, { contentType: b.tipo, upsert: true });
      if (subida.error) {
        resumen.errores.push(`${t.productoId} ${f.nombre}: ${subida.error.message}`);
        continue;
      }
      const url = supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
      const { error } = await supabase.from("dropi_publicacion_fotos").upsert(
        { publicacion_id: t.pubId, dropi_producto_id: t.productoId, nombre: f.nombre, origen_url: f.url, ruta, url, tipo: b.tipo, bytes: b.bytes.length, principal: f.principal, orden: f.orden, en_dropi: true, actualizado_en: ahora },
        { onConflict: "publicacion_id,nombre" },
      );
      if (error) resumen.errores.push(`${t.productoId} ${f.nombre}: ${error.message}`);
      else resumen.copiadas++;
    }
  }
  return resumen;
}
