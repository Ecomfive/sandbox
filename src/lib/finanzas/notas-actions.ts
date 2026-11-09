"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { leerMesNota, limpiarNota, SIN_MIGRACION_NOTAS } from "./notas";

const resumen = (t: string) => (t.length > 120 ? `${t.slice(0, 117)}…` : t) || "(vacía)";

/**
 * Guarda (o borra, si queda vacía) la nota a los estados financieros de un mes. Solo quien puede modificar Estado de
 * resultados. El texto es formato simple, nunca HTML.
 */
export async function guardarNotaMes(periodo: string, texto: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura("estado-resultados");
    const mes = leerMesNota(periodo);
    if (!mes) return { error: "Mes inválido." };
    const limpio = limpiarNota(texto);
    if ("error" in limpio) return { error: limpio.error };
    const supabase = createServiceClient();
    const previa = await supabase.from("fin_notas_mes").select("texto").eq("periodo", mes).maybeSingle();
    if (previa.error) return { error: SIN_MIGRACION_NOTAS };
    const antes = (previa.data?.texto as string | undefined) ?? "";
    if (antes === limpio.texto) return {};
    const r = limpio.texto
      ? await supabase
          .from("fin_notas_mes")
          .upsert({ periodo: mes, texto: limpio.texto, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "periodo" })
      : await supabase.from("fin_notas_mes").delete().eq("periodo", mes);
    if (r.error) return { error: "No se pudo guardar la nota." };
    await registrarAuditoria({
      accion: "guardar_nota_estados",
      entidad: "fin_notas_mes",
      entidadId: mes,
      detalle: `Notas de ${mes.slice(0, 7)}`,
      antes: { Nota: resumen(antes) },
      despues: { Nota: resumen(limpio.texto) },
    });
    for (const ruta of ["/estado-resultados", "/balance-general", "/panel-financiero/informe"]) revalidatePath(ruta);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la nota." };
  }
}
