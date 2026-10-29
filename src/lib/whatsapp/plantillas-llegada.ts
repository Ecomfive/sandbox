// Plantillas de aviso de llegada (29 oct 2026, pedido de Jhokser): un cliente pregunta por mercancía, se le dice para qué fecha llega, se crea la tarea «Avisar cuando llegue» y,
// el día que llega de verdad, el aviso por WhatsApp (pasadas las 24 h de su último mensaje) solo puede ir con una plantilla aprobada. Aquí:
//   * `asegurarBorradoresDeLlegada`: al crear esa tarea, las plantillas de aviso de llegada quedan en el sistema como **borrador** (las que falten; las que ya están no se tocan).
//   * `enviarBorradoresDeLlegada`: mandarlas a Meta **una cada dos minutos** (la regla de `enviarPlantillaAMeta`). Está **apagado** hasta que se defina `PLANTILLAS_LLEGADA_AUTO_META=1`
//     en el servidor: mientras el número no esté conectado, las plantillas se quedan como borrador. Importa con rutas relativas porque también lo usa `scripts/`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { conexionPlantillas } from "./api-plantillas";
import { segundosDeEspera } from "./plantillas";
import { PLANTILLAS_DE_LLEGADA, type PlantillaSugerida } from "./plantillas-sugeridas";
import { enviarPlantillaAMeta } from "./plantillas-servidor";

/** Las plantillas de aviso de llegada que todavía no están en el sistema (por nombre; ya estén en borrador o en Meta). */
export function faltantesDeLlegada(existentes: readonly string[]): PlantillaSugerida[] {
  const ya = new Set(existentes);
  return PLANTILLAS_DE_LLEGADA.filter((p) => !ya.has(p.nombre));
}

/** Si el envío automático a Meta está encendido (`PLANTILLAS_LLEGADA_AUTO_META=1`). Apagado, todo queda en borrador. */
export const envioAutomaticoActivo = (): boolean => process.env.PLANTILLAS_LLEGADA_AUTO_META === "1";

/** Deja en el sistema, como borrador, las plantillas de aviso de llegada que falten. Nunca lanza: sin la migración 0170 simplemente no crea nada. */
export async function asegurarBorradoresDeLlegada(supabase: SupabaseClient, autor: { id: string | null; nombre: string }): Promise<{ creadas: string[] }> {
  const { data, error } = await supabase.from("whatsapp_plantillas").select("nombre").eq("idioma", "es");
  if (error) return { creadas: [] };
  const creadas: string[] = [];
  for (const s of faltantesDeLlegada((data ?? []).map((p) => p.nombre as string))) {
    const { error: e } = await supabase.from("whatsapp_plantillas").insert({
      nombre: s.nombre,
      idioma: "es",
      categoria: s.categoria,
      cuerpo: s.cuerpo,
      botones: s.botones,
      variables: s.variables,
      sugerida: s.clave,
      creado_por: autor.id,
      creado_por_nombre: autor.nombre,
    });
    if (!e) creadas.push(s.nombre);
  }
  return { creadas };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Manda a Meta los borradores de aviso de llegada, uno tras otro con al menos dos minutos de diferencia (`segundosDeEspera`, contando también las plantillas mandadas desde la
 * pantalla). Se detiene al primer error, si no alcanza el tiempo (`presupuestoMs`; lo que falte sale en la próxima llamada) o si no queda ninguno. Una plantilla que Meta ya rechazó
 * (con `error_envio`) no se vuelve a mandar sola. Con el envío automático apagado o WhatsApp sin conectar no hace nada.
 */
export async function enviarBorradoresDeLlegada(supabase: SupabaseClient, presupuestoMs = 270_000): Promise<{ enviadas: string[]; motivo: string | null }> {
  if (!envioAutomaticoActivo()) return { enviadas: [], motivo: "El envío automático a Meta está apagado." };
  const conexion = conexionPlantillas();
  if (!conexion.conectado) return { enviadas: [], motivo: conexion.motivo };
  const inicio = Date.now();
  const enviadas: string[] = [];
  const claves = PLANTILLAS_DE_LLEGADA.map((p) => p.clave);
  for (;;) {
    const { data: siguiente } = await supabase
      .from("whatsapp_plantillas")
      .select("id, nombre")
      .in("sugerida", claves)
      .eq("estado", "borrador")
      .is("meta_id", null)
      .is("error_envio", null)
      .order("creado_en", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!siguiente) return { enviadas, motivo: null };
    const { data: ultima } = await supabase.from("whatsapp_plantillas").select("enviada_en").not("enviada_en", "is", null).order("enviada_en", { ascending: false }).limit(1).maybeSingle();
    const espera = segundosDeEspera((ultima?.enviada_en as string | null) ?? null);
    if (espera > 0) {
      // Unos segundos de margen sobre los dos minutos; si no cabe en el tiempo que queda, se deja para la próxima vez.
      if (Date.now() - inicio + (espera + 3) * 1000 > presupuestoMs) return { enviadas, motivo: null };
      await dormir((espera + 3) * 1000);
    }
    const r = await enviarPlantillaAMeta(supabase, siguiente.id as string);
    if ("error" in r) return { enviadas, motivo: r.error };
    enviadas.push(siguiente.nombre as string);
  }
}
