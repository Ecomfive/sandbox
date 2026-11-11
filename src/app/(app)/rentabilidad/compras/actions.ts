"use server";

import { revalidatePath } from "next/cache";
import { dinero } from "@/lib/af4/formato";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { nombreDePais, PAISES_OPERACION } from "@/lib/finanzas/pais-finanzas";
import { SIN_MIGRACION_COMPRAS_COSTOS } from "@/lib/finanzas/cargar-compras-costos";
import { ETIQUETA_GASTO, validarGasto, validarPresupuesto } from "@/lib/finanzas/compras-costos";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "rentabilidad";
const fallo = (e: unknown, porDefecto: string) => ({ error: e instanceof Error ? e.message : porDefecto });
const usd2 = (v: number) => dinero(v, "USD", { decimales: 2 });

function revalidar() {
  revalidatePath("/rentabilidad/compras");
  revalidatePath("/rentabilidad/reorden");
  revalidatePath("/proyeccion-caja");
}

/** La compra existe, es de un país con operación (Panamá, Costa Rica, México), no está anulada y la persona puede ver ese país. */
async function compraDePanama(paisesPermitidos: string[] | null, compraId: unknown): Promise<{ id: string; codigo: string } | { error: string }> {
  if (!esUuid(compraId)) return { error: "Compra inválida." };
  const { data } = await createServiceClient().from("wms_compras").select("id, codigo, nombre, tipo, anulada_en, paises(codigo)").eq("id", compraId).maybeSingle();
  const pais = data ? (Array.isArray(data.paises) ? data.paises[0] : data.paises) : null;
  const codigo = (pais as { codigo?: string } | null)?.codigo ?? "";
  if (!data || data.tipo !== "pais" || data.anulada_en || !(PAISES_OPERACION as readonly string[]).includes(codigo)) return { error: "La compra no existe o no es de un país con operación." };
  if (!puedeVerPais(paisesPermitidos, codigo)) return { error: `No tienes acceso a las compras de ${nombreDePais(codigo)}.` };
  return { id: String(data.id), codigo: String(data.codigo ?? data.nombre ?? "") };
}

/** Agrega un gasto de importación (flete, aduana, agente…) a una compra. */
export async function agregarGastoImportacion(compraId: unknown, datos: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const compra = await compraDePanama(usuario.paisesPermitidos, compraId);
    if ("error" in compra) return compra;
    const g = validarGasto(datos);
    if ("error" in g) return g;
    const { data, error } = await createServiceClient()
      .from("fin_compras_gastos")
      .insert({ compra_id: compra.id, concepto: g.concepto, monto: g.monto, fecha: g.fecha, pagado: g.pagado, nota: g.nota, creado_por: usuario.id })
      .select("id")
      .single();
    if (error) return { error: /fin_compras_gastos/.test(error.message) ? SIN_MIGRACION_COMPRAS_COSTOS : "No se pudo guardar el gasto." };
    await registrarAuditoria({
      accion: "agregar_gasto_importacion",
      entidad: "fin_compras_gastos",
      entidadId: data?.id as string | undefined,
      detalle: `${compra.codigo}: ${ETIQUETA_GASTO[g.concepto]} ${usd2(g.monto)}${g.pagado ? " (pagado)" : ""}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar el gasto.");
  }
}

async function leerGasto(id: unknown) {
  if (!esUuid(id)) return null;
  const { data } = await createServiceClient().from("fin_compras_gastos").select("id, compra_id, concepto, monto, pagado").eq("id", id).maybeSingle();
  return data;
}

/** Marca un gasto de importación como pagado o pendiente (pendiente sale en la proyección de caja). */
export async function cambiarGastoPagado(id: unknown, pagado: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const g = await leerGasto(id);
    if (!g) return { error: "El gasto no existe." };
    const compra = await compraDePanama(usuario.paisesPermitidos, g.compra_id);
    if ("error" in compra) return compra;
    const nuevo = pagado === true;
    const { error } = await createServiceClient().from("fin_compras_gastos").update({ pagado: nuevo, actualizado_en: new Date().toISOString() }).eq("id", g.id);
    if (error) return { error: "No se pudo cambiar el gasto." };
    await registrarAuditoria({
      accion: "cambiar_gasto_importacion",
      entidad: "fin_compras_gastos",
      entidadId: String(g.id),
      detalle: `${compra.codigo}: ${ETIQUETA_GASTO[g.concepto as keyof typeof ETIQUETA_GASTO] ?? g.concepto} ${usd2(Number(g.monto))}`,
      antes: { Estado: g.pagado ? "Pagado" : "Pendiente" },
      despues: { Estado: nuevo ? "Pagado" : "Pendiente" },
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo cambiar el gasto.");
  }
}

export async function eliminarGastoImportacion(id: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const g = await leerGasto(id);
    if (!g) return { error: "El gasto no existe." };
    const compra = await compraDePanama(usuario.paisesPermitidos, g.compra_id);
    if ("error" in compra) return compra;
    const { error } = await createServiceClient().from("fin_compras_gastos").delete().eq("id", g.id);
    if (error) return { error: "No se pudo quitar el gasto." };
    await registrarAuditoria({
      accion: "eliminar_gasto_importacion",
      entidad: "fin_compras_gastos",
      entidadId: String(g.id),
      detalle: `${compra.codigo}: ${ETIQUETA_GASTO[g.concepto as keyof typeof ETIQUETA_GASTO] ?? g.concepto} ${usd2(Number(g.monto))}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo quitar el gasto.");
  }
}

/** Guarda el presupuesto de compras de varios meses (vacío = quitarlo). */
export async function guardarPresupuestoCompras(filas: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!Array.isArray(filas) || !filas.length || filas.length > 24) return { error: "Datos inválidos." };
    const validas: { mes: string; monto: number | null }[] = [];
    for (const f of filas) {
      const v = validarPresupuesto(f);
      if ("error" in v) return v;
      validas.push(v);
    }
    const supabase = createServiceClient();
    const meses = validas.map((v) => v.mes);
    const { data: antes, error: e1 } = await supabase.from("fin_compras_presupuesto").select("mes, monto").in("mes", meses);
    if (e1) return { error: SIN_MIGRACION_COMPRAS_COSTOS };
    const previo = new Map((antes ?? []).map((a) => [String(a.mes).slice(0, 10), Number(a.monto)]));
    const cambios = validas.filter((v) => (previo.get(v.mes) ?? null) !== v.monto);
    if (!cambios.length) return {};
    const poner = cambios.filter((c) => c.monto !== null);
    const quitar = cambios.filter((c) => c.monto === null).map((c) => c.mes);
    if (poner.length) {
      const { error } = await supabase
        .from("fin_compras_presupuesto")
        .upsert(poner.map((p) => ({ mes: p.mes, monto: p.monto, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() })), { onConflict: "mes" });
      if (error) return { error: "No se pudo guardar el presupuesto." };
    }
    if (quitar.length) {
      const { error } = await supabase.from("fin_compras_presupuesto").delete().in("mes", quitar);
      if (error) return { error: "No se pudo quitar el presupuesto." };
    }
    const texto = (v: number | null | undefined) => (v === null || v === undefined ? "—" : usd2(v));
    await registrarAuditoria({
      accion: "guardar_presupuesto_compras",
      entidad: "fin_compras_presupuesto",
      detalle: `Presupuesto de compras: ${cambios.map((c) => `${c.mes.slice(0, 7)} ${texto(c.monto)}`).join(", ")}`.slice(0, 1000),
      antes: Object.fromEntries(cambios.map((c) => [c.mes.slice(0, 7), texto(previo.get(c.mes))])),
      despues: Object.fromEntries(cambios.map((c) => [c.mes.slice(0, 7), texto(c.monto)])),
    });
    revalidar();
    return {};
  } catch (e) {
    return fallo(e, "No se pudo guardar el presupuesto.");
  }
}
