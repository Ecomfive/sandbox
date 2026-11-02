"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { accesoCrm, escribeEnArea } from "@/lib/crm/areas";
import { normalizarTelefono } from "@/lib/crm/telefono";
import { createServiceClient } from "@/lib/supabase/server";
import { enviarPlantillaWhatsapp } from "@/lib/whatsapp/api";
import { avisoNumerosAjenos } from "@/lib/whatsapp/numeros-propios";
import { avisarBandeja } from "@/lib/whatsapp/aviso-bandeja";
import { resumenMensaje } from "@/lib/whatsapp/extraer";
import { contactosRestantes, inicioDelDiaPanama, motivoSinPlantilla, notaDePermiso, validarNuevoContacto } from "@/lib/whatsapp/nuevo-contacto";
import { rellenar, resolverVariables, type CampoVariable } from "@/lib/whatsapp/plantillas";
import { COLUMNAS_PLANTILLA, type PlantillaGuardada } from "@/lib/whatsapp/plantillas-servidor";
import { dropshipperPorTelefonos } from "@/lib/whatsapp/vinculo";
import { minutosVentana } from "@/lib/whatsapp/ventana";
import { usuarioBandeja } from "./datos-bandeja";

/** Una plantilla que se puede usar para un primer contacto, con lo que la ventana necesita para pedir y mostrar sus datos. */
export interface PlantillaNuevoContacto {
  id: string;
  nombre: string;
  categoria: string;
  encabezado: string | null;
  cuerpo: string;
  pie: string | null;
  botones: string[];
  variables: { campo: CampoVariable; etiqueta: string; ejemplo: string }[];
  /** Por qué no se puede usar (todavía no aprobada, sin botón para rechazar…), o null. */
  motivo: string | null;
}

const NOMBRE_DE_CAMPO: Record<string, string> = { primer_nombre: "Primer nombre", nombre_completo: "Nombre completo", tienda: "Nombre de su tienda" };

async function contactosIniciadosHoy(supabase: ReturnType<typeof createServiceClient>): Promise<number> {
  const { count } = await supabase.from("historial_auditoria").select("id", { count: "exact", head: true }).eq("accion", "iniciar_chat_whatsapp").gte("creado_en", inicioDelDiaPanama());
  return count ?? 0;
}

/** Las plantillas aprobadas (las que sirven primero) y cuántos contactos nuevos quedan hoy. Pide poder escribir en el CRM. */
export async function datosNuevoContacto(): Promise<{ plantillas: PlantillaNuevoContacto[]; restantesHoy: number } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("whatsapp_plantillas").select(COLUMNAS_PLANTILLA).eq("estado", "aprobada").order("nombre");
  if (error) return { error: "Falta correr la migración 0170 (plantillas de WhatsApp)." };
  const plantillas = ((data ?? []) as PlantillaGuardada[]).map<PlantillaNuevoContacto>((p) => ({
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria_actual ?? p.categoria,
    encabezado: p.encabezado,
    cuerpo: p.cuerpo,
    pie: p.pie,
    botones: p.botones ?? [],
    variables: (p.variables ?? []).map((v) => ({ campo: v.campo, etiqueta: v.campo === "manual" ? v.etiqueta?.trim() || "Dato" : (NOMBRE_DE_CAMPO[v.campo] ?? v.campo), ejemplo: v.ejemplo })),
    motivo: motivoSinPlantilla({ estado: p.estado, botones: p.botones ?? [] }),
  }));
  // Las que sirven primero.
  plantillas.sort((a, b) => Number(!!a.motivo) - Number(!!b.motivo));
  return { plantillas, restantesHoy: contactosRestantes(await contactosIniciadosHoy(supabase)) };
}

export interface PedidoNuevoContacto {
  numeroId: string;
  telefono: string;
  nombre: string;
  medio: string;
  nota: string;
  confirmo: boolean;
  plantillaId: string;
  manuales: string[];
}

/**
 * Le escribe por primera vez a alguien con una plantilla de primer contacto (30 oct 2026, pedido de Jhokser). Barreras, todas comprobadas aquí y no solo en la pantalla: poder escribir en el área del
 * número, un teléfono válido, la confirmación de que la persona aceptó (y cómo: queda como nota en el chat y en la auditoría), una plantilla aprobada **con botón para rechazar**, no repetirla a la
 * misma persona en 24 h y un tope de contactos nuevos al día. Si ya hay un chat con ese número y su ventana de 24 h está abierta, no manda nada: lo abre para que se le escriba directo. La
 * conversación solo se crea cuando WhatsApp aceptó el envío (así un fallo no deja un chat vacío).
 */
export async function iniciarChatConPlantilla(p: PedidoNuevoContacto): Promise<{ id: string; yaExistia: boolean; escribirDirecto: boolean } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const falta = validarNuevoContacto({ nombre: String(p.nombre ?? ""), medio: String(p.medio ?? ""), nota: String(p.nota ?? ""), confirmo: p.confirmo === true });
  if (falta) return { error: falta };
  const tel = normalizarTelefono(String(p.telefono ?? ""));
  if (!tel) return { error: "Escribe el número con el código del país, por ejemplo +58 412 555 0000." };
  if (!/^[0-9a-f-]{36}$/i.test(String(p.numeroId)) || !/^[0-9a-f-]{36}$/i.test(String(p.plantillaId))) return { error: "Elige el número de la empresa y la plantilla." };

  const supabase = createServiceClient();
  const { data: numero } = await supabase.from("whatsapp_numeros").select("id, area, phone_number_id, numero").eq("id", p.numeroId).eq("activo", true).maybeSingle();
  if (!numero) return { error: "Ese número de la empresa no está activo." };
  const area = numero.area as "atencion" | "comercial";
  if (!escribeEnArea(accesoCrm(u), area)) return { error: "No puedes escribir en el área de ese número." };

  const nombre = p.nombre.trim();
  const autor = u.nombre || u.email;

  // Si ya hay un chat con ese número: con la ventana abierta se le escribe directo (no hace falta una plantilla).
  const { data: existe } = await supabase.from("whatsapp_conversaciones").select("id, ultimo_entrante_en, asignada_a").eq("numero_id", numero.id).eq("telefono", tel.e164).maybeSingle();
  if (existe && minutosVentana((existe.ultimo_entrante_en as string | null) ?? null) > 0) return { id: existe.id as string, yaExistia: true, escribirDirecto: true };

  if (contactosRestantes(await contactosIniciadosHoy(supabase)) <= 0) return { error: "Ya llegaste al máximo de contactos nuevos de hoy. Mañana puedes seguir: así el número no se quema." };

  const { data: fila } = await supabase.from("whatsapp_plantillas").select(COLUMNAS_PLANTILLA).eq("id", p.plantillaId).maybeSingle();
  const pl = fila as PlantillaGuardada | null;
  if (!pl) return { error: "La plantilla ya no existe." };
  const motivo = motivoSinPlantilla({ estado: pl.estado, botones: pl.botones ?? [] });
  if (motivo) return { error: motivo };

  if (existe) {
    const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { count } = await supabase.from("whatsapp_mensajes").select("id", { count: "exact", head: true }).eq("conversacion_id", existe.id).eq("direccion", "saliente").eq("plantilla_id", pl.id).gte("momento", desde);
    if (count) return { error: "Ya le mandaste esta plantilla hoy. Espera su respuesta antes de repetirla." };
  }

  const vinculado = (await dropshipperPorTelefonos(supabase, [tel.e164])).get(tel.e164) ?? null;
  let persona = { nombre, tienda: null as string | null };
  if (vinculado) {
    const { data: ds } = await supabase.from("dropshippers").select("nombre, tiendas, tienda").eq("id", vinculado).maybeSingle();
    if (ds) persona = { nombre: (ds.nombre as string | null) ?? nombre, tienda: ((ds.tiendas as string[] | null)?.[0] ?? (ds.tienda as string | null)) ?? null };
  }
  const valores = resolverVariables(pl.variables ?? [], persona, Array.isArray(p.manuales) ? p.manuales.map(String) : []);
  if ("error" in valores) return valores;
  // Solo se comparten los números de WhatsApp de la empresa (31 oct 2026, pedido de Hernán).
  const ajenos = await avisoNumerosAjenos(supabase, valores.valores.join("\n"));
  if (ajenos) return { error: `No se manda: ${ajenos}` };

  const r = await enviarPlantillaWhatsapp({ phoneNumberId: numero.phone_number_id as string, numero: numero.numero as string }, tel.e164, pl.nombre, pl.idioma, valores.valores);
  if ("error" in r) return r;

  const ahora = new Date().toISOString();
  let conversacionId = existe?.id as string | undefined;
  if (!conversacionId) {
    const { data: nueva, error } = await supabase
      .from("whatsapp_conversaciones")
      .insert({ numero_id: numero.id, telefono: tel.e164, area, nombre_perfil: nombre, dropshipper_id: vinculado, estado: "abierta", asignada_a: u.id })
      .select("id")
      .single();
    if (error || !nueva) return { error: "Se le escribió, pero no se pudo crear el chat. Búscalo en la bandeja cuando responda." };
    conversacionId = nueva.id as string;
  }
  const texto = [pl.encabezado, rellenar(pl.cuerpo, valores.valores)].filter(Boolean).join("\n");
  await supabase.from("whatsapp_mensajes").insert([
    { conversacion_id: conversacionId, direccion: "nota", tipo: "texto", texto: notaDePermiso(autor, nombre, p.medio, p.nota), estado: "enviado", autor_id: u.id, autor_nombre: autor, momento: ahora },
    { conversacion_id: conversacionId, direccion: "saliente", tipo: "plantilla", texto, wa_id: r.waId, estado: "enviado", plantilla_id: pl.id, autor_id: u.id, autor_nombre: autor, momento: new Date(Date.parse(ahora) + 1).toISOString() },
  ]);
  await supabase
    .from("whatsapp_conversaciones")
    .update({ ultimo_mensaje_en: new Date(Date.parse(ahora) + 1).toISOString(), ultimo_texto: resumenMensaje("plantilla", texto), ultimo_de: "saliente", no_leidos: 0, ...(existe && !existe.asignada_a ? { asignada_a: u.id } : {}) })
    .eq("id", conversacionId);
  await registrarAuditoria({ accion: "iniciar_chat_whatsapp", entidad: "whatsapp_conversaciones", entidadId: conversacionId, detalle: `${pl.nombre} · permiso: ${p.medio}` });
  await avisarBandeja();
  return { id: conversacionId, yaExistia: !!existe, escribirDirecto: false };
}
