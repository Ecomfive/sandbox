// Aviso cuando alguien pasa un chat de WhatsApp a otra área (17 nov 2026, pedido de Hernán: «que me avise si Nicol, de Atención, pasa un
// chat al mío»): un aviso «Para ti» (Centro de notificaciones) a quienes tienen esa área como propia y pueden escribir en ella, menos quien
// lo pasó. El área propia es la más alta que tiene la persona (Dirección > Comercial > Atención, como `areaPropia`). Si algo falla, sigue.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MODULO_ATENCION, MODULO_COMERCIAL, MODULO_DIRECCION, type AreaCrm } from "./areas";
import { personasConModulos } from "../whatsapp/personas-crm";

const MODULO_DE_AREA: Record<AreaCrm, string> = { atencion: MODULO_ATENCION, comercial: MODULO_COMERCIAL, direccion: MODULO_DIRECCION };
/** Las áreas por encima de cada una: quien tiene alguna de esas no tiene esta como propia. */
const ENCIMA: Record<AreaCrm, AreaCrm[]> = { atencion: ["comercial", "direccion"], comercial: ["direccion"], direccion: [] };

/** Quiénes reciben el aviso, de las listas de personas con cada módulo. Puro, con prueba. */
export function destinatariosPase(
  hacia: AreaCrm,
  conModulo: Record<AreaCrm, { id: string; soloLectura: boolean }[]>,
  autorId: string,
): string[] {
  const arriba = new Set(ENCIMA[hacia].flatMap((a) => conModulo[a].map((p) => p.id)));
  return [...new Set(conModulo[hacia].filter((p) => !p.soloLectura && p.id !== autorId && !arriba.has(p.id)).map((p) => p.id))];
}

export async function avisarPaseDeArea(
  supabase: SupabaseClient,
  a: { conversacionId: string; nombreChat: string; desde: string; hacia: AreaCrm; nombreHacia: string; autorId: string; autorNombre: string },
): Promise<number> {
  try {
    const [atencion, comercial, direccion] = await Promise.all(
      (["atencion", "comercial", "direccion"] as const).map((x) => personasConModulos(supabase, [MODULO_DE_AREA[x]])),
    );
    const conModulo: Record<AreaCrm, { id: string; soloLectura: boolean }[]> = { atencion, comercial, direccion };
    const ids = destinatariosPase(a.hacia, conModulo, a.autorId);
    if (!ids.length) return 0;
    const { error } = await supabase.from("notificaciones_usuario").insert(
      ids.map((id) => ({
        usuario_id: id,
        tipo: "whatsapp",
        titulo: `${a.autorNombre} te pasó un chat: ${a.nombreChat}`.slice(0, 200),
        texto: `De ${a.desde} a ${a.nombreHacia}. Ábrelo en la Bandeja de WhatsApp.`,
        href: `/crm-dropshippers/bandeja?abrir=${a.conversacionId}`,
        autor_id: a.autorId,
        autor_nombre: a.autorNombre,
      })),
    );
    return error ? 0 : ids.length;
  } catch {
    return 0;
  }
}
