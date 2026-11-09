"use server";

import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { sinAccesoARegistros } from "@/lib/finanzas/acceso-tienda";
import { createServiceClient } from "@/lib/supabase/server";
import { guardarComprobante, permisoDeSubida } from "@/lib/ventas/comprobantes-servidor";
import { BUCKET_COMPROBANTES, MAX_COMPROBANTES_POR_ORDEN, type TipoComprobante } from "@/lib/ventas/comprobantes";

const MODULO = "ventas-tiendas";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const falla = (e: unknown): { error: string } => ({ error: e instanceof Error ? e.message : "No se pudo guardar." });
const sinTabla = (m: string) => (/ven_orden_comprobantes/.test(m) ? "Falta correr la migración 0960 en Supabase." : m);

export interface ComprobanteVista { id: string; tipo: TipoComprobante; nota: string | null; por: string | null; en: string; url: string | null }

/** Permiso firmado para subir directo al almacén (una acción del servidor no admite fotos grandes). */
export async function prepararSubidaComprobante(ordenId: string, nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!UUID.test(ordenId)) return { error: "Orden inválida." };
    const acceso = await sinAccesoARegistros(createServiceClient(), "ven_ordenes", [ordenId]);
    if (acceso) return { error: acceso };
    return await permisoDeSubida(ordenId, nombreArchivo);
  } catch (e) {
    return falla(e);
  }
}

/** Guarda el comprobante ya subido (se revisa por su contenido y que la ruta sea de esa orden). */
export async function registrarComprobante(ordenId: string, ruta: string, tipo: string, nota?: string | null): Promise<{ error: string } | { ok: true }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!UUID.test(ordenId)) return { error: "Orden inválida." };
    const acceso = await sinAccesoARegistros(createServiceClient(), "ven_ordenes", [ordenId]);
    if (acceso) return { error: acceso };
    return await guardarComprobante(ordenId, ruta, tipo, nota, usuario.nombre ?? usuario.email);
  } catch (e) {
    return falla(e);
  }
}

/** Comprobantes de una orden con enlaces firmados de una hora. */
export async function listarComprobantes(ordenId: string): Promise<ComprobanteVista[] | { error: string }> {
  try {
    await requireModulo(MODULO);
    if (!UUID.test(ordenId)) return { error: "Orden inválida." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "ven_ordenes", [ordenId]);
    if (acceso) return { error: acceso };
    const { data, error } = await supabase.from("ven_orden_comprobantes").select("id, tipo, ruta, nota, subido_por, creado_en").eq("orden_id", ordenId).order("creado_en", { ascending: false }).limit(MAX_COMPROBANTES_POR_ORDEN);
    if (error) return { error: sinTabla(error.message) };
    const filas = (data ?? []) as { id: string; tipo: TipoComprobante; ruta: string; nota: string | null; subido_por: string | null; creado_en: string }[];
    const firmadas = filas.length ? await supabase.storage.from(BUCKET_COMPROBANTES).createSignedUrls(filas.map((f) => f.ruta), 3600) : { data: [] as { path: string | null; signedUrl: string }[] };
    const url = new Map((firmadas.data ?? []).map((f) => [f.path, f.signedUrl]));
    return filas.map((f) => ({ id: f.id, tipo: f.tipo, nota: f.nota, por: f.subido_por, en: f.creado_en, url: url.get(f.ruta) ?? null }));
  } catch (e) {
    return falla(e);
  }
}
