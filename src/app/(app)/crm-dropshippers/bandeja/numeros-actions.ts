"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { avisarBandeja } from "@/lib/whatsapp/aviso-bandeja";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALTA = "Falta correr la migración 0209 (país de cada número de WhatsApp) en la base.";

export interface NumeroConPais {
  id: string;
  nombre: string;
  numero: string;
  /** Código ISO del país («PA»); null = sin elegir. */
  pais: string | null;
}

/**
 * «Números» de la bandeja (31 oct 2026, pedido de Hernán): los números de WhatsApp de la empresa con su país y los países de la operación, para que
 * quien administra elija de qué país es cada uno. Solo un administrador.
 */
export async function numerosConPais(): Promise<{ numeros: NumeroConPais[]; paises: { codigo: string; nombre: string }[] } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !esAdministrador(u)) return { error: "Solo quien administra el sistema puede cambiar el país de los números." };
  const supabase = createServiceClient();
  const [numerosR, paisesR] = await Promise.all([
    supabase.from("whatsapp_numeros").select("id, nombre, numero, paises(codigo)").eq("activo", true).order("nombre"),
    supabase.from("paises").select("codigo, nombre").order("nombre"),
  ]);
  if (numerosR.error) return { error: FALTA };
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return {
    numeros: (numerosR.data ?? []).map((n) => ({
      id: n.id as string,
      nombre: n.nombre as string,
      numero: n.numero as string,
      pais: uno(n.paises as { codigo: string } | { codigo: string }[] | null)?.codigo ?? null,
    })),
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
