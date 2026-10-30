"use server";

import { accesoCrm, pierdeLoBorrado } from "@/lib/crm/areas";
import { createServiceClient } from "@/lib/supabase/server";
import { areasDe, usuarioBandeja } from "./datos-bandeja";
import { contarSinResponder } from "./sin-responder";

/** Cuántos chats esperan respuesta en las áreas de la persona (el globo de la pestaña «Bandeja de WhatsApp»). `null` si no tiene acceso. */
export async function contarSinResponderCrm(): Promise<number | null> {
  const u = await usuarioBandeja(false);
  if (!u) return null;
  return contarSinResponder(createServiceClient(), areasDe(u), pierdeLoBorrado(accesoCrm(u)));
}
