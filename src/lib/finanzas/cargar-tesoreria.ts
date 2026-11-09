// Lectura de Tesorería desde Supabase (migraciones 0931 y 0932, y las tablas de Conciliación, Deliverys y Retiros). La
// comparten las páginas de /tesoreria, la tarjeta de posición del Panel financiero y la proyección de caja. Solo lectura;
// los permisos los decide quien llama. La lógica está en `tesoreria.ts`, `pagos.ts` y `deuda.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerPlataformaDropiId } from "@/lib/plataforma-dropi";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { esClasePrestamo, estadoLinea, type FinanciamientoCiclo, type LineaCredito, type Prestamo } from "./deuda";
import { esPrioridad, type ReglaPrioridad } from "./pagos";
import { dinero } from "@/lib/af4/formato";
import { partirMensajeTesoreria, TIPOS_TESORERIA, type TipoAlerta } from "@/lib/tareas/alertas";
import {
  alertasTesoreria,
  antiguedadEfectivo,
  depositosRepartidores,
  leerConfigTesoreria,
  posicionCaja,
  seguimientoDropi,
  sumarDias,
  ultimosSaldos,
  type ConfigTesoreria,
  type CuentaTesoreria,
  type DatosDropi,
  type DepositoRepartidor,
  type HistoriaDropi,
  type Posicion,
  type PuntoSaldo,
  type SemanaRepartidor,
  type SeguimientoDropi,
  type AntiguedadRepartidor,
  type AlertaTesoreria,
} from "./tesoreria";

export const SIN_MIGRACION_TESORERIA = "Falta correr la migración 0931 (tesorería) en Supabase.";
export const SIN_MIGRACION_DEUDA = "Falta correr la migración 0932 (deuda) en Supabase.";

/** Días hacia atrás que miran los depósitos de repartidores. */
export const DIAS_DEPOSITOS = 90;

const fecha10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : null);
const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

export async function cargarConfigTesoreria(supabase: SupabaseClient): Promise<ConfigTesoreria> {
  const { data } = await supabase.from("fin_config").select("valor").eq("clave", "tesoreria").maybeSingle();
  return leerConfigTesoreria(data?.valor ?? null);
}

export async function cargarCuentas(supabase: SupabaseClient): Promise<CuentaTesoreria[]> {
  const conMoneda = await supabase.from("fin_cuentas").select("id, nombre, clase, moneda, activo").order("nombre");
  const r = conMoneda.error ? await supabase.from("fin_cuentas").select("id, nombre, clase, activo").order("nombre") : conMoneda;
  return ((r.data ?? []) as Record<string, unknown>[])
    .filter((c) => c.activo !== false)
    .map((c) => ({ id: String(c.id), nombre: String(c.nombre), clase: String(c.clase ?? "otro"), moneda: String(c.moneda ?? "USD") }));
}

/**
 * Los saldos diarios desde `desde` (y el último antes, para arrastrarlo). Sin la migración 0931, solo los de los extractos
 * (`sinMigracion`: no se pueden cargar a mano).
 */
export async function cargarPuntosSaldo(supabase: SupabaseClient, desde: string): Promise<{ puntos: PuntoSaldo[]; sinMigracion: boolean }> {
  const vista = await traerTodasConError<Record<string, unknown>>((a, b) =>
    supabase.from("fin_saldos_cuentas_diarios").select("cuenta_id, fecha, saldo, origen").gte("fecha", desde).order("fecha").range(a, b),
  );
  if (!vista.error) {
    const puntos = (vista.data ?? []).map((p) => ({ cuentaId: String(p.cuenta_id), fecha: String(p.fecha).slice(0, 10), saldo: n(p.saldo), origen: p.origen === "manual" ? ("manual" as const) : ("extracto" as const) }));
    // El último dato de cada cuenta antes de `desde` (una consulta por cuenta sería cara: se toman los 400 más recientes).
    const antes = await supabase.from("fin_saldos_cuentas_diarios").select("cuenta_id, fecha, saldo, origen").lt("fecha", desde).order("fecha", { ascending: false }).limit(400);
    const vistos = new Set<string>();
    for (const p of antes.data ?? []) {
      const c = String(p.cuenta_id);
      if (vistos.has(c)) continue;
      vistos.add(c);
      puntos.unshift({ cuentaId: c, fecha: String(p.fecha).slice(0, 10), saldo: n(p.saldo), origen: p.origen === "manual" ? "manual" : "extracto" });
    }
    return { puntos, sinMigracion: false };
  }
  const lineas = await traerTodasConError<Record<string, unknown>>((a, b) =>
    supabase.from("conc_lineas").select("cuenta_id, fecha, orden, saldo").not("saldo", "is", null).gte("fecha", sumarDias(desde, -45)).order("fecha").order("orden").range(a, b),
  );
  const ultimo = new Map<string, PuntoSaldo>();
  for (const l of lineas.data ?? []) {
    const p: PuntoSaldo = { cuentaId: String(l.cuenta_id), fecha: String(l.fecha).slice(0, 10), saldo: n(l.saldo), origen: "extracto" };
    ultimo.set(`${p.cuentaId}|${p.fecha}`, p);
  }
  return { puntos: [...ultimo.values()], sinMigracion: true };
}

/** Semanas de los repartidores con efectivo (null sin la migración). */
export async function cargarSemanasRepartidores(supabase: SupabaseClient, hoy: string): Promise<SemanaRepartidor[] | null> {
  const [r, reps] = await Promise.all([
    traerTodasConError<Record<string, unknown>>((a, b) => supabase.rpc("fin_tesoreria_depositos", { p_desde: sumarDias(hoy, -DIAS_DEPOSITOS) }).range(a, b)),
    supabase.from("del_repartidores").select("id, nombre"),
  ]);
  if (r.error) return null;
  const nombres = new Map((reps.data ?? []).map((x) => [String(x.id), String(x.nombre)]));
  return (r.data ?? []).map((s) => ({
    repartidorId: String(s.repartidor_id),
    repartidor: nombres.get(String(s.repartidor_id)) ?? "Repartidor",
    semana: String(s.semana).slice(0, 10),
    primeraFecha: String(s.primera_fecha ?? s.semana).slice(0, 10),
    cobrado: n(s.cobrado_efectivo),
    depositadoBanco: n(s.depositado_banco),
    cierreEstado: (s.cierre_estado as string | null) ?? null,
    aPagar: s.a_pagar === null || s.a_pagar === undefined ? null : n(s.a_pagar),
    adelantos: n(s.adelantos),
    descuentos: n(s.descuentos),
    rendicionRecibo: s.rendicion_recibo === null || s.rendicion_recibo === undefined ? null : n(s.rendicion_recibo),
  }));
}

/** Wallet y retiros de Dropi en Panamá (los últimos 120 días). */
export async function cargarDatosDropi(supabase: SupabaseClient, hoy: string): Promise<DatosDropi | null> {
  const [pais, plataforma] = await Promise.all([supabase.from("paises").select("id").eq("codigo", "PA").maybeSingle(), obtenerPlataformaDropiId(supabase)]);
  const paisId = pais.data?.id as string | undefined;
  if (!paisId || !plataforma) return null;
  const desde = sumarDias(hoy, -120);
  const [saldos, retiros] = await Promise.all([
    supabase.from("saldos_wallet").select("fecha, monto").eq("pais_id", paisId).eq("plataforma_id", plataforma).gte("fecha", desde).order("fecha", { ascending: false }).limit(500),
    supabase.from("retiros").select("fecha, estado, monto, a_recibir, monto_neto").eq("pais_id", paisId).eq("plataforma_id", plataforma).gte("fecha", desde).limit(1000),
  ]);
  if (saldos.error || retiros.error) return null;
  return {
    hoy,
    saldos: (saldos.data ?? []).map((s) => ({ fecha: String(s.fecha).slice(0, 10), monto: n(s.monto) })),
    retiros: (retiros.data ?? []).map((r) => ({ fecha: String(r.fecha).slice(0, 10), estado: String(r.estado), monto: n(r.monto), aRecibir: n(r.a_recibir ?? r.monto_neto) })),
  };
}

export async function cargarPorLiquidar(supabase: SupabaseClient): Promise<{ fuente: string; neto: number; ultima: string | null }[] | null> {
  const { data, error } = await supabase.rpc("fin_tesoreria_por_liquidar", { p_dias: 60 });
  if (error) return null;
  return ((data ?? []) as Record<string, unknown>[]).map((x) => ({ fuente: String(x.fuente), neto: n(x.neto), ultima: fecha10(x.ultima) }));
}

export async function cargarReglas(supabase: SupabaseClient): Promise<{ id: string; regla: ReglaPrioridad }[] | null> {
  const { data, error } = await supabase.from("fin_pago_prioridades").select("id, ambito, valor, prioridad").order("ambito").order("valor");
  if (error) return null;
  return (data ?? [])
    .filter((r) => esPrioridad(r.prioridad) && (r.ambito === "categoria" || r.ambito === "contraparte"))
    .map((r) => ({ id: String(r.id), regla: { ambito: r.ambito as "categoria" | "contraparte", valor: String(r.valor), prioridad: r.prioridad } }));
}

export interface DeudaTesoreria {
  prestamos: Prestamo[];
  lineas: LineaCredito[];
  /** Financiamientos por ciclo (migración 0946; vacío sin ella). */
  ciclos: FinanciamientoCiclo[];
  /** Falta la migración 0946: sin giros ni penalidades de prepago. */
  sinMigracionCiclos: boolean;
}

export async function cargarDeuda(supabase: SupabaseClient): Promise<DeudaTesoreria | null> {
  const [p, l, c, pp, lp] = await Promise.all([
    supabase.from("fin_prestamos").select("id, nombre, acreedor, clase, monto, tasa_anual, plazo_meses, fecha_desembolso, primer_vencimiento, tipo_id, cuenta_id, fin_tipos(nombre)").eq("activo", true).order("fecha_desembolso"),
    supabase.from("fin_lineas_credito").select("id, nombre, banco, cupo, usado, usado_al, tasa_anual, fecha_renovacion").eq("activo", true).order("nombre"),
    supabase
      .from("fin_financiamientos_ciclo")
      .select("id, nombre, acreedor, monto, tasa_ciclo, dias_ciclo, fecha_inicio, renovable, penalidad_prepago, comision_prepago, cuenta_id")
      .eq("activo", true)
      .order("fecha_inicio"),
    // Penalidades de prepago (migración 0946): aparte, para que sin ella lo demás siga leyéndose.
    supabase.from("fin_prestamos").select("id, penalidad_prepago, comision_prepago").eq("activo", true),
    supabase.from("fin_lineas_credito").select("id, penalidad_prepago, comision_prepago").eq("activo", true),
  ]);
  if (p.error || l.error) return null;
  const prepago = (r: typeof pp) => new Map(((r.error ? [] : r.data) ?? []).map((x) => [String(x.id), { penalidadPrepago: n(x.penalidad_prepago), comisionPrepago: n(x.comision_prepago) }]));
  const prepagoP = prepago(pp);
  const prepagoL = prepago(lp);
  return {
    sinMigracionCiclos: !!c.error,
    ciclos: (c.error ? [] : (c.data ?? [])).map((x) => ({
      id: String(x.id),
      nombre: String(x.nombre),
      acreedor: (x.acreedor as string | null) ?? null,
      monto: n(x.monto),
      tasaCiclo: n(x.tasa_ciclo),
      diasCiclo: Number(x.dias_ciclo),
      fechaInicio: String(x.fecha_inicio).slice(0, 10),
      renovable: x.renovable !== false,
      penalidadPrepago: n(x.penalidad_prepago),
      comisionPrepago: n(x.comision_prepago),
      cuentaId: (x.cuenta_id as string | null) ?? null,
    })),
    prestamos: (p.data ?? []).map((x) => ({
      id: String(x.id),
      nombre: String(x.nombre),
      acreedor: (x.acreedor as string | null) ?? null,
      clase: esClasePrestamo(x.clase) ? x.clase : "prestamo",
      monto: n(x.monto),
      tasaAnual: n(x.tasa_anual),
      plazoMeses: Number(x.plazo_meses),
      fechaDesembolso: String(x.fecha_desembolso).slice(0, 10),
      primerVencimiento: String(x.primer_vencimiento).slice(0, 10),
      tipoId: (x.tipo_id as string | null) ?? null,
      cuentaId: (x.cuenta_id as string | null) ?? null,
      tipoNombre: (Array.isArray(x.fin_tipos) ? x.fin_tipos[0]?.nombre : (x.fin_tipos as { nombre?: string } | null)?.nombre) ?? null,
      ...prepagoP.get(String(x.id)),
    })),
    lineas: (l.data ?? []).map((x) => ({
      id: String(x.id),
      nombre: String(x.nombre),
      banco: (x.banco as string | null) ?? null,
      cupo: n(x.cupo),
      usado: n(x.usado),
      usadoAl: String(x.usado_al).slice(0, 10),
      tasaAnual: n(x.tasa_anual),
      fechaRenovacion: fecha10(x.fecha_renovacion),
      ...prepagoL.get(String(x.id)),
    })),
  };
}

/** Pedidos de Dropi en tránsito y la historia que da su tasa de entrega y su neto (null sin la migración). */
export async function cargarTransitoDropi(supabase: SupabaseClient): Promise<{ pedidos: { fecha: string; pedidos: number; monto: number }[]; historia: HistoriaDropi | null } | null> {
  const [t, h] = await Promise.all([supabase.rpc("fin_dropi_transito", { p_pais: "PA" }), supabase.rpc("fin_dropi_historia", { p_pais: "PA", p_dias: 90 })]);
  if (t.error) return null;
  const fila = ((h.data ?? []) as Record<string, unknown>[])[0];
  return {
    pedidos: ((t.data ?? []) as Record<string, unknown>[]).map((x) => ({ fecha: String(x.fecha).slice(0, 10), pedidos: Number(x.pedidos), monto: n(x.monto) })),
    historia:
      h.error || !fila
        ? null
        : {
            entregados: Number(fila.entregados),
            devueltos: Number(fila.devueltos),
            montoEntregados: n(fila.monto_entregados),
            conGanancia: Number(fila.con_ganancia),
            montoConGanancia: n(fila.monto_con_ganancia),
            ganancia: n(fila.ganancia),
            diasAGanancia: fila.dias_a_ganancia === null || fila.dias_a_ganancia === undefined ? null : n(fila.dias_a_ganancia),
          },
  };
}

export interface VistaPosicion {
  hoy: string;
  config: ConfigTesoreria;
  cuentas: CuentaTesoreria[];
  puntos: PuntoSaldo[];
  sinMigracion: boolean;
  posicion: Posicion;
  dropi: SeguimientoDropi | null;
  dropiSaldos: { fecha: string; monto: number }[];
  depositos: DepositoRepartidor[] | null;
  antiguedad: AntiguedadRepartidor[] | null;
  deuda: DeudaTesoreria | null;
  porAprobar: number;
  saldosViejos: { cuenta: string; fecha: string }[];
}

/** Todo lo de la posición del día (la usan la portada de Tesorería y la tarjeta del Panel). */
export async function cargarPosicion(supabase: SupabaseClient, hoy: string, desdeSerie = sumarDias(hoy, -60)): Promise<VistaPosicion> {
  const [config, cuentas, saldos, semanas, dropiDatos, porLiquidar, deuda, porAprobar] = await Promise.all([
    cargarConfigTesoreria(supabase),
    cargarCuentas(supabase),
    cargarPuntosSaldo(supabase, desdeSerie),
    cargarSemanasRepartidores(supabase, hoy),
    cargarDatosDropi(supabase, hoy),
    cargarPorLiquidar(supabase),
    cargarDeuda(supabase),
    supabase.from("fin_pagos_programados").select("id", { count: "exact", head: true }).eq("estado", "solicitado"),
  ]);
  const ultimos = ultimosSaldos(saldos.puntos);
  const depositos = semanas ? depositosRepartidores(semanas, hoy, config.toleranciaDeposito) : null;
  const antiguedad = depositos ? antiguedadEfectivo(depositos, config.efectivoDias) : null;
  const dropi = dropiDatos ? seguimientoDropi(dropiDatos, config) : null;
  const yappy = porLiquidar?.find((x) => x.fuente === "yappy") ?? null;
  const efectivo = depositos ? Math.round(depositos.reduce((a, d) => a + d.faltante, 0) * 100) / 100 : null;
  const posicion = posicionCaja({
    hoy,
    cuentas,
    saldos: ultimos,
    yappyPorLiquidar: yappy ? { monto: yappy.neto, fecha: hoy } : null,
    efectivoRepartidores: efectivo === null ? null : { monto: efectivo, fecha: hoy },
    dropiWallet: dropi && dropi.saldo !== null && dropi.fechaSaldo ? { monto: dropi.saldo, fecha: dropi.fechaSaldo } : null,
    dropiRetiros: dropi && dropi.abiertos ? { monto: dropi.enCamino, fecha: dropi.ultimoRetiro, cantidad: dropi.abiertos } : null,
  });
  const saldosViejos = cuentas
    .filter((c) => (c.clase === "banco" || c.clase === "billetera") && ultimos.has(c.id))
    .map((c) => ({ cuenta: c.nombre, fecha: ultimos.get(c.id)!.fecha }))
    .filter((s) => sumarDias(s.fecha, config.saldoDias) < hoy);
  return {
    hoy,
    config,
    cuentas,
    puntos: saldos.puntos,
    sinMigracion: saldos.sinMigracion,
    posicion,
    dropi,
    dropiSaldos: dropiDatos?.saldos ?? [],
    depositos,
    antiguedad,
    deuda,
    porAprobar: porAprobar.error ? 0 : (porAprobar.count ?? 0),
    saldosViejos,
  };
}

/** Las líneas de crédito con su estado (para las alertas). */
export const lineasConEstado = (lineas: LineaCredito[], hoy: string, diasAviso: number) =>
  lineas.map((l) => ({ ...l, estado: estadoLinea(l, hoy, diasAviso) }));

/** Las alertas de Tesorería a partir de la posición del día. */
export function alertasDePosicion(v: VistaPosicion): AlertaTesoreria[] {
  return alertasTesoreria(
    {
      hoy: v.hoy,
      config: v.config,
      dropi: v.dropi,
      antiguedad: v.antiguedad,
      depositos: v.depositos,
      saldosViejos: v.saldosViejos,
      lineas: (v.deuda?.lineas ?? []).map((l) => {
        const e = estadoLinea(l, v.hoy, v.config.lineaDias);
        return { nombre: l.nombre, alertas: e.alertas, diasParaRenovar: e.diasParaRenovar, uso: e.uso };
      }),
      porAprobar: v.porAprobar,
    },
    (x) => dinero(x),
  );
}

/**
 * Las alertas de Tesorería que dejó la tarea diaria «alertas» en `fin_alertas` (migración 0939). Mientras la tarea no las
 * haya guardado nunca (o sin la migración), se calculan al momento como antes.
 */
export async function cargarAlertasTesoreria(supabase: SupabaseClient, v: VistaPosicion): Promise<{ alertas: AlertaTesoreria[]; guardadas: boolean }> {
  const tipos = TIPOS_TESORERIA.map((t) => t.tipo);
  const [activas, alguna] = await Promise.all([
    supabase.from("fin_alertas").select("clave, tipo, severidad, mensaje, enlace").in("tipo", tipos).is("resuelta_en", null).limit(200),
    supabase.from("fin_alertas").select("clave").in("tipo", tipos).limit(1),
  ]);
  if (activas.error || alguna.error || !(alguna.data ?? []).length) return { alertas: alertasDePosicion(v), guardadas: false };
  const peso = { critica: 0, aviso: 1, info: 2 } as const;
  const alertas = ((activas.data ?? []) as { clave: string; tipo: TipoAlerta; severidad: keyof typeof peso; mensaje: string; enlace: string | null }[])
    .map((a) => {
      const { titulo, mensaje } = partirMensajeTesoreria(a.mensaje, a.tipo);
      return { clave: a.clave, severidad: a.severidad, titulo, mensaje, href: a.enlace ?? "/tesoreria" };
    })
    .sort((x, y) => peso[x.severidad] - peso[y.severidad]);
  return { alertas, guardadas: true };
}
