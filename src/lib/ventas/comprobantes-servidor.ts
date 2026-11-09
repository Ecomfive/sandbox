import "server-only";

import { registrarAuditoria } from "@/lib/auditoria";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { createServiceClient } from "@/lib/supabase/server";
import {
  BUCKET_COMPROBANTES, ETIQUETA_COMPROBANTE, MAX_BYTES_COMPROBANTE, MAX_COMPROBANTES_POR_ORDEN, rutaComprobante, rutaEsDeOrden, tipoValido,
} from "@/lib/ventas/comprobantes";

// Lógica compartida del comprobante: la usan la ficha de la orden (con sesión) y la web app del mensajero (con su enlace).
// No comprueba permisos: quien la llama ya lo hizo.

const sinTabla = (m: string) => (/ven_orden_comprobantes/.test(m) ? "Falta correr la migración 0960 en Supabase." : m);

export async function permisoDeSubida(ordenId: string, nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  const supabase = createServiceClient();
  const { count, error: ec } = await supabase.from("ven_orden_comprobantes").select("id", { count: "exact", head: true }).eq("orden_id", ordenId);
  if (ec) return { error: sinTabla(ec.message) };
  if ((count ?? 0) >= MAX_COMPROBANTES_POR_ORDEN) return { error: `Una orden admite hasta ${MAX_COMPROBANTES_POR_ORDEN} comprobantes.` };
  const { data: bucket } = await supabase.storage.getBucket(BUCKET_COMPROBANTES);
  if (!bucket) await supabase.storage.createBucket(BUCKET_COMPROBANTES, { public: false });
  const ruta = rutaComprobante(ordenId, nombreArchivo);
  const { data, error } = await supabase.storage.from(BUCKET_COMPROBANTES).createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

/** Revisa la foto por su contenido y la guarda; si algo falla borra el archivo subido. */
export async function guardarComprobante(ordenId: string, ruta: string, tipo: string, nota: string | null | undefined, quien: string): Promise<{ error: string } | { ok: true }> {
  if (!rutaEsDeOrden(ruta, ordenId)) return { error: "El archivo no es de esta orden: vuelve a subirlo." };
  if (!tipoValido(tipo)) return { error: "Tipo de comprobante inválido." };
  const supabase = createServiceClient();
  const descartar = () => supabase.storage.from(BUCKET_COMPROBANTES).remove([ruta]);
  const { data: archivo, error } = await supabase.storage.from(BUCKET_COMPROBANTES).download(ruta);
  if (error || !archivo) return { error: "No se encontró el archivo: vuelve a subirlo." };
  if (archivo.size > MAX_BYTES_COMPROBANTE) { await descartar(); return { error: "La foto pesa más de 8 MB." }; }
  const tipoArchivo = detectarImagen(new Uint8Array(await archivo.slice(0, 64).arrayBuffer()));
  if (!tipoArchivo || tipoArchivo.tipo === "image/gif") { await descartar(); return { error: "El comprobante debe ser una foto JPG, PNG o WebP." }; }
  const limpia = typeof nota === "string" && nota.trim() ? nota.trim().slice(0, 200) : null;
  const { error: ei } = await supabase.from("ven_orden_comprobantes").insert({ orden_id: ordenId, tipo, ruta, nota: limpia, subido_por: quien });
  if (ei) { await descartar(); return { error: sinTabla(ei.message) }; }
  await supabase.from("ven_orden_eventos").insert({ orden_id: ordenId, tipo: "nota", detalle: `Comprobante de ${ETIQUETA_COMPROBANTE[tipo].toLowerCase()} subido${limpia ? `: ${limpia}` : ""}`, usuario: quien });
  await registrarAuditoria({ accion: "comprobante_orden_venta", entidad: "ven_ordenes", entidadId: ordenId, detalle: `Comprobante de ${tipo} (${quien})` });
  return { ok: true };
}
