"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { mesCorto } from "@/lib/af4/fecha";
import { leerPeriodo } from "@/lib/nomina/al-libro";
import { cargarAlLibro, mesCerrado } from "@/lib/nomina/cargar-al-libro";
import { createServiceClient } from "@/lib/supabase/server";

/** Escribe en el libro: hace falta poder modificar Nómina y el Libro de movimientos. */
async function exigirPermisos() {
  const usuario = await requireModuloEscritura("nomina");
  await requireModuloEscritura("libro-movimientos");
  return usuario;
}

function revalidar() {
  for (const ruta of ["/nomina/conciliacion", "/libro-movimientos", "/estado-resultados", "/flujo-caja", "/panel-financiero", "/utilidades"]) revalidatePath(ruta);
}

/**
 * Pasa la nómina de un mes al libro (SUELDOS / OTROS SUELDOS por tienda). Si el libro tiene sueldos de ese mes que la
 * nómina reemplaza, `confirmados` trae los ids que la persona vio en el cuadro y confirmó: si el libro cambió desde
 * entonces, no se hace nada. Volver a pasar el mismo mes actualiza, no duplica.
 */
export async function pasarNominaAlLibro(mes: string, confirmados: string[]): Promise<{ error?: string; mensaje?: string }> {
  try {
    const usuario = await exigirPermisos();
    const periodo = leerPeriodo(mes);
    if (!periodo) return { error: "Mes inválido." };
    const supabase = createServiceClient();
    const datos = await cargarAlLibro(supabase, periodo);
    if ("error" in datos) return datos;
    if (!datos.activo) return { error: "La nómina al libro está apagada. Se enciende en Estado de resultados › Ajustes." };
    if (datos.cerrado) return { error: `${mesCorto(periodo)} está cerrado: no se cambia el libro.` };
    const { plan } = datos;
    if (!plan.movimientos.length) return { error: `No hay nómina en ${mesCorto(periodo)}.` };
    const vistos = new Set(Array.isArray(confirmados) ? confirmados.filter((x): x is string => typeof x === "string") : []);
    if (plan.reemplazar.length !== vistos.size || plan.reemplazar.some((id) => !vistos.has(id))) {
      return { error: "El libro cambió desde que se abrió el cuadro. Vuelve a revisarlo." };
    }
    const { data, error } = await supabase.rpc("fin_nomina_al_libro", {
      p_periodo: periodo,
      p_movimientos: plan.movimientos,
      p_reemplazar: plan.reemplazar,
      p_usuario: usuario.id,
    });
    if (error) return { error: /apagada/.test(error.message) ? error.message : "No se pudo pasar la nómina al libro." };
    const r = (data ?? {}) as { guardados?: number; borrados?: number; reemplazados?: number };
    // Datos sensibles: la auditoría dice qué se hizo, nunca los montos.
    await registrarAuditoria({
      accion: "pasar_nomina_libro",
      entidad: "fin_movimientos",
      detalle: `Pasó la nómina de ${mesCorto(periodo)} al libro: ${r.guardados ?? 0} movimientos de sueldos, ${r.reemplazados ?? 0} sueldos del Excel reemplazados${r.borrados ? `, ${r.borrados} de una pasada anterior borrados` : ""}`,
    });
    revalidar();
    return { mensaje: `Nómina de ${mesCorto(periodo)} pasada al libro` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo pasar la nómina al libro." };
  }
}

/** Deshace un mes: borra los sueldos que vinieron de la nómina y devuelve al EERR y al flujo los del Excel. */
export async function devolverNominaDelLibro(mes: string): Promise<{ error?: string; mensaje?: string }> {
  try {
    const usuario = await exigirPermisos();
    const periodo = leerPeriodo(mes);
    if (!periodo) return { error: "Mes inválido." };
    const supabase = createServiceClient();
    if (await mesCerrado(supabase, periodo)) return { error: `${mesCorto(periodo)} está cerrado: no se cambia el libro.` };
    const { data, error } = await supabase.rpc("fin_nomina_fuera_del_libro", { p_periodo: periodo, p_usuario: usuario.id });
    if (error) return { error: "No se pudo deshacer." };
    const r = (data ?? {}) as { borrados?: number; devueltos?: number };
    await registrarAuditoria({
      accion: "devolver_nomina_libro",
      entidad: "fin_movimientos",
      detalle: `Sacó la nómina de ${mesCorto(periodo)} del libro: ${r.borrados ?? 0} movimientos borrados, ${r.devueltos ?? 0} sueldos del Excel devueltos`,
    });
    revalidar();
    return { mensaje: `${mesCorto(periodo)} vuelve a los sueldos del Excel` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo deshacer." };
  }
}
