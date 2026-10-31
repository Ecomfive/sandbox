"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual } from "@/lib/auth";
import type { AreaCrm } from "@/lib/crm/areas";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { avisarBandeja } from "@/lib/whatsapp/aviso-bandeja";
import { paisDeNumeroEmpresa } from "@/lib/whatsapp/origen-chat";
import { claves360 } from "@/lib/whatsapp/proveedor";
import { NOMBRE_AREA } from "./enviar-medio";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr la migración 0209 (país de cada número de WhatsApp) en la base.";
const FALTA_PREVISTO = "Falta correr la migración 0210 (área de un número antes de su primer mensaje) en la base.";
/** El id de un número que todavía no entró (solo está su clave en el servidor): «previsto:50761234567». */
const PREVISTO = /^previsto:(\d{7,15})$/;
const digitos = (numero: string) => numero.replace(/\D/g, "");

export interface NumeroConPais {
  id: string;
  nombre: string;
  numero: string;
  /** Código ISO del país («PA»); null = sin elegir. */
  pais: string | null;
  /** Dónde caen sus chats: Atención, Comercial o Dirección. */
  area: AreaCrm;
  /** Con su clave en el servidor pero sin su primer mensaje todavía: el área que se elija la toma al entrar (migración 0210). */
  previsto: boolean;
}

/**
 * «Números» de la bandeja (31 oct 2026, pedido de Hernán): los números de WhatsApp de la empresa con su país y su área, y los países de la operación,
 * para que quien administra elija de qué país es cada uno y en qué área caen sus chats. Van también los que tienen su clave de 360dialog en el
 * servidor (`D360_API_KEY_<número>`) y todavía no recibieron un mensaje, para elegirles el área antes (el de Alcides, para Dirección). Solo un
 * administrador.
 */
export async function numerosConPais(): Promise<{ numeros: NumeroConPais[]; paises: { codigo: string; nombre: string }[] } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !esAdministrador(u)) return { error: "Solo quien administra el sistema puede cambiar el país de los números." };
  const supabase = createServiceClient();
  const [numerosR, paisesR, todosR, previstosR] = await Promise.all([
    supabase.from("whatsapp_numeros").select("id, nombre, numero, area, paises(codigo)").eq("activo", true).order("nombre"),
    supabase.from("paises").select("codigo, nombre").order("nombre"),
    // También los apagados: un número que ya entró (aunque esté apagado) no se ofrece como «por llegar».
    supabase.from("whatsapp_numeros").select("numero"),
    supabase.from("whatsapp_numeros_previstos").select("digitos, area, nombre"),
  ]);
  if (numerosR.error) return { error: FALTA };
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const yaEntraron = new Set((todosR.data ?? []).map((n) => digitos(n.numero as string)));
  // Sin la migración 0210 no se ofrecen los que están por llegar.
  const previstos = previstosR.error ? null : new Map((previstosR.data ?? []).map((p) => [p.digitos as string, p as { area: AreaCrm; nombre: string | null }]));
  const porLlegar: NumeroConPais[] = previstos
    ? [...new Set(claves360().map((c) => /^D360_API_KEY_(\d{7,15})$/.exec(c.variable)?.[1]).filter((d): d is string => !!d))]
        .filter((d) => !yaEntraron.has(d))
        .map((d) => ({ id: `previsto:${d}`, nombre: previstos.get(d)?.nombre || "Número nuevo", numero: `+${d}`, pais: paisDeNumeroEmpresa(d), area: previstos.get(d)?.area ?? "atencion", previsto: true }))
    : [];
  return {
    numeros: [
      ...(numerosR.data ?? []).map((n) => ({
        id: n.id as string,
        nombre: n.nombre as string,
        numero: n.numero as string,
        pais: uno(n.paises as { codigo: string } | { codigo: string }[] | null)?.codigo ?? paisDeNumeroEmpresa(n.numero as string),
        area: n.area as AreaCrm,
        previsto: false,
      })),
      ...porLlegar,
    ],
    paises: (paisesR.data ?? []) as { codigo: string; nombre: string }[],
  };
}

/** Cambia el país de un número de WhatsApp de la empresa (`codigo` null = sin país). Solo un administrador; queda en la auditoría. */
export async function cambiarPaisNumero(numeroId: string, codigo: string | null): Promise<{ ok: true } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !esAdministrador(u)) return { error: "Solo quien administra el sistema puede cambiar el país de los números." };
  if (typeof numeroId !== "string" || !UUID.test(numeroId)) return { error: "Número no válido." };
  if (codigo !== null && (typeof codigo !== "string" || !/^[A-Z]{2}$/.test(codigo))) return { error: "País no válido." };
  const supabase = createServiceClient();
  let paisId: string | null = null;
  let nombrePais = "sin país";
  if (codigo) {
    const { data: p } = await supabase.from("paises").select("id, nombre").eq("codigo", codigo).maybeSingle();
    if (!p) return { error: "Ese país no está en el sistema." };
    paisId = p.id as string;
    nombrePais = p.nombre as string;
  }
  const { data: numero, error } = await supabase.from("whatsapp_numeros").update({ pais_id: paisId }).eq("id", numeroId).select("nombre").maybeSingle();
  if (error) return { error: /pais_id|column|schema cache/i.test(error.message) ? FALTA : "No se pudo cambiar el país del número." };
  if (!numero) return { error: "Ese número ya no existe." };
  await registrarAuditoria({ accion: "pais_numero_whatsapp", entidad: "whatsapp_numeros", entidadId: numeroId, detalle: `${numero.nombre as string}: ${nombrePais}` });
  await avisarBandeja();
  revalidatePath("/crm-dropshippers/bandeja");
  return { ok: true };
}

/**
 * En qué área caen los chats de un número (Atención, Comercial o Dirección). En uno que ya entró, cambia el número y pasa a la nueva área sus chats
 * que estaban en la de antes (los que alguien pasó a otra área a mano se quedan donde están); en uno por llegar, queda previsto y el número entra
 * con esa área y con `nombre` (migración 0210). Solo un administrador; queda en la auditoría.
 */
export async function cambiarAreaNumero(numeroId: string, area: string, nombre?: string): Promise<{ ok: true; movidos: number } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !esAdministrador(u)) return { error: "Solo quien administra el sistema puede cambiar el área de los números." };
  if (typeof area !== "string" || !Object.hasOwn(NOMBRE_AREA, area)) return { error: "Área no válida." };
  const destino = area as AreaCrm;
  const supabase = createServiceClient();
  const previsto = typeof numeroId === "string" ? PREVISTO.exec(numeroId) : null;
  if (previsto) {
    const d = previsto[1];
    if (!claves360().some((c) => c.variable === `D360_API_KEY_${d}`)) return { error: "Ese número no tiene su clave de 360dialog en el servidor." };
    const limpio = typeof nombre === "string" ? nombre.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    const { error } = await supabase.from("whatsapp_numeros_previstos").upsert({ digitos: d, area: destino, nombre: limpio || `Ecomfive · ${NOMBRE_AREA[destino]}` });
    if (error) return { error: /previstos|schema cache|does not exist/i.test(error.message) ? FALTA_PREVISTO : "No se pudo guardar el área del número." };
    await registrarAuditoria({ accion: "area_numero_whatsapp", entidad: "whatsapp_numeros", detalle: `+${d} (por llegar): ${NOMBRE_AREA[destino]}` });
    return { ok: true, movidos: 0 };
  }
  if (typeof numeroId !== "string" || !UUID.test(numeroId)) return { error: "Número no válido." };
  const { data: antes } = await supabase.from("whatsapp_numeros").select("nombre, area").eq("id", numeroId).maybeSingle();
  if (!antes) return { error: "Ese número ya no existe." };
  if (antes.area === destino) return { ok: true, movidos: 0 };
  const { error } = await supabase.from("whatsapp_numeros").update({ area: destino }).eq("id", numeroId);
  if (error) return { error: "No se pudo cambiar el área del número." };
  const { data: movidos, error: errorChats } = await supabase.from("whatsapp_conversaciones").update({ area: destino }).eq("numero_id", numeroId).eq("area", antes.area as string).select("id");
  if (errorChats) return { error: "Se cambió el número, pero no se pudieron pasar sus chats. Inténtalo de nuevo." };
  await registrarAuditoria({
    accion: "area_numero_whatsapp",
    entidad: "whatsapp_numeros",
    entidadId: numeroId,
    detalle: `${antes.nombre as string}: ${NOMBRE_AREA[antes.area as AreaCrm] ?? antes.area} → ${NOMBRE_AREA[destino]} (${movidos?.length ?? 0} chats)`,
  });
  await avisarBandeja();
  revalidatePath("/crm-dropshippers/bandeja");
  return { ok: true, movidos: movidos?.length ?? 0 };
}
