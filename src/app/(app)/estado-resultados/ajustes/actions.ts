"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { NOMBRE_AJUSTE, SIN_MIGRACION_AJUSTES, encendido, esClaveAjuste } from "@/lib/finanzas/config";
import { canalDe, esCanal, ETIQUETA_CANAL } from "@/lib/finanzas/canales";
import { esBaseReparto, etiquetaBase, leerBaseReparto } from "@/lib/finanzas/reparto";
import { createServiceClient } from "@/lib/supabase/server";
import { leerCorreos, leerTelefonos } from "@/lib/finanzas/informe-envio";

const estado = (v: boolean) => (v ? "Encendido" : "Apagado");

/** Enciende o apaga un ajuste de Finanzas. Solo quien puede modificar Estado de resultados. */
export async function cambiarAjusteFinanzas(clave: string, activo: boolean): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura("estado-resultados");
    if (!esClaveAjuste(clave) || typeof activo !== "boolean") return { error: "Ajuste inválido." };
    const supabase = createServiceClient();
    const { data: antes, error: errorLeer } = await supabase.from("fin_config").select("valor").eq("clave", clave).maybeSingle();
    if (errorLeer) return { error: SIN_MIGRACION_AJUSTES };
    const previo = encendido(antes?.valor);
    if (previo === activo) return {};
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave, valor: activo, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudo guardar." };
    await registrarAuditoria({
      accion: "cambiar_ajuste_finanzas",
      entidad: "fin_config",
      entidadId: clave,
      detalle: `${activo ? "Encendió" : "Apagó"} «${NOMBRE_AJUSTE[clave]}»`,
      antes: { Estado: estado(previo) },
      despues: { Estado: estado(activo) },
    });
    for (const ruta of ["/estado-resultados", "/estado-resultados/ajustes", "/panel-financiero", "/utilidades", "/presupuesto", "/nomina/conciliacion"]) revalidatePath(ruta);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_MIGRACION_0929 = "Falta correr la migración 0929 (estados financieros) en Supabase.";
const RUTAS_EERR = ["/estado-resultados", "/estado-resultados/ajustes", "/panel-financiero", "/utilidades", "/presupuesto", "/rentabilidad", "/balance-general"];

/**
 * Elige la base de reparto predeterminada de A DISTRIBUIR (envíos, ventas o margen bruto): la que usa la vista
 * `fin_eerr_mensual` y, con ella, todo el portal. Solo quien puede modificar Estado de resultados.
 */
export async function cambiarBaseReparto(base: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura("estado-resultados");
    if (!esBaseReparto(base)) return { error: "Base inválida." };
    const supabase = createServiceClient();
    const previa = await supabase.from("fin_config").select("valor").eq("clave", "base_reparto").maybeSingle();
    if (previa.error) return { error: SIN_MIGRACION_0929 };
    const antes = leerBaseReparto(previa.data?.valor);
    if (antes === base) return {};
    const { error } = await supabase
      .from("fin_config")
      .upsert({ clave: "base_reparto", valor: base, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudo guardar." };
    await registrarAuditoria({
      accion: "cambiar_base_reparto",
      entidad: "fin_config",
      entidadId: "base_reparto",
      detalle: "Base de reparto de A DISTRIBUIR",
      antes: { Base: etiquetaBase(antes) },
      despues: { Base: etiquetaBase(base) },
    });
    for (const ruta of RUTAS_EERR) revalidatePath(ruta);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** El canal de venta de una tienda (o ninguno). */
export async function cambiarCanalUnidad(unidadId: string, canal: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura("estado-resultados");
    if (typeof unidadId !== "string" || !UUID.test(unidadId)) return { error: "Tienda inválida." };
    const nuevo = canal === "" ? null : canal;
    if (nuevo !== null && !esCanal(nuevo)) return { error: "Canal inválido." };
    const supabase = createServiceClient();
    const previa = await supabase.from("fin_unidades").select("nombre, canal").eq("id", unidadId).maybeSingle();
    if (previa.error) return { error: SIN_MIGRACION_0929 };
    if (!previa.data) return { error: "Esa tienda ya no existe." };
    if ((previa.data.canal ?? null) === nuevo) return {};
    const { error } = await supabase.from("fin_unidades").update({ canal: nuevo }).eq("id", unidadId);
    if (error) return { error: "No se pudo guardar." };
    await registrarAuditoria({
      accion: "cambiar_canal_unidad",
      entidad: "fin_unidades",
      entidadId: unidadId,
      detalle: String(previa.data.nombre),
      antes: { Canal: ETIQUETA_CANAL[canalDe(previa.data.canal)] },
      despues: { Canal: ETIQUETA_CANAL[canalDe(nuevo)] },
    });
    revalidatePath("/estado-resultados");
    revalidatePath("/estado-resultados/ajustes");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Una tienda de cliente de fulfillment (Clicksi) y lo que se le cobra por orden entregada (migraciones 0965 y 0966). */
export async function cambiarFulfillmentUnidad(unidadId: string, cliente: boolean, tarifaCruda: unknown): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura("estado-resultados");
    if (typeof unidadId !== "string" || !UUID.test(unidadId)) return { error: "Tienda inválida." };
    if (typeof cliente !== "boolean") return { error: "Dato inválido." };
    const texto = tarifaCruda === null || tarifaCruda === undefined ? "" : String(tarifaCruda).trim().replace(",", ".");
    const tarifa = texto === "" ? null : Number(texto);
    if (tarifa !== null && (!Number.isFinite(tarifa) || tarifa < 0 || tarifa > 1000)) return { error: "La tarifa va de 0 a 1 000 dólares." };
    const supabase = createServiceClient();
    const previa = await supabase.from("fin_unidades").select("nombre, cliente_fulfillment, tarifa_fulfillment").eq("id", unidadId).maybeSingle();
    if (previa.error) return { error: "Falta correr en Supabase las migraciones 0965 y 0966." };
    if (!previa.data) return { error: "Esa tienda ya no existe." };
    const nueva = cliente ? (tarifa === null ? null : Math.round(tarifa * 100) / 100) : null;
    const antesTarifa = previa.data.tarifa_fulfillment === null ? null : Number(previa.data.tarifa_fulfillment);
    if (previa.data.cliente_fulfillment === cliente && antesTarifa === nueva) return {};
    const { error } = await supabase.from("fin_unidades").update({ cliente_fulfillment: cliente, tarifa_fulfillment: nueva }).eq("id", unidadId);
    if (error) return { error: "No se pudo guardar." };
    const txt = (c: boolean, t: number | null) => (c ? `Cliente de fulfillment${t !== null ? ` · US$${t} por orden` : " · sin tarifa"}` : "Tienda propia");
    await registrarAuditoria({
      accion: "cambiar_fulfillment_unidad",
      entidad: "fin_unidades",
      entidadId: unidadId,
      detalle: String(previa.data.nombre),
      antes: { Tipo: txt(previa.data.cliente_fulfillment === true, antesTarifa) },
      despues: { Tipo: txt(cliente, nueva) },
    });
    revalidatePath("/estado-resultados/ajustes");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Marca o desmarca un tipo del libro como intercompañía (sus movimientos salen del EERR consolidado). */
export async function cambiarTipoIntercompania(tipoId: string, valor: boolean): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura("estado-resultados");
    if (typeof tipoId !== "string" || !UUID.test(tipoId) || typeof valor !== "boolean") return { error: "Tipo inválido." };
    const supabase = createServiceClient();
    const previa = await supabase.from("fin_tipos").select("nombre, intercompania").eq("id", tipoId).maybeSingle();
    if (previa.error) return { error: SIN_MIGRACION_0929 };
    if (!previa.data) return { error: "Ese tipo ya no existe." };
    if (previa.data.intercompania === valor) return {};
    const { error } = await supabase.from("fin_tipos").update({ intercompania: valor }).eq("id", tipoId);
    if (error) return { error: "No se pudo guardar." };
    await registrarAuditoria({
      accion: "cambiar_tipo_intercompania",
      entidad: "fin_tipos",
      entidadId: tipoId,
      detalle: String(previa.data.nombre),
      antes: { Intercompañía: previa.data.intercompania ? "Sí" : "No" },
      despues: { Intercompañía: valor ? "Sí" : "No" },
    });
    revalidatePath("/estado-resultados");
    revalidatePath("/estado-resultados/ajustes");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/**
 * Los destinatarios del informe mensual (correos) y del resumen semanal (WhatsApp), en `fin_config` (migración 0937).
 * Se guardan limpios: correos válidos y teléfonos en formato internacional. No se anotan en la auditoría los datos, solo
 * cuántos quedaron.
 */
export async function guardarDestinatarios(correosCrudos: unknown, telefonosCrudos: unknown): Promise<{ error?: string; correos?: number; telefonos?: number }> {
  try {
    const usuario = await requireModuloEscritura("estado-resultados");
    const correos = leerCorreos(correosCrudos);
    const telefonos = leerTelefonos(telefonosCrudos);
    const ahora = new Date().toISOString();
    const { error } = await createServiceClient()
      .from("fin_config")
      .upsert(
        [
          { clave: "informe_destinatarios", valor: correos, actualizado_por: usuario.id, actualizado_en: ahora },
          { clave: "whatsapp_numeros", valor: telefonos, actualizado_por: usuario.id, actualizado_en: ahora },
        ],
        { onConflict: "clave" },
      );
    if (error) return { error: SIN_MIGRACION_AJUSTES };
    await registrarAuditoria({
      accion: "cambiar_destinatarios_informe",
      entidad: "fin_config",
      entidadId: "informe_destinatarios",
      detalle: `${correos.length} correos y ${telefonos.length} números de WhatsApp`,
    });
    revalidatePath("/estado-resultados/ajustes");
    revalidatePath("/panel-financiero/envios");
    return { correos: correos.length, telefonos: telefonos.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
