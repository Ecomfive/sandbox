"use server";

import { getUsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { MODULO_ATENCION, MODULO_COMERCIAL } from "@/lib/crm/areas";
import { createServiceClient } from "@/lib/supabase/server";
import { puedeVerTelefonos } from "@/lib/whatsapp/telefono-oculto";
import { conversacionPermitida } from "./bandeja/datos-bandeja";

const ES_ID = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/**
 * «Mostrar número» (etapa 1 de ocultar los números, 28 oct 2026): entrega el WhatsApp real de un dropshipper, por ahora solo a un administrador. Cada vez que se
 * muestra queda en la auditoría quién lo vio. `tipo`: el chat de la bandeja o la ficha del dropshipper en el CRM.
 */
export async function mostrarTelefono(tipo: string, id: string): Promise<{ telefono: string } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !(u.modulos.includes(MODULO_ATENCION) || u.modulos.includes(MODULO_COMERCIAL))) return { error: "No tienes acceso." };
  if (!puedeVerTelefonos(u)) return { error: "Por ahora solo un administrador puede ver el número." };
  if ((tipo !== "conversacion" && tipo !== "dropshipper") || !ES_ID(id)) return { error: "Petición no válida." };
  const supabase = createServiceClient();
  let telefono: string | null = null;
  let nombre = "";
  if (tipo === "conversacion") {
    if (!(await conversacionPermitida(supabase, id, u))) return { error: "No se encontró el chat." };
    const { data } = await supabase.from("whatsapp_conversaciones").select("telefono, nombre_perfil, dropshippers(nombre)").eq("id", id).maybeSingle();
    telefono = (data?.telefono as string | null) ?? null;
    const d = data?.dropshippers as { nombre: string } | { nombre: string }[] | null | undefined;
    nombre = (Array.isArray(d) ? d[0]?.nombre : d?.nombre) ?? (data?.nombre_perfil as string | null) ?? "";
  } else {
    const { data } = await supabase.from("dropshippers").select("contacto_telefono, nombre").eq("id", id).maybeSingle();
    telefono = (data?.contacto_telefono as string | null) ?? null;
    nombre = (data?.nombre as string | null) ?? "";
  }
  if (!telefono) return { error: "No tiene número guardado." };
  await registrarAuditoria({ accion: "ver_telefono_dropshipper", entidad: tipo === "conversacion" ? "whatsapp_conversaciones" : "dropshippers", entidadId: id, detalle: nombre ? `Vio el número de ${nombre}` : "Vio un número" });
  return { telefono };
}
