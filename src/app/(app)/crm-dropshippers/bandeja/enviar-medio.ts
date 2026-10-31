// Mandar algo que no es texto por WhatsApp (fotos, audios, video, documentos, GIF y stickers) desde la bandeja. Lo comparten los archivos que se suben (`actions.ts`) y los GIF y
// stickers (`expresiones-actions.ts`). No es un archivo «use server»: son piezas del servidor que esas acciones llaman después de revisar quién es la persona.

import { registrarAuditoria } from "@/lib/auditoria";
import { accesoCrm, supervisaArea, type AreaCrm } from "@/lib/crm/areas";
import { createServiceClient } from "@/lib/supabase/server";
import { avisarBandeja } from "@/lib/whatsapp/aviso-bandeja";
import { enviarArchivoWhatsapp, subirMedioWhatsapp } from "@/lib/whatsapp/api";
import { avisoNumerosAjenos } from "@/lib/whatsapp/numeros-propios";
import { TIPO_DE_MENSAJE, type TipoEnvio } from "@/lib/whatsapp/archivos";
import { resumenMensaje } from "@/lib/whatsapp/extraer";
import { minutosVentana } from "@/lib/whatsapp/ventana";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

export const NOMBRE_AREA: Record<AreaCrm, string> = { atencion: "Atención", comercial: "Comercial", direccion: "Dirección" };

/**
 * Supervisión (29 oct 2026): quien mira un chat de un área de abajo (Comercial en Atención, Dirección en las dos) no le responde al
 * dropshipper hasta «Intervenir» (el chat queda a su cargo). Devuelve el aviso, o null si puede responder.
 */
export function avisoSupervision(u: { modulos: string[]; modulosSoloLectura: string[]; id: string }, c: { area: AreaCrm; asignadaA: string | null }): string | null {
  if (!supervisaArea(accesoCrm(u), c.area) || c.asignadaA === u.id) return null;
  return `Estás supervisando el panel de ${NOMBRE_AREA[c.area]}: para responderle, toca «Intervenir».`;
}

/** Donde quedan los archivos que se mandan (el bucket de los chats importados, migración 0169): `<chat>/enviados/…`. El chat los muestra con `/api/whatsapp/media/<mensaje>`. */
export const BUCKET_ARCHIVOS = "whatsapp-importados";
/** Un texto al pie de una foto, un video o un documento: WhatsApp admite hasta 1024 caracteres. */
export const MAX_PIE = 1024;

type ChatPermitido = NonNullable<Awaited<ReturnType<typeof conversacionPermitida>>>;
export type ChatParaEnviar = { u: NonNullable<Awaited<ReturnType<typeof usuarioBandeja>>>; c: ChatPermitido; supabase: ReturnType<typeof createServiceClient> };

/** Lo que hace falta para mandarle algo a un dropshipper: poder escribir en el chat, no estar solo supervisando y la ventana de 24 h abierta. */
export async function chatParaEnviar(id: string): Promise<ChatParaEnviar | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  const c = await conversacionPermitida(supabase, id, u, true);
  if (!c) return { error: "Esa conversación no existe o no es de tu área." };
  const supervisando = avisoSupervision(u, c);
  if (supervisando) return { error: supervisando };
  if (minutosVentana(c.ultimoEntranteEn) <= 0) return { error: "Pasaron más de 24 h desde su último mensaje: por WhatsApp solo se le puede escribir con una plantilla aprobada." };
  return { u, c, supabase };
}

/**
 * Un permiso firmado para que el navegador suba un archivo directo al almacén (una acción del servidor no admite archivos grandes). Si el almacén todavía no existe (la migración 0169 no se
 * corrió) se crea aquí y se vuelve a pedir; sin almacén, Supabase no dice «bucket» sino «The related resource does not exist», así que ante cualquier error se intenta crearlo una vez.
 */
export async function permisoDeSubida(supabase: ChatParaEnviar["supabase"], ruta: string): Promise<{ token: string } | { error: string }> {
  const pedir = () => supabase.storage.from(BUCKET_ARCHIVOS).createSignedUploadUrl(ruta);
  let { data, error } = await pedir();
  if (error) {
    await supabase.storage.createBucket(BUCKET_ARCHIVOS, { public: false, fileSizeLimit: 25 * 1024 * 1024 });
    ({ data, error } = await pedir());
  }
  if (error || !data) {
    console.error("[whatsapp] no se pudo preparar la subida de un archivo:", error?.message);
    return { error: `No se pudo preparar la subida del archivo${error?.message ? ` (${error.message})` : ""}.` };
  }
  return { token: data.token };
}

const DESCRIPCION: Record<TipoEnvio, string> = { imagen: "una foto", audio: "un audio", video: "un video", documento: "un documento", sticker: "un sticker" };

/**
 * Sube el archivo a WhatsApp, lo manda y lo deja en el chat. `ruta` es donde está (o va a quedar, con `subir`) en el almacén, dentro de `<chat>/enviados/`. Si algo falla antes de que salga,
 * el archivo del almacén se borra. Ya salido, un fallo al anotarlo en el historial se avisa sin reintentar (para no mandarlo dos veces).
 */
export async function mandarMedioGuardado(
  e: ChatParaEnviar,
  a: { bytes: Uint8Array; nombre: string; pie: string; ruta: string; tipo: TipoEnvio; mime: string; subir?: boolean },
): Promise<{ ok: true } | { error: string }> {
  const { u, c, supabase } = e;
  const quitar = () => supabase.storage.from(BUCKET_ARCHIVOS).remove([a.ruta]);
  // El pie del archivo tampoco lleva teléfonos que no son de la empresa; lo que el navegador ya subió se borra.
  const ajenos = await avisoNumerosAjenos(supabase, a.pie);
  if (ajenos) {
    if (!a.subir) await quitar();
    return { error: `No se manda: ${ajenos}` };
  }
  if (a.subir) {
    const { error } = await supabase.storage.from(BUCKET_ARCHIVOS).upload(a.ruta, a.bytes, { contentType: a.mime, upsert: false });
    if (error) return { error: "No se pudo guardar el archivo. Inténtalo de nuevo." };
  }
  const de = { phoneNumberId: c.phoneNumberId, numero: c.numeroEmpresa };
  const subida = await subirMedioWhatsapp(de, a.bytes, a.mime, a.nombre);
  if ("error" in subida) {
    await quitar();
    return { error: subida.error };
  }
  const r = await enviarArchivoWhatsapp(de, c.telefono, a.tipo, subida.id, { texto: a.pie, nombre: a.nombre });
  if ("error" in r) {
    await quitar();
    return { error: r.error };
  }
  const ahora = new Date().toISOString();
  const tipo = TIPO_DE_MENSAJE[a.tipo];
  const llevaPie = a.tipo !== "audio" && a.tipo !== "sticker" && a.pie;
  const { error } = await supabase.from("whatsapp_mensajes").insert({
    conversacion_id: c.id,
    direccion: "saliente",
    tipo,
    texto: llevaPie ? a.pie : null,
    media_id: `storage:${a.ruta}`,
    media_mime: a.mime,
    media_nombre: a.nombre,
    wa_id: r.waId,
    estado: "enviado",
    autor_id: u.id,
    autor_nombre: u.nombre || u.email,
    momento: ahora,
  });
  if (error) return { error: "Se envió, pero no se pudo guardar en el historial. Recarga la bandeja." };
  await supabase
    .from("whatsapp_conversaciones")
    .update({ ultimo_mensaje_en: ahora, ultimo_texto: resumenMensaje(tipo, llevaPie ? a.pie : null), ultimo_de: "saliente", no_leidos: 0, ...(c.asignadaA ? {} : { asignada_a: u.id }) })
    .eq("id", c.id);
  await registrarAuditoria({ accion: "enviar_archivo_whatsapp", entidad: "whatsapp_conversaciones", entidadId: c.id, detalle: `Mandó ${DESCRIPCION[a.tipo]}` });
  await avisarBandeja();
  return { ok: true };
}
