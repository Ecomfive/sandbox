"use server";

// Acciones de Tesorería › Préstamos del grupo (migración 0983): registrar un préstamo, costo o abono, eliminar uno
// cargado a mano y sumar una parte. Devuelven el error como valor.

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { cargarPrestamosGrupo } from "@/lib/finanzas/cargar-prestamos-grupo";
import { claveInteres, interesDelMes, leerDatosMovGrupo, etiquetaTipoGrupo, saldosPorPar, CLASES_PARTE } from "@/lib/finanzas/prestamos-grupo";
import { hoyPanama, mesLargo } from "@/lib/af4/fecha";
import { limitadoATiendas } from "@/components/finanzas/solo-toda-la-empresa";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "tesoreria";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const usd = (v: number) => `US$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const revalidar = () => revalidatePath("/tesoreria/grupo");

export async function crearMovimientoGrupo(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    const d = leerDatosMovGrupo((k) => formData.get(k));
    if ("error" in d) return d;
    const supabase = createServiceClient();
    const { data: partes, error: ep } = await supabase.from("fin_grupo_partes").select("id, nombre, clase").in("id", [d.acreedor_id, d.deudor_id]);
    if (ep) return { error: ep.message.includes("fin_grupo") ? "Falta correr la migración 0983 en Supabase." : ep.message };
    if ((partes ?? []).length !== 2) return { error: "Quien presta o quien debe ya no existe." };
    const nombre = (id: string) => (partes ?? []).find((p) => p.id === id)?.nombre ?? "—";
    // Mejora 67: solo un socio aporta capital; un aporte no es deuda ni vence.
    if (d.naturaleza === "aporte" && (partes ?? []).find((p) => p.id === d.acreedor_id)?.clase !== "socio") return { error: "Solo un socio puede hacer un aporte de capital." };
    const { naturaleza, soporte, ...base } = d;
    const fila = { ...base, creado_por: usuario.id, ...(naturaleza === "aporte" || soporte ? { naturaleza, soporte } : {}) };
    const { data, error } = await supabase.from("fin_grupo_movimientos").insert(fila).select("id").single();
    if (error && /naturaleza|soporte/.test(error.message)) return { error: "Falta correr la migración 0989 en Supabase para guardar aportes y soportes." };
    if (error || !data) return { error: `No se pudo guardar: ${error?.message ?? "sin respuesta"}` };
    await registrarAuditoria({
      accion: "crear_movimiento_grupo",
      entidad: "fin_grupo_movimientos",
      entidadId: data.id as string,
      detalle: `${naturaleza === "aporte" ? "Aporte de capital" : etiquetaTipoGrupo(d.tipo)} ${usd(d.monto)} · ${naturaleza === "aporte" ? `${nombre(d.acreedor_id)} aporta a ${nombre(d.deudor_id)}` : `${nombre(d.deudor_id)} debe a ${nombre(d.acreedor_id)}`} · ${d.concepto}${d.ordenes.length ? ` · ${d.ordenes.join(", ")}` : ""}${soporte ? ` · Soporte: ${soporte}` : ""}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Elimina un movimiento cargado a mano (lo importado de ClickUp se corrige con otro movimiento). */
export async function eliminarMovimientoGrupo(id: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Movimiento inválido." };
    const supabase = createServiceClient();
    const { data: m } = await supabase.from("fin_grupo_movimientos").select("tipo, monto, concepto, origen").eq("id", id).maybeSingle();
    if (!m) return { error: "El movimiento ya no existe." };
    if (m.origen === "libro") return { error: "Este movimiento viene del libro: se quita desde la ficha del gasto («Quién lo pagó»)." };
    if (m.origen !== "manual" && m.origen !== "sistema") return { error: "Lo importado de ClickUp no se borra: corrígelo con otro movimiento (un abono o un costo)." };
    const { error } = await supabase.from("fin_grupo_movimientos").delete().eq("id", id);
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: "eliminar_movimiento_grupo", entidad: "fin_grupo_movimientos", entidadId: id, detalle: `${etiquetaTipoGrupo(m.tipo)} ${usd(Number(m.monto))} · ${m.concepto}` });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar." };
  }
}

export async function crearParteGrupo(formData: FormData): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    const nombre = String(formData.get("nombre") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    const clase = String(formData.get("clase") ?? "");
    if (!nombre) return { error: "Falta el nombre." };
    if (!CLASES_PARTE.some((c) => c.clave === clase)) return { error: "Elige qué es." };
    const { error } = await createServiceClient().from("fin_grupo_partes").insert({ nombre, clase });
    if (error) return { error: error.code === "23505" ? "Ya existe con ese nombre." : error.message };
    await registrarAuditoria({ accion: "crear_parte_grupo", entidad: "fin_grupo_movimientos", detalle: `${nombre} (${clase})` });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo crear." };
  }
}

/**
 * La tasa por ciclo de un financista (migración 0985). Con ella Compras y costos estima el costo de financiamiento de
 * las OC que fondeó y todavía no tienen su cargo. `tasa` en porcentaje («20»); `dias` vacío = el plazo de cada préstamo.
 */
export async function guardarTasaFinancista(id: unknown, tasa: unknown, dias: unknown): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Financista inválido." };
    const t = typeof tasa === "string" ? tasa.trim().replace(",", ".").replace("%", "") : "";
    const tasaNum = t === "" ? null : Number(t);
    if (tasaNum !== null && (!Number.isFinite(tasaNum) || tasaNum < 0 || tasaNum > 500)) return { error: "La tasa va en porcentaje, entre 0 y 500." };
    const d = typeof dias === "string" ? dias.trim() : "";
    const diasNum = d === "" ? null : Number(d);
    if (diasNum !== null && (!Number.isInteger(diasNum) || diasNum < 1 || diasNum > 730)) return { error: "Los días del ciclo van de 1 a 730." };
    const supabase = createServiceClient();
    const { data: antes } = await supabase.from("fin_grupo_partes").select("nombre, clase, tasa_ciclo, dias_ciclo").eq("id", id).maybeSingle();
    if (!antes) return { error: "Falta correr la migración 0985 en Supabase, o el financista ya no existe." };
    if (antes.clase !== "financista") return { error: "Solo los financistas tienen tasa." };
    const tasaCiclo = tasaNum === null ? null : Math.round(tasaNum * 100) / 10_000;
    const { error } = await supabase.from("fin_grupo_partes").update({ tasa_ciclo: tasaCiclo, dias_ciclo: diasNum }).eq("id", id);
    if (error) return { error: error.message };
    const pct = (v: unknown) => (v === null || v === undefined ? "—" : `${(Number(v) * 100).toLocaleString("es-PA", { maximumFractionDigits: 2 })} %`);
    await registrarAuditoria({
      accion: "tasa_financista",
      entidad: "fin_grupo_movimientos",
      entidadId: id,
      detalle: `Tasa de ${antes.nombre}`,
      antes: { Tasa: pct(antes.tasa_ciclo), "Días del ciclo": antes.dias_ciclo ? String(antes.dias_ciclo) : "plazo del préstamo" },
      despues: { Tasa: pct(tasaCiclo), "Días del ciclo": diasNum ? String(diasNum) : "plazo del préstamo" },
    });
    revalidar();
    revalidatePath("/rentabilidad/compras");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la tasa." };
  }
}

async function partesDe(ids: string[]) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("fin_grupo_partes").select("id, nombre, clase").in("id", ids);
  if (error) return { error: error.message } as const;
  return { supabase, partes: data ?? [] } as const;
}

/**
 * Netear lo que se deben dos partes (mejora 63): un abono por el menor de los dos saldos en cada dirección, con la misma
 * fecha. El monto lo vuelve a calcular el servidor.
 */
export async function netearPar(a: unknown, b: unknown): Promise<{ error?: string; monto?: number }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    if (typeof a !== "string" || typeof b !== "string" || !UUID.test(a) || !UUID.test(b) || a === b) return { error: "Par inválido." };
    const r = await partesDe([a, b]);
    if ("error" in r) return { error: r.error };
    if (r.partes.length !== 2) return { error: "Alguna de las partes ya no existe." };
    const datos = await cargarPrestamosGrupo(r.supabase);
    if (!datos) return { error: "Falta correr la migración 0983 en Supabase." };
    const s = saldosPorPar(datos.movs);
    const ida = s.find((x) => x.acreedorId === a && x.deudorId === b)?.saldo ?? 0;
    const vuelta = s.find((x) => x.acreedorId === b && x.deudorId === a)?.saldo ?? 0;
    const monto = Math.round(Math.min(ida, vuelta) * 100) / 100;
    if (monto < 0.01) return { error: "No se deben en las dos direcciones: no hay nada que netear." };
    const hoy = hoyPanama();
    const nombre = (id: string) => r.partes.find((p) => p.id === id)?.nombre ?? "—";
    const concepto = `Neteo entre ${nombre(a)} y ${nombre(b)}`;
    const filas = [
      { acreedor_id: a, deudor_id: b, tipo: "abono", fecha: hoy, monto, concepto, origen: "sistema", origen_clave: `neteo:${a}:${b}:${hoy}`, creado_por: usuario.id },
      { acreedor_id: b, deudor_id: a, tipo: "abono", fecha: hoy, monto, concepto, origen: "sistema", origen_clave: `neteo:${b}:${a}:${hoy}`, creado_por: usuario.id },
    ];
    const { error } = await r.supabase.from("fin_grupo_movimientos").insert(filas);
    if (error) {
      if (error.code === "23505") return { error: "Ya se neteó este par hoy." };
      return { error: /origen/.test(error.message) ? "Falta correr la migración 0989 en Supabase." : error.message };
    }
    await registrarAuditoria({ accion: "netear_grupo", entidad: "fin_grupo_movimientos", detalle: `${concepto}: ${usd(monto)} en cada dirección` });
    revalidar();
    return { monto };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo netear." };
  }
}

/** La tasa anual que cobra una empresa a otra (mejora 62). Vacía = no se cobra interés. */
export async function guardarTasaPar(a: unknown, b: unknown, tasa: unknown): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    if (typeof a !== "string" || typeof b !== "string" || !UUID.test(a) || !UUID.test(b) || a === b) return { error: "Par inválido." };
    const t = typeof tasa === "string" ? tasa.trim().replace(",", ".").replace("%", "") : "";
    const num = t === "" ? null : Number(t);
    if (num !== null && (!Number.isFinite(num) || num < 0 || num > 100)) return { error: "La tasa anual va en porcentaje, entre 0 y 100." };
    const r = await partesDe([a, b]);
    if ("error" in r) return { error: r.error };
    if (r.partes.length !== 2 || r.partes.some((p) => p.clase !== "empresa")) return { error: "El interés solo se cobra entre empresas del grupo." };
    const { data: antes, error: ea } = await r.supabase.from("fin_grupo_pares").select("tasa_anual").eq("acreedor_id", a).eq("deudor_id", b).maybeSingle();
    if (ea) return { error: "Falta correr la migración 0989 en Supabase." };
    const res =
      num === null || num === 0
        ? await r.supabase.from("fin_grupo_pares").delete().eq("acreedor_id", a).eq("deudor_id", b)
        : await r.supabase.from("fin_grupo_pares").upsert({ acreedor_id: a, deudor_id: b, tasa_anual: Math.round(num * 100) / 10_000, actualizado_por: usuario.id, actualizado_en: new Date().toISOString() });
    if (res.error) return { error: res.error.message };
    const nombre = (id: string) => r.partes.find((p) => p.id === id)?.nombre ?? "—";
    const pct = (v: unknown) => (v === null || v === undefined ? "sin interés" : `${(Number(v) * 100).toLocaleString("es-PA", { maximumFractionDigits: 2 })} % anual`);
    await registrarAuditoria({
      accion: "tasa_grupo",
      entidad: "fin_grupo_movimientos",
      detalle: `Interés de ${nombre(b)} a ${nombre(a)}`,
      antes: { Tasa: pct(antes?.tasa_anual) },
      despues: { Tasa: num ? pct(num / 100) : "sin interés" },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la tasa." };
  }
}

/**
 * Registra el interés de un mes entre dos empresas como un costo (mejora 62). Lo calcula el servidor con la tasa guardada;
 * un mes ya registrado no se repite (`origen_clave`). Solo meses ya terminados.
 */
export async function registrarInteresGrupo(a: unknown, b: unknown, mes: unknown): Promise<{ error?: string; monto?: number }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    if (typeof a !== "string" || typeof b !== "string" || !UUID.test(a) || !UUID.test(b) || a === b) return { error: "Par inválido." };
    if (typeof mes !== "string" || !/^\d{4}-\d{2}-01$/.test(mes) || mes >= `${hoyPanama().slice(0, 7)}-01`) return { error: "Solo se registra el interés de un mes ya terminado." };
    const r = await partesDe([a, b]);
    if ("error" in r) return { error: r.error };
    const { data: par, error: ep } = await r.supabase.from("fin_grupo_pares").select("tasa_anual").eq("acreedor_id", a).eq("deudor_id", b).maybeSingle();
    if (ep) return { error: "Falta correr la migración 0989 en Supabase." };
    if (!par) return { error: "Este par no tiene tasa de interés." };
    const datos = await cargarPrestamosGrupo(r.supabase);
    if (!datos) return { error: "Falta correr la migración 0983 en Supabase." };
    const monto = interesDelMes(datos.movs, a, b, Number(par.tasa_anual), mes, (m) => ((m as { origenClave?: string | null }).origenClave ?? "").startsWith("interes:"));
    if (monto < 0.01) return { error: "No hubo saldo en ese mes: no hay interés." };
    const finMes = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const nombre = (id: string) => r.partes.find((p) => p.id === id)?.nombre ?? "—";
    const concepto = `Interés de ${mesLargo(mes)} (${(Number(par.tasa_anual) * 100).toLocaleString("es-PA", { maximumFractionDigits: 2 })} % anual)`;
    const { error } = await r.supabase.from("fin_grupo_movimientos").insert({
      acreedor_id: a,
      deudor_id: b,
      tipo: "costo",
      fecha: finMes,
      monto,
      concepto,
      origen: "sistema",
      origen_clave: claveInteres(a, b, mes),
      creado_por: usuario.id,
    });
    if (error) return { error: error.code === "23505" ? "El interés de ese mes ya está registrado." : error.message };
    await registrarAuditoria({ accion: "interes_grupo", entidad: "fin_grupo_movimientos", detalle: `${nombre(b)} le debe a ${nombre(a)}: ${concepto}, ${usd(monto)}` });
    revalidar();
    return { monto };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo registrar el interés." };
  }
}

const montoOpcional = (v: FormDataEntryValue | null): number | null | undefined => {
  const t = typeof v === "string" ? v.trim().replace(/[$\s,]/g, "") : "";
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && Math.abs(n) <= 100_000_000 ? Math.round(n * 100) / 100 : undefined;
};

/** Lo que dice cada empresa que le debe la otra a una fecha (mejora 68). */
export async function crearConfirmacionGrupo(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (await limitadoATiendas()) return { error: "Solo para quien ve toda la empresa." };
    const a = String(formData.get("acreedor_id") ?? "");
    const b = String(formData.get("deudor_id") ?? "");
    if (!UUID.test(a) || !UUID.test(b) || a === b) return { error: "Elige las dos empresas." };
    const fecha = String(formData.get("fecha_corte") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyPanama()) return { error: "La fecha de corte no es válida." };
    const sa = montoOpcional(formData.get("saldo_acreedor"));
    const sd = montoOpcional(formData.get("saldo_deudor"));
    if (sa === undefined || sd === undefined) return { error: "Los saldos son montos en USD." };
    if (sa === null && sd === null) return { error: "Escribe lo que dice al menos una de las dos empresas." };
    const r = await partesDe([a, b]);
    if ("error" in r) return { error: r.error };
    if (r.partes.length !== 2) return { error: "Alguna de las partes ya no existe." };
    const nota = String(formData.get("nota") ?? "").trim().slice(0, 500) || null;
    const { data, error } = await r.supabase
      .from("fin_grupo_confirmaciones")
      .insert({ acreedor_id: a, deudor_id: b, fecha_corte: fecha, saldo_acreedor: sa, saldo_deudor: sd, nota, creado_por: usuario.id })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message.includes("fin_grupo_confirmaciones") ? "Falta correr la migración 0989 en Supabase." : (error?.message ?? "No se pudo guardar.") };
    const nombre = (id: string) => r.partes.find((p) => p.id === id)?.nombre ?? "—";
    await registrarAuditoria({
      accion: "confirmar_saldo_grupo",
      entidad: "fin_grupo_movimientos",
      entidadId: data.id as string,
      detalle: `${nombre(b)} → ${nombre(a)} al ${fecha}: según ${nombre(a)} ${sa === null ? "—" : usd(sa)}, según ${nombre(b)} ${sd === null ? "—" : usd(sd)}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
