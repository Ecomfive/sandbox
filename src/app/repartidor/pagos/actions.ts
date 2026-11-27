"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { FORMAS_PAGO_RECIBO, numeroRecibo, semanaEnLetras } from "@/lib/despacho/control-envios";
import { aSemana, BUCKET_RECIBOS, COLUMNAS_SEMANA, deliveryDeCourier } from "@/lib/despacho/datos-control";
import { armarRecibo, reciboPdf } from "@/lib/despacho/recibo-pdf";
import { cuentaRepartidorActual } from "@/lib/despacho/sesion-repartidor";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { ipDeLaPeticion, limitar } from "@/lib/seguridad/limite";
import { claveLimite, DEMASIADAS_ACCIONES, LIMITES } from "@/lib/seguridad/limite-reglas";
import { createServiceClient } from "@/lib/supabase/server";

// App del delivery › Mis pagos › Firmar recibo (25 nov 2026, pantalla 4 del prototipo aprobado). El delivery firma con el dedo el recibo de Oceans de
// una semana que Yiletsi le mandó: el servidor arma el PDF con lo que se le mandó (nada se toma del navegador salvo la firma), lo guarda en el archivo
// privado `despacho-recibos` y la semana queda firmada. Solo su propia semana y solo si está enviada.

const SIN_SESION = { error: "Tu sesión terminó. Vuelve a entrar." };
const PNG = [0x89, 0x50, 0x4e, 0x47];

/** La firma dibujada (PNG en «data:image/png;base64,…»), sin pasar de 400 KB; null si no sirve. */
function leerFirma(dataUrl: unknown): Uint8Array | null {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,") || dataUrl.length > 560_000) return null;
  const bytes = new Uint8Array(Buffer.from(dataUrl.slice(22), "base64"));
  if (bytes.length < 200 || !PNG.every((b, i) => bytes[i] === b)) return null;
  return bytes;
}

/** «26/11/2026 10:42» en Panamá. */
function ahoraPanama(): string {
  const d = new Date();
  const fecha = d.toLocaleDateString("en-GB", { timeZone: "America/Panama" });
  const hora = d.toLocaleTimeString("en-GB", { timeZone: "America/Panama", hour: "2-digit", minute: "2-digit" });
  return `${fecha} ${hora}`;
}

const nombreArchivo = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "delivery";

export async function firmarRecibo(semanaId: string, firma: string): Promise<{ error?: string }> {
  const cuenta = await cuentaRepartidorActual();
  if (!cuenta) return SIN_SESION;
  if (!(await limitar(claveLimite("repartidor", cuenta.id, (await ipDeLaPeticion()) ?? "sin-ip"), LIMITES.mensajero))) return { error: DEMASIADAS_ACCIONES };
  if (!esUuid(semanaId)) return { error: "Semana no válida." };
  const png = leerFirma(firma);
  if (!png) return { error: "Firma con el dedo en el recuadro antes de enviar." };
  const supabase = createServiceClient();
  const delivery = await deliveryDeCourier(supabase, cuenta.courier);
  if (!delivery) return { error: "Tu cuenta todavía no está en el control de envíos: avísale a Despacho." };
  const { data } = await supabase.from("despacho_semanas").select(COLUMNAS_SEMANA).eq("id", semanaId).maybeSingle();
  const semana = data ? aSemana(data as Record<string, unknown>) : null;
  if (!semana || semana.deliveryId !== delivery.id) return { error: "Esa semana no es tuya." };
  if (semana.estado === "firmada") return { error: "Ya firmaste esa semana." };
  if (semana.estado !== "enviada" || !semana.detalle) return { error: "Esa semana todavía no está cerrada." };
  if (!delivery.nombreCompleto || !delivery.cedula) return { error: "Faltan tu nombre completo o tu cédula en el sistema: avísale a Despacho." };

  const codigo = randomBytes(5).toString("hex").toUpperCase();
  const firmadoEn = ahoraPanama();
  const pdf = await reciboPdf(
    armarRecibo({
      numero: numeroRecibo(semana.semana, delivery.nombre),
      semana: semanaEnLetras(semana.semana),
      fechaPago: semana.fechaPago ?? semana.semana,
      formaPago: FORMAS_PAGO_RECIBO[delivery.formaPago],
      nombreCompleto: delivery.nombreCompleto,
      nombre: delivery.nombre,
      cedula: delivery.cedula,
      resumen: semana.detalle,
      ajustes: semana.ajustes,
      firmadoEn,
      codigo,
      firma: png,
    }),
  );
  const carpeta = `${semana.semana.slice(0, 4)}/semana-${semana.semana}`;
  const base = `${nombreArchivo(delivery.nombre)}-${codigo}`;
  const firmaRuta = `${carpeta}/firmas/${base}.png`;
  const pdfRuta = `${carpeta}/${base}.pdf`;
  const subidaFirma = await supabase.storage.from(BUCKET_RECIBOS).upload(firmaRuta, png, { contentType: "image/png", upsert: false });
  const subidaPdf = await supabase.storage.from(BUCKET_RECIBOS).upload(pdfRuta, pdf, { contentType: "application/pdf", upsert: false });
  if (subidaFirma.error || subidaPdf.error) return { error: "No se pudo guardar el recibo. Revisa la señal y vuelve a probar." };
  const { data: hecho, error } = await supabase
    .from("despacho_semanas")
    .update({ estado: "firmada", firmada_en: new Date().toISOString(), firma_ruta: firmaRuta, pdf_ruta: pdfRuta, codigo, actualizado_en: new Date().toISOString() })
    .eq("id", semana.id)
    .eq("estado", "enviada")
    .select("id")
    .maybeSingle();
  if (error || !hecho) return { error: "No se pudo guardar la firma: puede que Despacho haya vuelto a abrir la semana. Revisa Mis pagos." };
  await registrarAuditoria({ accion: "firmar_recibo_delivery", entidad: "despacho_semanas", entidadId: semana.id, detalle: `${delivery.nombre} · ${semana.semana} · ${codigo}` });
  revalidatePath("/repartidor/pagos");
  revalidatePath("/despacho-ciudad/control");
  return {};
}
