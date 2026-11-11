"use server";

import { revalidatePath } from "next/cache";
import { limitadoATiendas } from "@/components/finanzas/solo-toda-la-empresa";
import { hoyPanama } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { PAIS_FINANZAS } from "@/lib/finanzas/cargar-inventario";
import { paisDeOperacionActual } from "@/lib/finanzas/pais-servidor";
import { cargarPlanCompras, SIN_MIGRACION_PLAN } from "@/lib/finanzas/cargar-plan-compras";
import { SIN_MIGRACION_COMPRAS_COSTOS } from "@/lib/finanzas/cargar-compras-costos";
import { CLAVE_PLAN_COMPRAS, configPlanAGuardar, leerConfigPlan, presupuestoDesdePlan, validarConfigPlan, validarLoteProducto, type ConfigPlan } from "@/lib/finanzas/plan-compras";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "rentabilidad";
const textoConfig = (c: ConfigPlan): Record<string, string> => ({
  Meses: String(c.meses),
  Anticipo: `${c.anticipoPct} %`,
  Saldo: c.saldoAl === "envio" ? "Al envío" : "A la llegada",
  "Lote mínimo": String(c.loteMinimo),
});
const textoLote = (l: { lote_minimo: unknown; multiplo: unknown; excluir: unknown } | null): Record<string, string> =>
  l ? { "Lote mínimo": String(l.lote_minimo), Múltiplo: String(l.multiplo), "Fuera del plan": l.excluir ? "Sí" : "No" } : {};
const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });

function revalidar() {
  revalidatePath("/rentabilidad/plan-compras");
  revalidatePath("/rentabilidad/compras");
  revalidatePath("/proyeccion-caja");
}

/** Quien modifica Rentabilidad, ve toda la empresa y ve Panamá (las compras del plan son de Panamá). */
async function permiso() {
  const usuario = await requireModuloEscritura(MODULO);
  if (await limitadoATiendas()) return { error: "El plan de compras es de toda la empresa." } as const;
  if (!puedeVerPais(usuario.paisesPermitidos, PAIS_FINANZAS)) return { error: "No tienes acceso a las compras de Panamá." } as const;
  return { usuario } as const;
}

export async function guardarAjustesPlan(datos: Record<string, unknown>): Promise<{ error?: string }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    const v = validarConfigPlan((c) => datos?.[c]);
    if ("error" in v) return v;
    const supabase = createServiceClient();
    const { data: antes } = await supabase.from("fin_config").select("valor").eq("clave", CLAVE_PLAN_COMPRAS).maybeSingle();
    const valor = configPlanAGuardar(v.config);
    const { error } = await supabase.from("fin_config").upsert({ clave: CLAVE_PLAN_COMPRAS, valor, actualizado_por: p.usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: "No se pudieron guardar los ajustes." };
    await registrarAuditoria({
      accion: "guardar_ajustes_plan_compras",
      entidad: "fin_config",
      detalle: `Plan de compras: ${v.config.meses} meses, anticipo ${v.config.anticipoPct} %, saldo ${v.config.saldoAl === "envio" ? "al envío" : "a la llegada"}, lote mínimo ${v.config.loteMinimo}`,
      antes: antes ? textoConfig(leerConfigPlan(antes.valor)) : {},
      despues: textoConfig(v.config),
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudieron guardar los ajustes.");
  }
}

export async function guardarLotePlan(skuId: unknown, datos: unknown): Promise<{ error?: string }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    if (!esUuid(skuId)) return { error: "Producto inválido." };
    const v = validarLoteProducto(datos);
    if ("error" in v) return v;
    const supabase = createServiceClient();
    const { data: sku } = await supabase.from("skus_maestros").select("id, codigo, nombre").eq("id", skuId).maybeSingle();
    if (!sku) return { error: "El producto no existe." };
    const { data: antes } = await supabase.from("fin_plan_compras_producto").select("lote_minimo, multiplo, excluir").eq("sku_maestro_id", skuId).maybeSingle();
    const { error } = await supabase
      .from("fin_plan_compras_producto")
      .upsert({ sku_maestro_id: skuId, lote_minimo: v.loteMinimo, multiplo: v.multiplo, excluir: v.excluir, actualizado_por: p.usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "sku_maestro_id" });
    if (error) return { error: /fin_plan_compras_producto/.test(error.message) ? SIN_MIGRACION_PLAN : "No se pudo guardar el lote." };
    await registrarAuditoria({
      accion: "guardar_lote_plan_compras",
      entidad: "fin_plan_compras_producto",
      entidadId: String(skuId),
      detalle: `${sku.codigo} ${sku.nombre}: lote mínimo ${v.loteMinimo}, múltiplo ${v.multiplo}${v.excluir ? ", fuera del plan" : ""}`.slice(0, 500),
      antes: textoLote(antes),
      despues: textoLote({ lote_minimo: v.loteMinimo, multiplo: v.multiplo, excluir: v.excluir }),
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar el lote.");
  }
}

/**
 * Lleva los pagos del plan al presupuesto de compras de cada mes del plan: presupuesto = lo ya comprometido + los pagos
 * del plan. La Proyección de caja suma solo lo disponible (presupuesto − comprometido), que queda igual a los pagos del
 * plan: no se cuenta dos veces. El plan se vuelve a armar en el servidor (no se confía en lo que manda el navegador).
 */
export async function llevarPlanAlPresupuesto(): Promise<{ error?: string; meses?: number }> {
  try {
    const p = await permiso();
    if ("error" in p) return { error: p.error };
    if ((await paisDeOperacionActual(p.usuario.paisesPermitidos)) !== PAIS_FINANZAS) return { error: "Llevar el plan al presupuesto es solo de Panamá por ahora: cambia el país en la barra de arriba." };
    const supabase = createServiceClient();
    const datos = await cargarPlanCompras(supabase, hoyPanama(), PAIS_FINANZAS);
    if ("error" in datos) return datos;
    const filas = presupuestoDesdePlan(datos.plan.meses, datos.comprometido).filter((f) => f.monto > 0 || datos.presupuestos.has(f.mes));
    if (!filas.length) return { error: "El plan no tiene pagos en estos meses." };
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from("fin_compras_presupuesto")
      .upsert(filas.map((f) => ({ mes: f.mes, monto: f.monto, nota: "Plan de compras", actualizado_por: p.usuario.id, actualizado_en: ahora })), { onConflict: "mes" });
    if (error) return { error: /fin_compras_presupuesto/.test(error.message) ? SIN_MIGRACION_COMPRAS_COSTOS : "No se pudo guardar el presupuesto." };
    const usd = (v: number | undefined) => (v === undefined ? "—" : dinero(v));
    await registrarAuditoria({
      accion: "llevar_plan_presupuesto",
      entidad: "fin_compras_presupuesto",
      detalle: `Presupuesto de compras desde el plan: ${filas.map((f) => `${f.mes.slice(0, 7)} ${usd(f.monto)}`).join(", ")}`.slice(0, 1000),
      antes: Object.fromEntries(filas.map((f) => [f.mes.slice(0, 7), usd(datos.presupuestos.get(f.mes))])),
      despues: Object.fromEntries(filas.map((f) => [f.mes.slice(0, 7), usd(f.monto)])),
    });
    revalidar();
    return { meses: filas.length };
  } catch (e) {
    return fallo(e, "No se pudo guardar el presupuesto.");
  }
}
