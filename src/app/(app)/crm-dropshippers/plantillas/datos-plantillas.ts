import type { SupabaseClient } from "@supabase/supabase-js";
import { COLUMNAS_PLANTILLA, type PlantillaGuardada } from "@/lib/whatsapp/plantillas-servidor";

/** Una alerta de WhatsApp (plantilla aprobada, rechazada, pausada; calidad; cuenta) para mostrar arriba. */
export interface AlertaVista {
  id: string;
  tipo: string;
  severidad: "info" | "aviso" | "critica";
  titulo: string;
  detalle: string | null;
  plantillaId: string | null;
  vista: boolean;
  creadoEn: string;
}

/** Un número de la empresa con el límite de envío que avisó Meta (null mientras no haya avisado). */
export interface NumeroLimite {
  id: string;
  nombre: string;
  numero: string;
  limite: string | null;
}

/** Las plantillas, las últimas alertas y el límite de cada número. `null` si falta la migración 0170. */
export async function cargarPlantillas(supabase: SupabaseClient): Promise<{ plantillas: PlantillaGuardada[]; alertas: AlertaVista[]; numeros: NumeroLimite[] } | null> {
  const [plantillasR, alertasR, numerosR] = await Promise.all([
    supabase.from("whatsapp_plantillas").select(COLUMNAS_PLANTILLA).order("creado_en", { ascending: false }).limit(500),
    supabase.from("whatsapp_alertas").select("id, tipo, severidad, titulo, detalle, plantilla_id, vista_en, creado_en").order("creado_en", { ascending: false }).limit(30),
    supabase.from("whatsapp_numeros").select("id, nombre, numero, limite_mensajes").eq("activo", true).order("nombre"),
  ]);
  if (plantillasR.error || alertasR.error) return null;
  return {
    plantillas: (plantillasR.data ?? []) as PlantillaGuardada[],
    alertas: (alertasR.data ?? []).map((a) => ({
      id: a.id as string,
      tipo: a.tipo as string,
      severidad: a.severidad as AlertaVista["severidad"],
      titulo: a.titulo as string,
      detalle: (a.detalle as string | null) ?? null,
      plantillaId: (a.plantilla_id as string | null) ?? null,
      vista: !!a.vista_en,
      creadoEn: a.creado_en as string,
    })),
    // Sin la columna (migración 0170 a medias) los números salen sin límite.
    numeros: numerosR.error ? [] : (numerosR.data ?? []).map((n) => ({ id: n.id as string, nombre: n.nombre as string, numero: n.numero as string, limite: (n.limite_mensajes as string | null) ?? null })),
  };
}
