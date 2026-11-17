"use server";

import { getUsuarioActual } from "@/lib/auth";
import { esAvisoDePantalla, HORAS_AVISOS_SIN_LEER, TIPOS_CON_AVISO_EN_PANTALLA, type AvisoEnPantalla } from "@/lib/avisos-pantalla";
import { hrefDeAviso } from "@/lib/compras/llegadas-avisos";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Los avisos personales sin leer que deben salir en pantalla (17 nov 2026, pedido de Hernán). Sin `desde` (al abrir el sistema): los de las últimas 24 horas. Con `desde`: los que cayeron después.
 * Solo los del propio usuario y solo de los tipos de `TIPOS_CON_AVISO_EN_PANTALLA`. Nunca falla: sin red o sin sesión devuelve una lista vacía.
 */
export async function avisosParaPantalla(desde: string | null): Promise<{ avisos: AvisoEnPantalla[]; hasta: string }> {
  const hasta = new Date().toISOString();
  try {
    const usuario = await getUsuarioActual();
    if (!usuario) return { avisos: [], hasta };
    const limite = desde && !Number.isNaN(Date.parse(desde)) ? desde : new Date(Date.now() - HORAS_AVISOS_SIN_LEER * 3_600_000).toISOString();
    const { data } = await createServiceClient()
      .from("notificaciones_usuario")
      .select("id, tipo, titulo, texto, href, creado_en")
      .eq("usuario_id", usuario.id)
      .is("leida_en", null)
      .in("tipo", [...TIPOS_CON_AVISO_EN_PANTALLA])
      .gt("creado_en", limite)
      .order("creado_en", { ascending: true })
      .limit(10);
    return {
      avisos: (data ?? [])
        .filter((a) => esAvisoDePantalla(String(a.tipo)))
        .map((a) => ({ id: a.id as string, tipo: a.tipo as string, titulo: a.titulo as string, texto: (a.texto as string | null) ?? null, href: hrefDeAviso(a.titulo as string, a.href as string), creadoEn: a.creado_en as string })),
      hasta,
    };
  } catch {
    return { avisos: [], hasta };
  }
}
