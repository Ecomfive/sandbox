"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { TAMANO_LOTE, guardarLoteMovimientos, validarMovimiento } from "@/lib/finanzas/guardar-libro";
import { claveCatalogo, type MovimientoExcel } from "@/lib/finanzas/libro-excel";
import {
  ORIGEN_MANUAL,
  ORIGEN_PEGADO,
  ORIGENES_ELIMINABLES,
  cambiosMovimiento,
  leerDatosMovimiento,
  type DatosMovimiento,
  type VistaMovimiento,
} from "@/lib/finanzas/movimiento-manual";
import { hoyPanama } from "@/lib/af4/fecha";
import { validarRucDv } from "@/lib/finanzas/ruc-panama";
import { dinero } from "@/lib/af4/formato";
import { sinAccesoARegistros, sinAccesoAUnidades } from "@/lib/finanzas/acceso-tienda";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";

const MODULO = "libro-movimientos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

function revalidar() {
  revalidatePath("/libro-movimientos", "layout");
  revalidatePath("/estado-resultados");
}

/** Los nombres de tienda, tipo y forma de pago de unos ids (y que existan: no se confía en lo que manda el navegador). */
async function nombres(d: Pick<DatosMovimiento, "unidad_id" | "tipo_id" | "cuenta_id">) {
  const supabase = createServiceClient();
  const [u, t, c] = await Promise.all([
    supabase.from("fin_unidades").select("nombre").eq("id", d.unidad_id).maybeSingle(),
    supabase.from("fin_tipos").select("nombre").eq("id", d.tipo_id).maybeSingle(),
    d.cuenta_id ? supabase.from("fin_cuentas").select("nombre").eq("id", d.cuenta_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (!u.data) return { error: "La tienda no existe." } as const;
  if (!t.data) return { error: "El tipo no existe." } as const;
  if (d.cuenta_id && !c.data) return { error: "La forma de pago no existe." } as const;
  return { tienda: u.data.nombre as string, tipo: t.data.nombre as string, cuenta: (c.data?.nombre as string | undefined) ?? "" };
}

const vista = (d: DatosMovimiento, n: { tienda: string; tipo: string; cuenta: string }): VistaMovimiento => ({
  mes: d.periodo,
  pago: d.fecha_pago ?? "",
  prestacion: d.fecha_servicio ?? "",
  tienda: n.tienda,
  tipo: n.tipo,
  descripcion: d.descripcion,
  monto: d.monto,
  cuenta: n.cuenta,
  eerr: d.en_eerr,
  flujo: d.en_flujo,
});

/** «Agregar»: un movimiento cargado a mano (origen «manual», sin huella: ninguna importación lo toca). */
export async function crearMovimiento(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const d = leerDatosMovimiento((k) => formData.get(k));
    if ("error" in d) return d;
    const acceso = await sinAccesoAUnidades([d.unidad_id]);
    if (acceso) return { error: acceso };
    const n = await nombres(d);
    if ("error" in n) return n;
    const { data, error } = await createServiceClient()
      .from("fin_movimientos")
      .insert({ ...d, fecha_registro: hoyPanama(), origen: ORIGEN_MANUAL, creado_por: usuario.id })
      .select("id")
      .single();
    if (error || !data) return { error: `No se pudo guardar: ${error?.message ?? "sin respuesta"}` };
    await registrarAuditoria({
      accion: "crear_movimiento_libro",
      entidad: "fin_movimientos",
      entidadId: data.id as string,
      detalle: `${d.descripcion} · ${n.tienda} · ${n.tipo} · ${usd(d.monto)} (${d.periodo.slice(0, 7)})`,
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el movimiento." };
  }
}

/**
 * Guarda los cambios de la ficha. Queda «editado a mano» (reimportar el Excel ya no lo pisa) y la actividad anota cada
 * campo con su valor de antes y de después.
 */
export async function actualizarMovimiento(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const id = String(formData.get("id") ?? "");
    if (!UUID.test(id)) return { error: "Movimiento inválido." };
    const d = leerDatosMovimiento((k) => formData.get(k));
    if ("error" in d) return d;
    // N° de factura y RUC (con su DV validado, si es de Panamá): solo si vienen en el formulario.
    const extras: { factura_numero?: string | null; ruc_proveedor?: string | null } = {};
    if (formData.has("factura_numero")) extras.factura_numero = String(formData.get("factura_numero") ?? "").trim().slice(0, 80) || null;
    const supabase = createServiceClient();
    // La tienda de antes (en la base) y la nueva tienen que ser de las que la persona puede ver.
    const acceso = (await sinAccesoARegistros(supabase, "fin_movimientos", [id])) ?? (await sinAccesoAUnidades([d.unidad_id]));
    if (acceso) return { error: acceso };
    const { data: a } = await supabase
      .from("fin_movimientos")
      .select("periodo, fecha_pago, fecha_servicio, descripcion, monto, en_eerr, en_flujo, tipo_texto, factura_numero, ruc_proveedor, fin_unidades(nombre), fin_tipos(nombre), fin_cuentas(nombre)")
      .eq("id", id)
      .maybeSingle();
    if (!a) return { error: "El movimiento ya no existe." };
    // El RUC se valida solo si cambió: uno importado del Excel con otro formato no impide corregir lo demás.
    if (formData.has("ruc")) {
      const escrito = String(formData.get("ruc") ?? "").trim();
      if (escrito !== ((a.ruc_proveedor as string | null) ?? "").trim()) {
        const v = validarRucDv(escrito);
        if (v.error) return { error: `RUC: ${v.error}` };
        extras.ruc_proveedor = v.ruc ? `${v.ruc}${v.dv ? ` DV ${v.dv}` : ""}` : null;
      }
    }
    const n = await nombres(d);
    if ("error" in n) return n;
    const nombre = (v: unknown) => ((Array.isArray(v) ? v[0] : v) as { nombre?: string } | null)?.nombre ?? "";
    const antes: VistaMovimiento = {
      mes: String(a.periodo),
      pago: (a.fecha_pago as string | null) ?? "",
      prestacion: (a.fecha_servicio as string | null) ?? "",
      tienda: nombre(a.fin_unidades),
      tipo: nombre(a.fin_tipos) || ((a.tipo_texto as string | null) ?? ""),
      descripcion: a.descripcion as string,
      monto: Number(a.monto),
      cuenta: nombre(a.fin_cuentas),
      eerr: a.en_eerr === true,
      flujo: a.en_flujo === true,
    };
    const cambios = cambiosMovimiento(antes, vista(d, n));
    const factura = { antes: (a.factura_numero as string | null) ?? "", despues: extras.factura_numero ?? "" };
    const ruc = { antes: (a.ruc_proveedor as string | null) ?? "", despues: extras.ruc_proveedor ?? "" };
    if ("factura_numero" in extras && factura.antes !== factura.despues) {
      (cambios.antes as Record<string, unknown>)["N° de factura"] = factura.antes;
      (cambios.despues as Record<string, unknown>)["N° de factura"] = factura.despues;
    }
    if ("ruc_proveedor" in extras && ruc.antes !== ruc.despues) {
      (cambios.antes as Record<string, unknown>).RUC = ruc.antes;
      (cambios.despues as Record<string, unknown>).RUC = ruc.despues;
    }
    if (!Object.keys(cambios.antes).length) return {};
    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from("fin_movimientos")
      .update({ ...d, ...extras, editado_a_mano: true, editado_por: usuario.id, editado_en: ahora, actualizado_en: ahora })
      .eq("id", id);
    if (error) return { error: `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({ accion: "editar_movimiento_libro", entidad: "fin_movimientos", entidadId: id, ...cambios });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el movimiento." };
  }
}

/** Elimina un movimiento cargado en el portal (a mano o pegado). Lo importado de un archivo no se borra. */
export async function eliminarMovimiento(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Movimiento inválido." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "fin_movimientos", [id]);
    if (acceso) return { error: acceso };
    const { data: m } = await supabase.from("fin_movimientos").select("origen, descripcion, monto, periodo").eq("id", id).maybeSingle();
    if (!m) return { error: "El movimiento ya no existe." };
    if (!ORIGENES_ELIMINABLES.includes(m.origen as string)) {
      return { error: "Un movimiento importado de un Excel no se elimina: corrígelo o sácalo del EERR." };
    }
    const { error } = await supabase.from("fin_movimientos").delete().eq("id", id).in("origen", ORIGENES_ELIMINABLES);
    if (error) return { error: error.message };
    await registrarAuditoria({
      accion: "eliminar_movimiento_libro",
      entidad: "fin_movimientos",
      entidadId: id,
      detalle: `${m.descripcion} · ${usd(Number(m.monto))} (${String(m.periodo).slice(0, 7)})`,
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar." };
  }
}

/** La actividad de un movimiento para su ficha. Es una lectura: basta poder abrir el módulo. */
export async function obtenerHistorialMovimiento(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Movimiento inválido." };
  const acceso = await sinAccesoARegistros(createServiceClient(), "fin_movimientos", [id]);
  if (acceso) return { error: acceso };
  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "fin_movimientos")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}

/**
 * «Pegar filas desde Excel»: guarda un lote de filas ya leídas en el navegador (origen «pegado», nunca borra nada). Una
 * fila con una tienda que no existe se rechaza (el panel ya la marcó como error): pegar no crea tiendas.
 */
export async function guardarPegado(filas: unknown[]): Promise<{ error: string } | { guardados: number; rechazados: number; conservados: number; sinTipo: number }> {
  try {
    await requireModuloEscritura(MODULO);
    if (!Array.isArray(filas) || !filas.length || filas.length > TAMANO_LOTE) return { error: "Lote inválido." };
    const supabase = createServiceClient();
    const [{ data: unidades, error }, permitidas] = await Promise.all([supabase.from("fin_unidades").select("id, nombre"), cargarTiendasPermitidas()]);
    if (error) return { error: "No se pudieron leer las tiendas." };
    // Con tiendas limitadas, una fila de otra tienda se rechaza como una tienda que no existe.
    const existen = new Set((unidades ?? []).filter((u) => puedeVerUnidad(permitidas, u.id as string)).map((u) => claveCatalogo(u.nombre as string)));
    const buenos: MovimientoExcel[] = [];
    let rechazados = 0;
    for (const f of filas) {
      const r = validarMovimiento(f);
      if (r.ok && existen.has(claveCatalogo(r.mov.unidad))) buenos.push(r.mov);
      else rechazados++;
    }
    if (!buenos.length) return { guardados: 0, rechazados, conservados: 0, sinTipo: 0 };
    const r = await guardarLoteMovimientos(supabase, ORIGEN_PEGADO, buenos);
    // Lo de un mes cerrado no se guarda: cuenta como rechazado.
    return { guardados: r.guardados, rechazados: rechazados + r.enMesCerrado, conservados: r.conservados, sinTipo: r.sinTipo };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Cierra un pegado: deja una línea en la auditoría y vuelve a pedir las páginas. */
export async function terminarPegado(resumen: { guardados: number; meses: string[] }): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const guardados = Number.isInteger(resumen?.guardados) ? resumen.guardados : 0;
    const meses = Array.isArray(resumen?.meses) ? resumen.meses.filter((m) => /^\d{4}-\d{2}$/.test(m)).slice(0, 24) : [];
    await registrarAuditoria({ accion: "pegar_movimientos_libro", entidad: "fin_movimientos", detalle: `${guardados} movimientos pegados desde Excel (${meses.join(", ")})` });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo terminar." };
  }
}
