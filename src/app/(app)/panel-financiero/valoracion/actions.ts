"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { CAMPOS_VALORACION, CLAVE_VALORACION, leerValoracion, validarValoracion, valoracionAGuardar, type SupuestosValoracion } from "@/lib/finanzas/valoracion";
import { createServiceClient } from "@/lib/supabase/server";

const texto = (s: SupuestosValoracion) => Object.fromEntries(CAMPOS_VALORACION.map((c) => [c.etiqueta, String(s[c.clave])]));

/** Guarda los supuestos de la valoración (`fin_config.valoracion`). Solo quien puede modificar Estado de resultados. */
export async function guardarValoracion(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura("estado-resultados");
    const leido = validarValoracion((c) => formData.get(c));
    if ("error" in leido) return { error: leido.error };
    const supabase = createServiceClient();
    const previo = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_VALORACION).maybeSingle();
    if (previo.error) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };
    const antes = leerValoracion(previo.data?.valor);
    const despues = leido.valoracion;
    const cambiados = CAMPOS_VALORACION.filter((c) => antes[c.clave] !== despues[c.clave]);
    if (previo.data && !cambiados.length) return {};
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave: CLAVE_VALORACION, valor: valoracionAGuardar(despues), actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudo guardar." };
    await registrarAuditoria({
      accion: "cambiar_valoracion",
      entidad: "fin_config",
      entidadId: CLAVE_VALORACION,
      detalle: `Supuestos de la valoración${cambiados.length ? `: ${cambiados.map((c) => c.etiqueta.toLowerCase()).join(", ")}` : ""}`,
      antes: texto(antes),
      despues: texto(despues),
    });
    for (const ruta of ["/panel-financiero", "/panel-financiero/valoracion", "/panel-financiero/informe", "/estado-resultados", "/presupuesto", "/rentabilidad", "/rentabilidad/palancas"]) {
      revalidatePath(ruta);
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
