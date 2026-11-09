"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { hoyPanama } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import { SIN_MIGRACION_DEUDA, SIN_MIGRACION_TESORERIA } from "@/lib/finanzas/cargar-tesoreria";
import { esClasePrestamo, leerPorcentaje, leerTasa } from "@/lib/finanzas/deuda";
import { UNIDAD_SIN_ASIGNAR } from "@/lib/finanzas/libro-excel";
import { esCategoriaPago, esPrioridad, leerFecha, leerMonto, puedeDarPaso, type AccionProgramado, type EstadoProgramado } from "@/lib/finanzas/pagos";
import { CLAVES_CONFIG_TESORERIA, leerConfigTesoreria } from "@/lib/finanzas/tesoreria";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "tesoreria";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });
const texto = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const uuid = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return UUID.test(s) ? s : null;
};
type Resultado = { error?: string };
const falta = (code: string | undefined, msg: string) => (code === "42P01" || code === "PGRST205" || code === "42883" ? SIN_MIGRACION_TESORERIA : msg);
const faltaDeuda = (code: string | undefined, msg: string) => (code === "42P01" || code === "PGRST205" ? SIN_MIGRACION_DEUDA : msg);
const revalidar = () => revalidatePath("/tesoreria", "layout");

/** Penalidad (% de lo prepagado) y comisión fija de prepago (migración 0946). null = inválido. */
function leerPrepago(formData: FormData): { penalidad_prepago: number; comision_prepago: number } | null {
  const penalidad = leerPorcentaje(formData.get("penalidad_prepago"), 99);
  const comisionTexto = String(formData.get("comision_prepago") ?? "").trim();
  const comision = comisionTexto && comisionTexto !== "0" ? leerMonto(comisionTexto) : 0;
  return penalidad === null || comision === null ? null : { penalidad_prepago: penalidad, comision_prepago: comision };
}
/** Sin la migración 0946 no existen las columnas de prepago: se guarda sin ellas. */
const sinColumnaPrepago = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42703" || e.code === "PGRST204") && /prepago/.test(e.message ?? "");

async function intentar(fn: () => Promise<Resultado>, mensaje: string): Promise<Resultado> {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : mensaje };
  }
}

// ---------------------------------------------------------------------------------------------
// Saldos bancarios
// ---------------------------------------------------------------------------------------------

export async function guardarSaldoBancario(formData: FormData): Promise<Resultado> {
  return intentar(async () => {
    const usuario = await requireModuloEscritura(MODULO);
    const cuenta = uuid(formData.get("cuenta_id"));
    const fecha = leerFecha(formData.get("fecha"));
    const saldoTexto = String(formData.get("saldo") ?? "").replace(/[$\s,]/g, "");
    const saldo = saldoTexto === "" ? NaN : Number(saldoTexto.replace("−", "-"));
    const nota = texto(formData.get("nota"), 500) || null;
    if (!cuenta) return { error: "Elige la cuenta." };
    if (!fecha || fecha > hoyPanama()) return { error: "La fecha no puede ser futura." };
    if (!Number.isFinite(saldo) || Math.abs(saldo) > 1_000_000_000) return { error: "Escribe el saldo." };
    const supabase = createServiceClient();
    const previo = await supabase.from("fin_saldos_bancarios").select("saldo").eq("cuenta_id", cuenta).eq("fecha", fecha).maybeSingle();
    const { data, error } = await supabase
      .from("fin_saldos_bancarios")
      .upsert({ cuenta_id: cuenta, fecha, saldo: Math.round(saldo * 100) / 100, nota, creado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "cuenta_id,fecha" })
      .select("id")
      .single();
    if (error) return { error: falta(error.code, `No se pudo guardar: ${error.message}`) };
    await registrarAuditoria({
      accion: "guardar_saldo_bancario",
      entidad: "fin_saldos_bancarios",
      entidadId: data.id,
      detalle: `Saldo del ${fecha}: ${usd(saldo)}`,
      antes: previo.data ? { Saldo: usd(Number(previo.data.saldo)) } : undefined,
      despues: { Saldo: usd(saldo) },
    });
    revalidar();
    return {};
  }, "No se pudo guardar el saldo.");
}

export async function eliminarSaldoBancario(id: string): Promise<Resultado> {
  return intentar(async () => {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Saldo inválido." };
    const supabase = createServiceClient();
    const previo = await supabase.from("fin_saldos_bancarios").select("fecha, saldo").eq("id", id).maybeSingle();
    if (previo.error || !previo.data) return { error: "Ese saldo ya no existe." };
    const { error } = await supabase.from("fin_saldos_bancarios").delete().eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: "eliminar_saldo_bancario", entidad: "fin_saldos_bancarios", entidadId: id, detalle: `Saldo del ${previo.data.fecha}`, antes: { Saldo: usd(Number(previo.data.saldo)) } });
    revalidar();
    return {};
  }, "No se pudo eliminar el saldo.");
}

// ---------------------------------------------------------------------------------------------
// Ajustes y prioridades
// ---------------------------------------------------------------------------------------------

export async function guardarConfigTesoreria(formData: FormData): Promise<Resultado> {
  return intentar(async () => {
    const usuario = await requireModuloEscritura(MODULO);
    const crudo = Object.fromEntries(CLAVES_CONFIG_TESORERIA.map((k) => [k, String(formData.get(k) ?? "")]));
    const valor = leerConfigTesoreria(crudo);
    const fuera = CLAVES_CONFIG_TESORERIA.filter((k) => crudo[k].trim() && Number(crudo[k].replace(/[$\s,]/g, "")) !== valor[k]);
    if (fuera.length) return { error: "Hay un valor fuera de rango: revisa los días (1 o más) y los montos." };
    const supabase = createServiceClient();
    const previo = await supabase.from("fin_config").select("valor").eq("clave", "tesoreria").maybeSingle();
    const { error } = await supabase.from("fin_config").upsert({ clave: "tesoreria", valor, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() }, { onConflict: "clave" });
    if (error) return { error: error.code === "42P01" ? "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." : `No se pudo guardar: ${error.message}` };
    await registrarAuditoria({
      accion: "guardar_ajustes_tesoreria",
      entidad: "fin_tesoreria_config",
      entidadId: "tesoreria",
      detalle: "Ajustes de Tesorería",
      antes: previo.data ? { Ajustes: JSON.stringify(previo.data.valor) } : undefined,
      despues: { Ajustes: JSON.stringify(valor) },
    });
    revalidar();
    return {};
  }, "No se pudieron guardar los ajustes.");
}

export async function crearReglaPrioridad(formData: FormData): Promise<Resultado> {
  return intentar(async () => {
    const usuario = await requireModuloEscritura(MODULO);
    const ambito = formData.get("ambito") === "categoria" ? "categoria" : "contraparte";
    const valor = texto(formData.get(ambito === "categoria" ? "categoria" : "contraparte"), 160);
    const prioridad = String(formData.get("prioridad") ?? "");
    if (ambito === "categoria" && !esCategoriaPago(valor)) return { error: "Elige la categoría." };
    if (!valor) return { error: "Escribe el proveedor." };
    if (!esPrioridad(prioridad)) return { error: "Elige la prioridad." };
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("fin_pago_prioridades").insert({ ambito, valor, prioridad, creado_por: usuario.id }).select("id").single();
    if (error) return { error: error.code === "23505" ? "Ya hay una regla para eso: elimínala primero." : falta(error.code, `No se pudo guardar: ${error.message}`) };
    await registrarAuditoria({ accion: "crear_prioridad_pago", entidad: "fin_pago_prioridades", entidadId: data.id, detalle: `${valor} → ${prioridad}` });
    revalidar();
    return {};
  }, "No se pudo guardar la regla.");
}

export async function eliminarReglaPrioridad(id: string): Promise<Resultado> {
  return intentar(async () => {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Regla inválida." };
    const supabase = createServiceClient();
    const previo = await supabase.from("fin_pago_prioridades").select("valor, prioridad").eq("id", id).maybeSingle();
    if (!previo.data) return { error: "Esa regla ya no existe." };
    const { error } = await supabase.from("fin_pago_prioridades").delete().eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: "eliminar_prioridad_pago", entidad: "fin_pago_prioridades", entidadId: id, detalle: `${previo.data.valor} → ${previo.data.prioridad}` });
    revalidar();
    return {};
  }, "No se pudo eliminar la regla.");
}

// ---------------------------------------------------------------------------------------------
// Pagos programados
// ---------------------------------------------------------------------------------------------

export async function solicitarPago(formData: FormData): Promise<Resultado> {
  return intentar(async () => {
    const usuario = await requireModuloEscritura(MODULO);
    const concepto = texto(formData.get("concepto"), 160);
    const contraparte = texto(formData.get("contraparte"), 160) || null;
    const categoria = String(formData.get("categoria") ?? "otro");
    const monto = leerMonto(formData.get("monto"));
    const fecha = leerFecha(formData.get("fecha_programada"));
    const prioridad = String(formData.get("prioridad") ?? "negociable");
    const origenRef = texto(formData.get("origen_ref"), 120) || null;
    const carteraId = uuid(formData.get("cartera_id"));
    const nota = String(formData.get("nota") ?? "").trim().slice(0, 2000) || null;
    if (!concepto) return { error: "Escribe el concepto." };
    if (!esCategoriaPago(categoria)) return { error: "Elige la categoría." };
    if (monto === null) return { error: "El monto debe ser mayor a cero." };
    if (!fecha) return { error: "Elige la fecha." };
    if (!esPrioridad(prioridad)) return { error: "Elige la prioridad." };
    const supabase = createServiceClient();
    if (carteraId) {
      const doc = await supabase.from("fin_cartera").select("clase").eq("id", carteraId).maybeSingle();
      if (doc.data?.clase !== "pagar") return { error: "Esa cuenta por pagar no existe." };
    }
    const { data, error } = await supabase
      .from("fin_pagos_programados")
      .insert({
        concepto,
        contraparte,
        categoria,
        monto,
        fecha_programada: fecha,
        prioridad,
        origen_ref: origenRef,
        cartera_id: carteraId,
        tipo_id: uuid(formData.get("tipo_id")),
        unidad_id: uuid(formData.get("unidad_id")),
        cuenta_id: uuid(formData.get("cuenta_id")),
        nota,
        solicitado_por: usuario.id,
      })
      .select("id")
      .single();
    if (error) return { error: error.code === "23505" ? "Ese pago ya está programado." : falta(error.code, `No se pudo guardar: ${error.message}`) };
    await registrarAuditoria({ accion: "solicitar_pago", entidad: "fin_pagos_programados", entidadId: data.id, detalle: `${concepto} · ${usd(monto)} · ${fecha}` });
    revalidar();
    return {};
  }, "No se pudo solicitar el pago.");
}

async function leerProgramado(id: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fin_pagos_programados")
    .select("id, concepto, contraparte, categoria, monto, estado, solicitado_por, cartera_id, tipo_id, unidad_id, cuenta_id")
    .eq("id", id)
    .maybeSingle();
  return { supabase, data, error };
}

async function cambiarEstado(id: string, accion: Exclude<AccionProgramado, "pagar">, motivo?: string): Promise<Resultado> {
  const usuario = await requireModuloEscritura(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Pago inválido." };
  const { supabase, data, error } = await leerProgramado(id);
  if (error) return { error: falta(error.code, error.message) };
  if (!data) return { error: "Ese pago ya no existe." };
  const paso = puedeDarPaso(accion, { estado: data.estado as EstadoProgramado, solicitadoPor: data.solicitado_por as string | null }, { id: usuario.id, esAdmin: usuario.modulos.includes("usuarios") && !usuario.modulosSoloLectura.includes("usuarios") });
  if (!paso.ok) return { error: paso.error };
  const ahora = new Date().toISOString();
  const cambios =
    accion === "aprobar"
      ? { estado: "aprobado", aprobado_por: usuario.id, aprobado_en: ahora }
      : accion === "rechazar"
        ? { estado: "rechazado", rechazado_por: usuario.id, rechazado_en: ahora, motivo_rechazo: motivo }
        : { estado: "anulado" };
  const r = await supabase.from("fin_pagos_programados").update({ ...cambios, actualizado_en: ahora }).eq("id", id).eq("estado", data.estado);
  if (r.error) return { error: r.error.message };
  await registrarAuditoria({
    accion: `${accion}_pago`,
    entidad: "fin_pagos_programados",
    entidadId: id,
    detalle: `${data.concepto} · ${usd(Number(data.monto))}${motivo ? ` · ${motivo}` : ""}`,
    antes: { Estado: String(data.estado) },
    despues: { Estado: String(cambios.estado) },
  });
  revalidar();
  return {};
}

export async function aprobarPago(id: string): Promise<Resultado> {
  return intentar(() => cambiarEstado(id, "aprobar"), "No se pudo aprobar.");
}

export async function anularPago(id: string): Promise<Resultado> {
  return intentar(() => cambiarEstado(id, "anular"), "No se pudo anular.");
}

export async function rechazarPago(id: string, motivo: string): Promise<Resultado> {
  return intentar(async () => {
    const m = String(motivo ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
    if (!m) return { error: "Escribe el motivo." };
    return cambiarEstado(id, "rechazar", m);
  }, "No se pudo rechazar.");
}

/**
 * Marca un pago aprobado como pagado. Si se pide, crea su movimiento en el libro (FLUJO = SI, origen «tesoreria») y, si
 * viene de una cuenta por pagar, registra el abono.
 */
export async function marcarPagado(formData: FormData): Promise<Resultado> {
  return intentar(async () => {
    const usuario = await requireModuloEscritura(MODULO);
    const id = uuid(formData.get("id"));
    const fecha = leerFecha(formData.get("fecha_pago"));
    const cuenta = uuid(formData.get("cuenta_id"));
    const referencia = texto(formData.get("referencia_pago"), 120) || null;
    const crearMovimiento = formData.get("crear_movimiento") === "si";
    const conAbono = formData.get("registrar_abono") === "si";
    const enEerr = formData.get("en_eerr") === "si";
    if (!id) return { error: "Pago inválido." };
    if (!fecha || fecha > hoyPanama()) return { error: "La fecha de pago no puede ser futura." };
    const { supabase, data, error } = await leerProgramado(id);
    if (error) return { error: falta(error.code, error.message) };
    if (!data) return { error: "Ese pago ya no existe." };
    const paso = puedeDarPaso("pagar", { estado: data.estado as EstadoProgramado, solicitadoPor: data.solicitado_por as string | null }, { id: usuario.id, esAdmin: false });
    if (!paso.ok) return { error: paso.error };
    const monto = Number(data.monto);
    let movimientoId: string | null = null;
    let abonoId: string | null = null;
    if (crearMovimiento) {
      const tipo = uuid(formData.get("tipo_id")) ?? (data.tipo_id as string | null);
      if (!tipo) return { error: "Elige el tipo del libro para el movimiento." };
      let unidad = uuid(formData.get("unidad_id")) ?? (data.unidad_id as string | null);
      if (!unidad) {
        const sin = await supabase.from("fin_unidades").select("id").eq("nombre", UNIDAD_SIN_ASIGNAR).maybeSingle();
        unidad = (sin.data?.id as string | undefined) ?? null;
      }
      if (!unidad) return { error: "Elige la tienda del movimiento." };
      const mov = await supabase
        .from("fin_movimientos")
        .insert({
          periodo: `${fecha.slice(0, 7)}-01`,
          fecha_registro: hoyPanama(),
          fecha_pago: fecha,
          unidad_id: unidad,
          tipo_id: tipo,
          descripcion: [data.concepto, data.contraparte].filter(Boolean).join(" · ").slice(0, 500),
          monto,
          cuenta_id: cuenta,
          en_eerr: enEerr,
          en_flujo: true,
          origen: "tesoreria",
          origen_clave: `tes-pago:${id}`,
          creado_por: usuario.id,
        })
        .select("id")
        .single();
      if (mov.error) return { error: /cerrad/i.test(mov.error.message) ? "Ese mes ya está cerrado: elige una fecha de un mes abierto o desmarca el movimiento." : `No se pudo crear el movimiento: ${mov.error.message}` };
      movimientoId = mov.data.id as string;
    }
    if (conAbono && data.cartera_id) {
      const ab = await supabase
        .from("fin_cartera_abonos")
        .insert({ documento_id: data.cartera_id, fecha, monto, metodo: "tesoreria", referencia, cuenta_id: cuenta, notas: "Pago programado en Tesorería", creado_por: usuario.id })
        .select("id")
        .single();
      if (ab.error) {
        if (movimientoId) await supabase.from("fin_movimientos").delete().eq("id", movimientoId);
        return { error: `No se pudo registrar el abono: ${ab.error.message}` };
      }
      abonoId = ab.data.id as string;
    }
    const ahora = new Date().toISOString();
    const r = await supabase
      .from("fin_pagos_programados")
      .update({ estado: "pagado", pagado_por: usuario.id, pagado_en: ahora, fecha_pago: fecha, referencia_pago: referencia, cuenta_id: cuenta ?? data.cuenta_id, movimiento_id: movimientoId, abono_id: abonoId, actualizado_en: ahora })
      .eq("id", id)
      .eq("estado", "aprobado");
    if (r.error) return { error: r.error.message };
    await registrarAuditoria({
      accion: "pagar_pago",
      entidad: "fin_pagos_programados",
      entidadId: id,
      detalle: `${data.concepto} · ${usd(monto)} · ${fecha}${movimientoId ? " · con movimiento en el libro" : ""}${abonoId ? " · abono a la cuenta por pagar" : ""}`,
      antes: { Estado: "aprobado" },
      despues: { Estado: "pagado" },
    });
    if (movimientoId) await registrarAuditoria({ accion: "crear_movimiento_libro", entidad: "fin_movimientos", entidadId: movimientoId, detalle: `Desde Tesorería: ${data.concepto} · ${usd(monto)}` });
    revalidar();
    revalidatePath("/libro-movimientos");
    revalidatePath("/cuentas-por-pagar");
    return {};
  }, "No se pudo marcar como pagado.");
}

// ---------------------------------------------------------------------------------------------
// Deuda: líneas de crédito y préstamos
// ---------------------------------------------------------------------------------------------

export async function guardarLinea(formData: FormData): Promise<Resultado> {
  return intentar(async () => {
    const usuario = await requireModuloEscritura(MODULO);
    const id = uuid(formData.get("id"));
    const nombre = texto(formData.get("nombre"), 120);
    const cupo = leerMonto(formData.get("cupo"));
    const usadoTexto = String(formData.get("usado") ?? "").trim();
    const usado = usadoTexto === "" || usadoTexto === "0" ? 0 : leerMonto(usadoTexto);
    const tasa = leerTasa(formData.get("tasa"));
    const renovacion = String(formData.get("fecha_renovacion") ?? "").trim() ? leerFecha(formData.get("fecha_renovacion")) : null;
    if (!nombre) return { error: "Escribe el nombre." };
    if (cupo === null) return { error: "El cupo debe ser mayor a cero." };
    if (usado === null) return { error: "El usado es un monto en USD." };
    if (tasa === null) return { error: "La tasa es un porcentaje anual." };
    if (String(formData.get("fecha_renovacion") ?? "").trim() && !renovacion) return { error: "Fecha de renovación inválida." };
    const prepago = leerPrepago(formData);
    if (!prepago) return { error: "La penalidad es un porcentaje y la comisión de prepago un monto en USD." };
    const fila = {
      nombre,
      banco: texto(formData.get("banco"), 120) || null,
      cupo,
      usado,
      usado_al: hoyPanama(),
      tasa_anual: tasa,
      fecha_renovacion: renovacion,
      cuenta_id: uuid(formData.get("cuenta_id")),
      nota: texto(formData.get("nota"), 1000) || null,
      actualizado_en: new Date().toISOString(),
    };
    const supabase = createServiceClient();
    if (id) {
      const previo = await supabase.from("fin_lineas_credito").select("cupo, usado, tasa_anual, fecha_renovacion").eq("id", id).maybeSingle();
      if (!previo.data) return { error: "Esa línea ya no existe." };
      let { error } = await supabase.from("fin_lineas_credito").update({ ...fila, ...prepago }).eq("id", id);
      if (sinColumnaPrepago(error)) ({ error } = await supabase.from("fin_lineas_credito").update(fila).eq("id", id));
      if (error) return { error: faltaDeuda(error.code, error.message) };
      await registrarAuditoria({
        accion: "editar_linea_credito",
        entidad: "fin_lineas_credito",
        entidadId: id,
        detalle: nombre,
        antes: { Cupo: usd(Number(previo.data.cupo)), Usado: usd(Number(previo.data.usado)), Tasa: String(previo.data.tasa_anual), Renovación: String(previo.data.fecha_renovacion ?? "—") },
        despues: { Cupo: usd(cupo), Usado: usd(usado), Tasa: String(tasa), Renovación: renovacion ?? "—" },
      });
    } else {
      let { data, error } = await supabase.from("fin_lineas_credito").insert({ ...fila, ...prepago, creado_por: usuario.id }).select("id").single();
      if (sinColumnaPrepago(error)) ({ data, error } = await supabase.from("fin_lineas_credito").insert({ ...fila, creado_por: usuario.id }).select("id").single());
      if (error || !data) return { error: faltaDeuda(error?.code, `No se pudo guardar: ${error?.message ?? "sin respuesta"}`) };
      await registrarAuditoria({ accion: "crear_linea_credito", entidad: "fin_lineas_credito", entidadId: data.id, detalle: `${nombre} · cupo ${usd(cupo)}` });
    }
    revalidar();
    return {};
  }, "No se pudo guardar la línea.");
}

export async function crearPrestamo(formData: FormData): Promise<Resultado> {
  return intentar(async () => {
    const usuario = await requireModuloEscritura(MODULO);
    const nombre = texto(formData.get("nombre"), 120);
    const clase = String(formData.get("clase") ?? "prestamo");
    const monto = leerMonto(formData.get("monto"));
    const tasa = leerTasa(formData.get("tasa"));
    const plazo = Number(String(formData.get("plazo_meses") ?? "").trim());
    const desembolso = leerFecha(formData.get("fecha_desembolso"));
    const primer = leerFecha(formData.get("primer_vencimiento"));
    if (!nombre) return { error: "Escribe el nombre." };
    if (!esClasePrestamo(clase)) return { error: "Elige el tipo de deuda." };
    if (monto === null) return { error: "El monto debe ser mayor a cero." };
    if (tasa === null) return { error: "La tasa es un porcentaje anual." };
    if (!Number.isInteger(plazo) || plazo < 1 || plazo > 480) return { error: "El plazo va de 1 a 480 meses." };
    if (!desembolso) return { error: "Elige la fecha de desembolso." };
    if (!primer || primer < desembolso) return { error: "El primer vencimiento va después del desembolso." };
    const prepago = leerPrepago(formData);
    if (!prepago) return { error: "La penalidad es un porcentaje y la comisión de prepago un monto en USD." };
    const supabase = createServiceClient();
    const filaPrestamo = {
      nombre,
      acreedor: texto(formData.get("acreedor"), 120) || null,
      clase,
      monto,
      tasa_anual: tasa,
      plazo_meses: plazo,
      fecha_desembolso: desembolso,
      primer_vencimiento: primer,
      tipo_id: uuid(formData.get("tipo_id")),
      cuenta_id: uuid(formData.get("cuenta_id")),
      nota: texto(formData.get("nota"), 1000) || null,
      creado_por: usuario.id,
    };
    let { data, error } = await supabase.from("fin_prestamos").insert({ ...filaPrestamo, ...prepago }).select("id").single();
    if (sinColumnaPrepago(error)) ({ data, error } = await supabase.from("fin_prestamos").insert(filaPrestamo).select("id").single());
    if (error || !data) return { error: faltaDeuda(error?.code, `No se pudo guardar: ${error?.message ?? "sin respuesta"}`) };
    await registrarAuditoria({ accion: "crear_prestamo", entidad: "fin_prestamos", entidadId: data.id, detalle: `${nombre} · ${usd(monto)} · ${plazo} meses al ${(tasa * 100).toFixed(2)} %` });
    revalidar();
    return {};
  }, "No se pudo guardar el préstamo.");
}

/** Una línea o un préstamo no se borra: se desactiva (sale de la proyección y del balance desde hoy). */
export async function desactivarDeuda(tabla: "linea" | "prestamo", id: string): Promise<Resultado> {
  return intentar(async () => {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id) || (tabla !== "linea" && tabla !== "prestamo")) return { error: "Registro inválido." };
    const nombreTabla = tabla === "linea" ? "fin_lineas_credito" : "fin_prestamos";
    const supabase = createServiceClient();
    const previo = await supabase.from(nombreTabla).select("nombre").eq("id", id).maybeSingle();
    if (!previo.data) return { error: "Ya no existe." };
    const { error } = await supabase.from(nombreTabla).update({ activo: false, actualizado_en: new Date().toISOString() }).eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: tabla === "linea" ? "desactivar_linea_credito" : "desactivar_prestamo", entidad: nombreTabla, entidadId: id, detalle: String(previo.data.nombre) });
    revalidar();
    return {};
  }, "No se pudo desactivar.");
}
