import type { SupabaseClient } from "@supabase/supabase-js";
import { avisoTelefonosAjenos, telefonosEnTexto } from "./telefonos-ajenos";

/**
 * El aviso si un mensaje para un dropshipper lleva un teléfono que no es de la empresa (`./telefonos-ajenos`), o null. Los de la empresa
 * son todos los de `whatsapp_numeros` (también los apagados). Solo se consulta la base si el texto trae algo que parece un teléfono.
 */
export async function avisoNumerosAjenos(supabase: SupabaseClient, texto: string): Promise<string | null> {
  if (!texto || !telefonosEnTexto(texto).length) return null;
  const { data } = await supabase.from("whatsapp_numeros").select("numero");
  return avisoTelefonosAjenos(texto, (data ?? []).map((n) => String(n.numero ?? "")));
}
