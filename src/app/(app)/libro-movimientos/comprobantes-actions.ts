"use server";

import { sinAccesoARegistros } from "@/lib/finanzas/acceso-tienda";

// Comprobantes de un movimiento (factura, recibo): imagen o PDF validado por su firma, en el bucket privado
// `fin-comprobantes` (migración 0925), con enlaces firmados de una hora. El archivo sube directo desde el navegador con
// una dirección firmada (las acciones no admiten archivos grandes) y el servidor lo revisa al guardarlo.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { BUCKET_COMPROBANTES, registrarArchivo } from "@/lib/finanzas/comprobantes-servidor";
import { nombreArchivoSeguro } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "libro-movimientos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr la migración 0925 en Supabase.";

const carpetaDe = (movimientoId: string) => `movimientos/${movimientoId}/`;
const rutaValida = (ruta: unknown, carpeta: string): ruta is string =>
  typeof ruta === "string" && ruta.startsWith(carpeta) && !ruta.includes("..") && ruta.length <= 300 && /^[A-Za-z0-9._/-]+$/.test(ruta);

/** Permiso para subir un comprobante a la carpeta de ese movimiento. */
export async function prepararSubidaComprobante(movimientoId: string, nombre: string): Promise<{ ruta: string; token: string } | { error: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!UUID.test(String(movimientoId))) return { error: "Movimiento inválido." };
    const acceso = await sinAccesoARegistros(createServiceClient(), "fin_movimientos", [movimientoId]);
    if (acceso) return { error: acceso };
    const { data: m } = await createServiceClient().from("fin_movimientos").select("id").eq("id", movimientoId).maybeSingle();
    if (!m) return { error: "El movimiento ya no existe." };
    const ruta = `${carpetaDe(movimientoId)}${crypto.randomUUID()}-${nombreArchivoSeguro(nombre, "comprobante")}`;
    const { data, error } = await createServiceClient().storage.from(BUCKET_COMPROBANTES).createSignedUploadUrl(ruta);
    if (error || !data) return { error: "No se pudo preparar la subida. ¿Está creado el bucket (migración 0925)?" };
    return { ruta, token: data.token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo preparar la subida." };
  }
}

/** Revisa un archivo subido (por su firma) y lo guarda como comprobante del movimiento. Si no sirve, lo borra. */
export async function guardarComprobante(movimientoId: string, ruta: string, nombre: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!UUID.test(String(movimientoId))) return { error: "Movimiento inválido." };
    const acceso = await sinAccesoARegistros(createServiceClient(), "fin_movimientos", [movimientoId]);
    if (acceso) return { error: acceso };
    if (!rutaValida(ruta, carpetaDe(movimientoId))) return { error: "El archivo no es de este movimiento." };
    const r = await registrarArchivo(movimientoId, ruta, nombre, usuario.id);
    if (r.error) return r;
    await registrarAuditoria({ accion: "adjuntar_comprobante", entidad: "fin_movimientos", entidadId: movimientoId, detalle: `Comprobante «${String(nombre ?? "").slice(0, 80)}»` });
    revalidatePath("/libro-movimientos");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el comprobante." };
  }
}

/** Descarta un archivo subido que no se guardó (solo de la carpeta de ese movimiento y si no es ya un comprobante). */
export async function descartarComprobanteSubido(movimientoId: string, ruta: string): Promise<void> {
  try {
    await requireModuloEscritura(MODULO);
    if (!UUID.test(String(movimientoId)) || !rutaValida(ruta, carpetaDe(movimientoId))) return;
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("fin_movimiento_adjuntos").select("id").eq("ruta", ruta).maybeSingle();
    if (error || data) return;
    await supabase.storage.from(BUCKET_COMPROBANTES).remove([ruta]);
  } catch {
    // nada
  }
}

export interface Comprobante {
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  url: string | null;
  creadoEn: string;
}

/** Los comprobantes de un movimiento con enlaces firmados de una hora. Es una lectura: basta poder abrir el libro. */
export async function listarComprobantes(movimientoId: string): Promise<{ error: string } | { comprobantes: Comprobante[] }> {
  try {
    await requireModulo(MODULO);
    if (!UUID.test(String(movimientoId))) return { error: "Movimiento inválido." };
    const acceso = await sinAccesoARegistros(createServiceClient(), "fin_movimientos", [movimientoId]);
    if (acceso) return { error: acceso };
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("fin_movimiento_adjuntos")
      .select("id, ruta, nombre, tipo, tamano, creado_en")
      .eq("movimiento_id", movimientoId)
      .order("creado_en");
    if (error) return { error: FALTA };
    const filas = data ?? [];
    const firmadas = filas.length ? await supabase.storage.from(BUCKET_COMPROBANTES).createSignedUrls(filas.map((f) => f.ruta as string), 3600) : { data: [] };
    const url = new Map((firmadas.data ?? []).map((x) => [x.path, x.signedUrl]));
    return {
      comprobantes: filas.map((f) => ({
        id: f.id as string,
        nombre: f.nombre as string,
        tipo: f.tipo as string,
        tamano: Number(f.tamano),
        url: url.get(f.ruta as string) ?? null,
        creadoEn: f.creado_en as string,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron leer los comprobantes." };
  }
}

export async function eliminarComprobante(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!UUID.test(String(id))) return { error: "Comprobante inválido." };
    const supabase = createServiceClient();
    const { data: c } = await supabase.from("fin_movimiento_adjuntos").select("ruta, nombre, movimiento_id").eq("id", id).maybeSingle();
    const acceso = c ? await sinAccesoARegistros(supabase, "fin_movimientos", [c.movimiento_id as string]) : null;
    if (acceso) return { error: acceso };
    if (!c) return { error: "El comprobante ya no existe." };
    const { error } = await supabase.from("fin_movimiento_adjuntos").delete().eq("id", id);
    if (error) return { error: error.message };
    if (String(c.ruta).startsWith("movimientos/") && !String(c.ruta).includes("..")) await supabase.storage.from(BUCKET_COMPROBANTES).remove([c.ruta as string]);
    await registrarAuditoria({ accion: "quitar_comprobante", entidad: "fin_movimientos", entidadId: c.movimiento_id as string, detalle: `Comprobante «${c.nombre}»` });
    revalidatePath("/libro-movimientos");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo quitar." };
  }
}
