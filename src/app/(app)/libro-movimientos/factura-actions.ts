"use server";

import { sinAccesoAUnidades } from "@/lib/finanzas/acceso-tienda";

// Leer una factura (PDF o foto) con la API de Anthropic y crear el movimiento ya sugerido. Sin `ANTHROPIC_API_KEY` la
// función queda apagada (la página lo avisa). El archivo sube a una carpeta propia de la persona en el bucket privado y,
// al guardar el movimiento, pasa a ser su comprobante. Siempre se revisa antes de guardar: nada se crea solo.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { hoyPanama } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import { aprender } from "@/lib/finanzas/clasificacion";
import { BUCKET_COMPROBANTES, registrarArchivo, tipoComprobante } from "@/lib/finanzas/comprobantes-servidor";
import { descripcionDeFactura, leerRespuestaFactura, MODELO_PREDETERMINADO, pedidoFactura, type FacturaLeida, type MedioFactura } from "@/lib/finanzas/factura-ia";
import { leerReglas } from "@/lib/finanzas/guardar-libro";
import { UNIDAD_SIN_ASIGNAR } from "@/lib/finanzas/libro-excel";
import { leerDatosMovimiento, ORIGEN_MANUAL } from "@/lib/finanzas/movimiento-manual";
import { validarRucDv } from "@/lib/finanzas/ruc-panama";
import { indexar } from "@/lib/finanzas/similitud";
import { sugerirConConfianza } from "@/lib/finanzas/sugerencias-confianza";
import { nombreArchivoSeguro } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";

const MODULO = "libro-movimientos";
const MAX_IMAGEN = 5 * 1024 * 1024;
const MAX_PDF = 15 * 1024 * 1024;
const ESPERA_MS = 60_000;

const carpetaDe = (usuarioId: string) => `entrantes/${usuarioId}/`;
const rutaValida = (ruta: unknown, carpeta: string): ruta is string =>
  typeof ruta === "string" && ruta.startsWith(carpeta) && !ruta.includes("..") && ruta.length <= 300 && /^[A-Za-z0-9._/-]+$/.test(ruta);

/** Permiso para subir la factura a la carpeta de esta persona. */
export async function prepararSubidaFactura(nombre: string): Promise<{ ruta: string; token: string } | { error: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!process.env.ANTHROPIC_API_KEY) return { error: "La lectura de facturas está apagada: falta ANTHROPIC_API_KEY." };
    const ruta = `${carpetaDe(usuario.id)}${crypto.randomUUID()}-${nombreArchivoSeguro(nombre, "factura")}`;
    const { data, error } = await createServiceClient().storage.from(BUCKET_COMPROBANTES).createSignedUploadUrl(ruta);
    if (error || !data) return { error: "No se pudo preparar la subida. ¿Está creado el bucket (migración 0925)?" };
    return { ruta, token: data.token };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo preparar la subida." };
  }
}

export interface LecturaFactura {
  factura: FacturaLeida;
  descripcion: string;
  sugerencia: { unidad_id: string | null; tipo_id: string | null; confianza: number | null; detalle: string | null };
}

/** Sugiere tienda y tipo para la factura con lo ya clasificado del libro (reglas, firma y parecido). */
async function sugerirParaFactura(descripcion: string, monto: number) {
  const supabase = createServiceClient();
  const [sin, historial, reglas] = await Promise.all([
    supabase.from("fin_unidades").select("id").eq("nombre", UNIDAD_SIN_ASIGNAR).maybeSingle(),
    traerTodasConError<{ descripcion: string; unidad_id: string; tipo_id: string; monto: number | string }>((d, h) =>
      supabase.from("fin_movimientos").select("descripcion, unidad_id, tipo_id, monto").not("tipo_id", "is", null).order("id").range(d, h),
    ),
    leerReglas(supabase),
  ]);
  const sinAsignar = (sin.data?.id as string | undefined) ?? "sin-asignar";
  const hist = (historial.data ?? []).map((h) => ({ ...h, monto: Number(h.monto) }));
  const s = sugerirConConfianza({ descripcion, monto, unidad_id: sinAsignar, tipo_id: null }, sinAsignar, reglas, aprender(hist, sinAsignar), indexar(hist, sinAsignar));
  return { unidad_id: s.unidad_id, tipo_id: s.tipo_id, confianza: s.confianza, detalle: s.detalle };
}

/** Lee la factura subida con la API de Anthropic y devuelve los datos y la sugerencia de tienda y tipo. */
export async function leerFactura(ruta: string): Promise<{ error: string } | LecturaFactura> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const clave = process.env.ANTHROPIC_API_KEY;
    if (!clave) return { error: "La lectura de facturas está apagada: falta ANTHROPIC_API_KEY." };
    if (!rutaValida(ruta, carpetaDe(usuario.id))) return { error: "El archivo no es tuyo." };
    const { data, error } = await createServiceClient().storage.from(BUCKET_COMPROBANTES).download(ruta);
    if (error || !data) return { error: "No se encontró el archivo. Vuelve a subirlo." };
    const bytes = new Uint8Array(await data.arrayBuffer());
    const tipo = tipoComprobante(bytes);
    if (!tipo) return { error: "Se aceptan fotos (JPG, PNG, WebP, GIF) o PDF; se revisa el contenido, no el nombre." };
    const esPdf = tipo.tipo === "application/pdf";
    if (bytes.length > (esPdf ? MAX_PDF : MAX_IMAGEN)) return { error: esPdf ? "El PDF pesa más de 15 MB." : "La foto pesa más de 5 MB." };
    const medio: MedioFactura = esPdf ? { tipo: "pdf" } : { tipo: "imagen", mime: tipo.tipo as "image/jpeg" | "image/png" | "image/webp" | "image/gif" };
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), ESPERA_MS);
    let respuesta: Response;
    try {
      respuesta = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(pedidoFactura(medio, Buffer.from(bytes).toString("base64"), process.env.ANTHROPIC_MODEL || MODELO_PREDETERMINADO)),
        signal: control.signal,
      });
    } catch {
      return { error: "La lectura tardó demasiado o no hubo conexión. Inténtalo de nuevo." };
    } finally {
      clearTimeout(reloj);
    }
    if (!respuesta.ok) {
      return { error: respuesta.status === 401 ? "La clave de Anthropic no es válida." : respuesta.status === 429 ? "Demasiadas lecturas seguidas: espera un momento." : `La lectura falló (${respuesta.status}).` };
    }
    const factura = leerRespuestaFactura(await respuesta.json().catch(() => null));
    if ("error" in factura) return factura;
    const descripcion = descripcionDeFactura(factura) || "Factura";
    const sugerencia = await sugerirParaFactura(descripcion, factura.total ?? 0);
    await registrarAuditoria({ accion: "leer_factura", entidad: "fin_movimientos", detalle: `Factura leída: ${descripcion}${factura.total !== null ? ` · ${dinero(factura.total, factura.moneda, { decimales: 2 })}` : ""}` });
    return { factura, descripcion, sugerencia };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer la factura." };
  }
}

/** Descarta una factura subida que no se usó (solo de la carpeta de esta persona). */
export async function descartarFactura(ruta: string): Promise<void> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (rutaValida(ruta, carpetaDe(usuario.id))) await createServiceClient().storage.from(BUCKET_COMPROBANTES).remove([ruta]);
  } catch {
    // nada
  }
}

/**
 * Crea el movimiento revisado desde la factura (origen «manual») con su N° de factura y el RUC validado, y deja la factura
 * como su comprobante.
 */
export async function crearMovimientoDeFactura(formData: FormData): Promise<{ error?: string; aviso?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const d = leerDatosMovimiento((k) => formData.get(k));
    if ("error" in d) return d;
    const acceso = await sinAccesoAUnidades([d.unidad_id]);
    if (acceso) return { error: acceso };
    const ruta = String(formData.get("ruta") ?? "");
    if (ruta && !rutaValida(ruta, carpetaDe(usuario.id))) return { error: "El archivo no es tuyo." };
    const v = validarRucDv(String(formData.get("ruc") ?? ""), String(formData.get("dv") ?? ""));
    if (v.error) return { error: `RUC: ${v.error}` };
    const numero = String(formData.get("factura_numero") ?? "").trim().slice(0, 80) || null;
    const supabase = createServiceClient();
    const [u, t] = await Promise.all([
      supabase.from("fin_unidades").select("nombre").eq("id", d.unidad_id).maybeSingle(),
      supabase.from("fin_tipos").select("nombre").eq("id", d.tipo_id).maybeSingle(),
    ]);
    if (!u.data) return { error: "La tienda no existe." };
    if (!t.data) return { error: "El tipo no existe." };
    if (d.cuenta_id) {
      const { data: c } = await supabase.from("fin_cuentas").select("id").eq("id", d.cuenta_id).maybeSingle();
      if (!c) return { error: "La forma de pago no existe." };
    }
    const { data, error } = await supabase
      .from("fin_movimientos")
      .insert({
        ...d,
        fecha_registro: hoyPanama(),
        origen: ORIGEN_MANUAL,
        creado_por: usuario.id,
        factura_numero: numero,
        ruc_proveedor: v.ruc ? `${v.ruc}${v.dv ? ` DV ${v.dv}` : ""}` : null,
      })
      .select("id")
      .single();
    if (error || !data) return { error: `No se pudo guardar: ${error?.message ?? "sin respuesta"}` };
    const id = data.id as string;
    let aviso: string | undefined;
    if (ruta) {
      const destino = `movimientos/${id}/${ruta.split("/").pop()}`;
      const mov = await supabase.storage.from(BUCKET_COMPROBANTES).move(ruta, destino);
      const r = mov.error ? { error: "No se pudo mover la factura." } : await registrarArchivo(id, destino, String(formData.get("nombre_archivo") ?? "factura"), usuario.id);
      if (r.error) aviso = r.error;
    }
    await registrarAuditoria({
      accion: "crear_movimiento_libro",
      entidad: "fin_movimientos",
      entidadId: id,
      detalle: `Desde factura: ${d.descripcion} · ${u.data.nombre} · ${t.data.nombre} · ${dinero(d.monto, "USD", { decimales: 2 })} (${d.periodo.slice(0, 7)})`,
    });
    revalidatePath("/libro-movimientos", "layout");
    revalidatePath("/estado-resultados");
    return aviso ? { aviso: `Movimiento guardado, pero el comprobante no: ${aviso}` } : {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el movimiento." };
  }
}
