// Alertas financieras (migración 0921, `fin_alertas`). La tarea diaria mira los datos y deja una alerta por situación
// (`clave`): volver a correrla no duplica, y lo que deja de pasar queda resuelto. Se muestran en «Necesita tu atención»
// del Panel financiero, agrupadas por tipo y solo las de los módulos que la persona abre. La parte que decide es pura
// (`armarAlertas`, `cambiosAlertas`, `leerFotoProyeccion`); prueba en `alertas.test.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { COSTO_VENTAS_MAX, COSTO_VENTAS_MIN, mesAnterior, nombreMes } from "../finanzas/cierre";
import { cargarDatosMeses } from "../finanzas/cargar-cierre";
import { cargarConfigCierre } from "../finanzas/cargar-cierre-control";
import { fechaObjetivo } from "../finanzas/cierre-control";
import { traerTodasConError } from "../supabase/paginar";

export const TIPOS_ALERTA = [
  "caja_minima",
  "cxp_vence",
  "cxc_vencido",
  "cierre_pendiente",
  "costo_ventas",
  "inventario_sin_costo",
  // Migración 0928: las generan la tarea del cierre y el calendario fiscal (`finanzas/avisos-cierre.ts`), no `armarAlertas`.
  "cierre_tarea_atrasada",
  "fiscal_vence",
  // Migración 0939: las de Tesorería (`alertasTesoreria`), que antes se calculaban al abrir la página.
  "tesoreria_dropi",
  "tesoreria_efectivo",
  "tesoreria_depositos",
  "tesoreria_linea_vencida",
  "tesoreria_linea_renovar",
  "tesoreria_linea_uso",
  "tesoreria_saldos",
  "tesoreria_pagos",
  // Migración 0943: techo de pauta por tienda (`generarAlertasPauta`, src/lib/tareas/ejecutar.ts).
  "pauta_techo",
  // Migración 0947: covenants que incumplen, están en riesgo o incumplirían en 6 meses (`generarAlertasCovenants`).
  "tesoreria_covenant",
  // Migración 0948: un riesgo de la matriz subió de nivel (`evaluarYGuardarRiesgos`, src/lib/finanzas/cargar-riesgos.ts).
  "riesgo_sube",
] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];
export type Severidad = "info" | "aviso" | "critica";

/** El módulo que hay que poder abrir para ver cada tipo, a dónde se resuelve y cómo se llama en el Panel. */
export const DEF_ALERTA: Record<TipoAlerta, { modulo: string; titulo: string; accion: string; href: string }> = {
  caja_minima: { modulo: "flujo-caja", titulo: "Caja proyectada bajo el mínimo", accion: "Ver proyección", href: "/flujo-caja" },
  cxp_vence: { modulo: "cuentas-por-pagar", titulo: "Por pagar que vence en 7 días", accion: "Programar pagos", href: "/cuentas-por-pagar" },
  cxc_vencido: { modulo: "cuentas-por-cobrar", titulo: "Por cobrar vencido esta semana", accion: "Cobrar", href: "/cuentas-por-cobrar" },
  cierre_pendiente: { modulo: "cierre-mes", titulo: "Mes anterior sin cerrar", accion: "Cerrar mes", href: "/cierre-mes" },
  costo_ventas: { modulo: "estado-resultados", titulo: "Costo de ventas fuera de rango", accion: "Revisar", href: "/estado-resultados" },
  inventario_sin_costo: { modulo: "rentabilidad", titulo: "Inventario sin costo", accion: "Cargar costos", href: "/rentabilidad/inventario" },
  cierre_tarea_atrasada: { modulo: "cierre-mes", titulo: "Tareas del cierre atrasadas", accion: "Resolver", href: "/cierre-mes" },
  fiscal_vence: { modulo: "cierre-mes", titulo: "Obligaciones fiscales por vencer", accion: "Ver calendario", href: "/cierre-mes/calendario-fiscal" },
  tesoreria_dropi: { modulo: "tesoreria", titulo: "Conviene pedir un retiro de Dropi", accion: "Pedir retiro", href: "/tesoreria" },
  tesoreria_efectivo: { modulo: "tesoreria", titulo: "Efectivo viejo en repartidores", accion: "Ver repartidores", href: "/tesoreria/repartidores" },
  tesoreria_depositos: { modulo: "tesoreria", titulo: "Depósitos de repartidores faltantes o incompletos", accion: "Ver repartidores", href: "/tesoreria/repartidores" },
  tesoreria_linea_vencida: { modulo: "tesoreria", titulo: "Línea de crédito vencida", accion: "Ver deuda", href: "/tesoreria/deuda" },
  tesoreria_linea_renovar: { modulo: "tesoreria", titulo: "Línea de crédito por renovar", accion: "Ver deuda", href: "/tesoreria/deuda" },
  tesoreria_linea_uso: { modulo: "tesoreria", titulo: "Línea de crédito casi agotada", accion: "Ver deuda", href: "/tesoreria/deuda" },
  tesoreria_saldos: { modulo: "tesoreria", titulo: "Saldos bancarios desactualizados", accion: "Cargar saldos", href: "/tesoreria/saldos" },
  tesoreria_pagos: { modulo: "tesoreria", titulo: "Pagos por aprobar", accion: "Aprobar", href: "/tesoreria/pagos" },
  pauta_techo: { modulo: "rentabilidad", titulo: "Tienda sobre el techo de pauta", accion: "Ver pauta", href: "/rentabilidad" },
  tesoreria_covenant: { modulo: "tesoreria", titulo: "Covenant en riesgo", accion: "Ver covenants", href: "/tesoreria/covenants" },
  riesgo_sube: { modulo: "capital-riesgo", titulo: "Riesgo financiero que subió de nivel", accion: "Ver riesgos", href: "/capital-riesgo" },
};

/** Los tipos de Tesorería y de qué alerta de la página sale cada uno (por el comienzo de su clave). */
export const TIPOS_TESORERIA: { tipo: TipoAlerta; prefijo: string }[] = [
  { tipo: "tesoreria_dropi", prefijo: "dropi-retiro" },
  { tipo: "tesoreria_efectivo", prefijo: "efectivo-viejo" },
  { tipo: "tesoreria_depositos", prefijo: "depositos-faltantes" },
  { tipo: "tesoreria_linea_vencida", prefijo: "linea-vencida:" },
  { tipo: "tesoreria_linea_renovar", prefijo: "linea-renovar:" },
  { tipo: "tesoreria_linea_uso", prefijo: "linea-uso:" },
  { tipo: "tesoreria_saldos", prefijo: "saldos-viejos" },
  { tipo: "tesoreria_pagos", prefijo: "pagos-por-aprobar" },
  // No sale de `alertasTesoreria`: la deja `generarAlertasCovenants` con su clave «cov:<id>»; se lista para que la portada
  // de Tesorería la muestre con las demás.
  { tipo: "tesoreria_covenant", prefijo: "cov:" },
];
export const esTipoTesoreria = (t: string) => TIPOS_TESORERIA.some((x) => x.tipo === t);

/**
 * Las alertas de Tesorería como filas de `fin_alertas`: la clave lleva «tes:» delante y el mensaje, el título de la alerta
 * (que trae los umbrales configurados) y su detalle.
 */
export function alertasTesoreriaANuevas(
  alertas: { clave: string; severidad: Severidad; titulo: string; mensaje: string; href: string }[],
): AlertaNueva[] {
  const out: AlertaNueva[] = [];
  for (const a of alertas) {
    const t = TIPOS_TESORERIA.find((x) => a.clave.startsWith(x.prefijo));
    if (!t) continue;
    out.push({
      clave: `tes:${a.clave}`.slice(0, 200),
      tipo: t.tipo,
      severidad: a.severidad,
      mensaje: recortar(`${a.titulo}: ${a.mensaje}`),
      enlace: /^\/[A-Za-z0-9/_?=&.%-]*$/.test(a.href) ? a.href : DEF_ALERTA[t.tipo].href,
      modulo: DEF_ALERTA[t.tipo].modulo,
      monto: null,
    });
  }
  return out;
}

/** Separa «Título: detalle» de una alerta de Tesorería guardada (para mostrarla en su página como se calculaba). */
export function partirMensajeTesoreria(mensaje: string, tipo: TipoAlerta): { titulo: string; mensaje: string } {
  const i = mensaje.indexOf(": ");
  return i > 0 ? { titulo: mensaje.slice(0, i), mensaje: mensaje.slice(i + 2) } : { titulo: DEF_ALERTA[tipo].titulo, mensaje };
}

/** El día del mes desde el que el mes anterior debería estar cerrado. */
export const DIA_LIMITE_CIERRE = 10;
/** Días hacia adelante para las cuentas por pagar y hacia atrás para lo que venció «nuevo». */
export const DIAS_VENTANA = 7;
/** Tope de alertas por documento en una corrida (las más grandes primero). */
export const MAX_POR_TIPO = 50;

export interface AlertaNueva {
  clave: string;
  tipo: TipoAlerta;
  severidad: Severidad;
  mensaje: string;
  enlace: string;
  modulo: string;
  monto: number | null;
}

export interface Documento {
  id: string;
  contraparte: string;
  documento: string | null;
  saldo: number;
  vencimiento: string;
}

/**
 * Lo que la tarea leyó. `null` = la fuente no se pudo leer (migración sin correr): ese tipo no se evalúa y sus alertas
 * no se tocan.
 */
export interface DatosAlertas {
  hoy: string;
  caja: { saldoMinimo: number; fecha: string | null; minimo: number } | null;
  cxpPorVencer: Documento[] | null;
  cxcVencidos: Documento[] | null;
  /** `fechaObjetivo`: el día en que el mes debía quedar cerrado (Cierre de mes › Configuración); sin ella, el día 10. */
  cierreAnterior: { periodo: string; estado: string; fechaObjetivo?: string } | null;
  costoVentas: { periodo: string; ingresos: number; costo: number } | null;
  inventarioSinCosto: { productos: number; unidades: number } | null;
}

const usd = (v: number) => `US$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const r2 = (v: number) => Math.round(v * 100) / 100;
const recortar = (s: string) => (s.length > 500 ? `${s.slice(0, 497)}…` : s);

/** Lunes de la semana de una fecha (la clave de la alerta de caja: una por semana). */
export function lunesDe(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Las alertas que corresponden hoy y los tipos que se pudieron evaluar. */
export function armarAlertas(d: DatosAlertas): { alertas: AlertaNueva[]; evaluados: TipoAlerta[] } {
  const alertas: AlertaNueva[] = [];
  const evaluados: TipoAlerta[] = [];
  const nueva = (tipo: TipoAlerta, clave: string, severidad: Severidad, mensaje: string, monto: number | null, enlace = DEF_ALERTA[tipo].href) =>
    alertas.push({ clave, tipo, severidad, mensaje: recortar(mensaje), enlace, modulo: DEF_ALERTA[tipo].modulo, monto: monto === null ? null : r2(monto) });

  if (d.caja) {
    evaluados.push("caja_minima");
    if (d.caja.saldoMinimo < d.caja.minimo) {
      nueva(
        "caja_minima",
        `caja-minima:${lunesDe(d.hoy)}`,
        "critica",
        `La caja proyectada baja a ${usd(d.caja.saldoMinimo)}${d.caja.fecha ? ` el ${fechaCorta(d.caja.fecha)}` : ""} (mínimo ${usd(d.caja.minimo)})`,
        d.caja.saldoMinimo,
      );
    }
  }
  if (d.cxpPorVencer) {
    evaluados.push("cxp_vence");
    for (const x of [...d.cxpPorVencer].sort((a, b) => b.saldo - a.saldo).slice(0, MAX_POR_TIPO)) {
      nueva("cxp_vence", `cxp-vence:${x.id}`, "aviso", `${x.contraparte}${x.documento ? ` · ${x.documento}` : ""}: ${usd(x.saldo)} vence el ${fechaCorta(x.vencimiento)}`, x.saldo);
    }
  }
  if (d.cxcVencidos) {
    evaluados.push("cxc_vencido");
    for (const x of [...d.cxcVencidos].sort((a, b) => b.saldo - a.saldo).slice(0, MAX_POR_TIPO)) {
      nueva("cxc_vencido", `cxc-vencido:${x.id}`, "aviso", `${x.contraparte}${x.documento ? ` · ${x.documento}` : ""}: ${usd(x.saldo)} venció el ${fechaCorta(x.vencimiento)}`, x.saldo);
    }
  }
  if (d.cierreAnterior) {
    evaluados.push("cierre_pendiente");
    const dia = Number(d.hoy.slice(8, 10));
    const objetivo = d.cierreAnterior.fechaObjetivo;
    const vencido = objetivo ? d.hoy > objetivo : dia >= DIA_LIMITE_CIERRE;
    if (vencido && d.cierreAnterior.estado !== "cerrado") {
      const p = d.cierreAnterior.periodo;
      const tarde = objetivo ? d.hoy > sumarDias(objetivo, 5) : dia >= DIA_LIMITE_CIERRE + 5;
      nueva(
        "cierre_pendiente",
        `cierre:${p.slice(0, 7)}`,
        tarde ? "critica" : "aviso",
        `${nombreMes(p)} sigue ${d.cierreAnterior.estado === "en_revision" ? "en revisión" : "abierto"} al día ${dia}`,
        null,
        `/cierre-mes/${p.slice(0, 7)}`,
      );
    }
  }
  if (d.costoVentas) {
    evaluados.push("costo_ventas");
    const { ingresos, costo, periodo } = d.costoVentas;
    if (ingresos > 0) {
      const p = (100 * costo) / ingresos;
      if (p < COSTO_VENTAS_MIN || p > COSTO_VENTAS_MAX) {
        nueva(
          "costo_ventas",
          `costo-ventas:${periodo.slice(0, 7)}`,
          "aviso",
          `${nombreMes(periodo)}: el costo de ventas es el ${p.toFixed(1)} % de los ingresos (se espera ${COSTO_VENTAS_MIN} % a ${COSTO_VENTAS_MAX} %)`,
          costo,
        );
      }
    }
  }
  if (d.inventarioSinCosto) {
    evaluados.push("inventario_sin_costo");
    if (d.inventarioSinCosto.productos > 0) {
      nueva(
        "inventario_sin_costo",
        "inventario-sin-costo",
        "info",
        `${d.inventarioSinCosto.productos} ${d.inventarioSinCosto.productos === 1 ? "producto" : "productos"} con stock y sin costo (${d.inventarioSinCosto.unidades} unidades sin valorizar)`,
        null,
      );
    }
  }
  return { alertas, evaluados };
}

export interface AlertaGuardada {
  clave: string;
  tipo: TipoAlerta;
  resuelta_en: string | null;
}

/** Qué se resuelve: las alertas abiertas de un tipo evaluado que hoy ya no aparecen. */
export function cambiosAlertas(existentes: AlertaGuardada[], nuevas: AlertaNueva[], evaluados: TipoAlerta[]): { resolver: string[] } {
  const hoy = new Set(nuevas.map((n) => n.clave));
  const tipos = new Set(evaluados);
  return { resolver: existentes.filter((e) => !e.resuelta_en && tipos.has(e.tipo) && !hoy.has(e.clave)).map((e) => e.clave) };
}

/**
 * La última foto de la proyección de caja (`fin_proyeccion_fotos`, la crea Proyección de caja): su saldo mínimo
 * proyectado y cuándo. Se aceptan los nombres `saldo_minimo` / `caja_minima` / `minimo` y `fecha_minimo` / `fecha`; la
 * más nueva por `tomada_en` / `creada_en` / `creado_en` / `semana`. null si no hay fotos o no traen el saldo.
 */
export function leerFotoProyeccion(filas: Record<string, unknown>[]): { saldoMinimo: number; fecha: string | null } | null {
  const momento = (f: Record<string, unknown>) => String(f.tomada_en ?? f.creada_en ?? f.creado_en ?? f.semana ?? "");
  const ultima = [...filas].sort((a, b) => momento(b).localeCompare(momento(a)))[0];
  if (!ultima) return null;
  const valor = ultima.saldo_minimo ?? ultima.caja_minima ?? ultima.minimo;
  const n = typeof valor === "number" ? valor : typeof valor === "string" ? Number(valor) : NaN;
  if (!Number.isFinite(n)) return null;
  const f = ultima.fecha_minimo ?? ultima.fecha;
  return { saldoMinimo: n, fecha: typeof f === "string" && /^\d{4}-\d{2}-\d{2}/.test(f) ? f.slice(0, 10) : null };
}

// ---------------------------------------------------------------------------------------------
// Lectura y escritura
// ---------------------------------------------------------------------------------------------

const sumarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function documentos(supabase: SupabaseClient, clase: "cobrar" | "pagar", desde: string, hasta: string): Promise<Documento[] | null> {
  const r = await traerTodasConError<Record<string, unknown>>((a, b) => {
    let q = supabase
      .from("fin_cartera_saldos")
      .select("id, contraparte, documento, saldo, vencimiento_efectivo, estado, vencido")
      .eq("clase", clase)
      .in("estado", ["pendiente", "parcial"])
      .gte("vencimiento_efectivo", desde)
      .lte("vencimiento_efectivo", hasta);
    if (clase === "cobrar") q = q.eq("vencido", true);
    return q.order("id").range(a, b);
  });
  if (r.error) return null;
  return (r.data ?? [])
    .filter((x) => Number(x.saldo) > 0.005)
    .map((x) => ({ id: String(x.id), contraparte: String(x.contraparte ?? ""), documento: (x.documento as string | null) ?? null, saldo: Number(x.saldo), vencimiento: String(x.vencimiento_efectivo).slice(0, 10) }));
}

/** Lee todo lo que miran las alertas. Cada fuente que falla queda en null (no se evalúa). */
export async function leerDatosAlertas(supabase: SupabaseClient, hoy: string): Promise<DatosAlertas> {
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const anterior = mesAnterior(mesEnCurso);
  const [cxp, cxc, cierre, fotos, minimo, inventario, meses, configCierre] = await Promise.all([
    documentos(supabase, "pagar", hoy, sumarDias(hoy, DIAS_VENTANA)),
    documentos(supabase, "cobrar", sumarDias(hoy, -DIAS_VENTANA), sumarDias(hoy, -1)),
    supabase.from("fin_cierres").select("estado").eq("periodo", anterior).maybeSingle(),
    supabase.from("fin_proyeccion_fotos").select("*").limit(200),
    supabase.from("fin_config").select("valor").eq("clave", "caja_minima").maybeSingle(),
    traerTodasConError<{ sku_maestro_id: string; unidades: number | string }>((a, b) =>
      supabase.from("fin_inventario_valorizado").select("sku_maestro_id, unidades").eq("pais", "PA").eq("sin_costo", true).gt("unidades", 0).order("sku_maestro_id").range(a, b),
    ),
    cargarDatosMeses(supabase, [anterior]).catch(() => null),
    cargarConfigCierre(supabase),
  ]);
  const foto = fotos.error ? null : leerFotoProyeccion((fotos.data ?? []) as Record<string, unknown>[]);
  const valorMinimo = Number(minimo.data?.valor ?? 0);
  const cv = meses?.get(anterior)?.costoVentas ?? null;
  return {
    hoy,
    caja: foto ? { ...foto, minimo: Number.isFinite(valorMinimo) ? valorMinimo : 0 } : null,
    cxpPorVencer: cxp,
    cxcVencidos: cxc,
    cierreAnterior: cierre.error
      ? null
      : {
          periodo: anterior,
          estado: (cierre.data?.estado as string | undefined) ?? "abierto",
          fechaObjetivo: configCierre.guardada ? fechaObjetivo(anterior, configCierre.config.diaHabil) : undefined,
        },
    costoVentas: cv ? { periodo: anterior, ...cv } : null,
    inventarioSinCosto: inventario.error
      ? null
      : { productos: new Set((inventario.data ?? []).map((x) => x.sku_maestro_id)).size, unidades: (inventario.data ?? []).reduce((a, x) => a + Number(x.unidades), 0) },
  };
}

/** Guarda las alertas de hoy y resuelve las de los tipos evaluados que ya no aparecen. Idempotente. */
export async function guardarAlertas(
  supabase: SupabaseClient,
  alertas: AlertaNueva[],
  evaluados: TipoAlerta[],
): Promise<{ error: string } | { nuevas: number; activas: number; resueltas: number }> {
  const tipos = new Set(evaluados);
  const existentes = await traerTodasConError<AlertaGuardada>((a, b) => supabase.from("fin_alertas").select("clave, tipo, resuelta_en").order("clave").range(a, b));
  if (existentes.error) return { error: "Falta correr la migración 0921 (alertas) en Supabase." };
  const previas = new Map((existentes.data ?? []).map((e) => [e.clave, e]));
  const ahora = new Date().toISOString();
  for (let i = 0; i < alertas.length; i += 200) {
    const { error } = await supabase.from("fin_alertas").upsert(
      alertas.slice(i, i + 200).map((a) => ({ ...a, actualizada: ahora, resuelta_en: null })),
      { onConflict: "clave" },
    );
    if (error) return { error: `No se pudieron guardar las alertas: ${error.message}` };
  }
  const { resolver } = cambiosAlertas((existentes.data ?? []).filter((e) => tipos.has(e.tipo)), alertas, evaluados);
  for (let i = 0; i < resolver.length; i += 200) {
    const { error } = await supabase.from("fin_alertas").update({ resuelta_en: ahora }).in("clave", resolver.slice(i, i + 200));
    if (error) return { error: `No se pudieron resolver las alertas: ${error.message}` };
  }
  return { nuevas: alertas.filter((a) => !previas.has(a.clave) || previas.get(a.clave)!.resuelta_en).length, activas: alertas.length, resueltas: resolver.length };
}

/** Genera y resuelve las alertas de hoy. Idempotente. */
export async function generarAlertas(supabase: SupabaseClient, hoy: string): Promise<{ error: string } | { nuevas: number; activas: number; resueltas: number; evaluados: TipoAlerta[] }> {
  const datos = await leerDatosAlertas(supabase, hoy);
  const { alertas, evaluados } = armarAlertas(datos);
  const r = await guardarAlertas(supabase, alertas, evaluados);
  return "error" in r ? r : { ...r, evaluados };
}

export interface FilaAlertaPanel {
  clave: string;
  modulo: string;
  titulo: string;
  descripcion: string;
  cantidad: number;
  href: string;
  accion: string;
}

/**
 * Las alertas abiertas y no vistas, una fila por tipo (de las más graves a las más leves), solo de los módulos que la
 * persona abre. La forma es la de `PendienteCierre` del Panel. Sin la migración, ninguna.
 */
export async function cargarAlertasPanel(supabase: SupabaseClient, modulos: string[]): Promise<FilaAlertaPanel[]> {
  const { data, error } = await supabase
    .from("fin_alertas")
    .select("tipo, severidad, mensaje, enlace, monto, creada")
    .is("resuelta_en", null)
    .is("vista_en", null)
    .order("creada", { ascending: false })
    .limit(500);
  if (error) return [];
  return agruparAlertas((data ?? []) as { tipo: TipoAlerta; severidad: Severidad; mensaje: string; enlace: string | null }[], modulos);
}

const PESO: Record<Severidad, number> = { critica: 0, aviso: 1, info: 2 };

export function agruparAlertas(filas: { tipo: TipoAlerta; severidad: Severidad; mensaje: string; enlace: string | null }[], modulos: string[]): FilaAlertaPanel[] {
  const grupos = new Map<TipoAlerta, typeof filas>();
  for (const f of filas) {
    if (!(TIPOS_ALERTA as readonly string[]).includes(f.tipo) || !modulos.includes(DEF_ALERTA[f.tipo].modulo)) continue;
    grupos.set(f.tipo, [...(grupos.get(f.tipo) ?? []), f]);
  }
  return [...grupos]
    .map(([tipo, lista]) => {
      const peor = lista.reduce((m, x) => (PESO[x.severidad] < PESO[m.severidad] ? x : m), lista[0]);
      const def = DEF_ALERTA[tipo];
      return {
        orden: PESO[peor.severidad],
        fila: {
          clave: `alerta-${tipo}`,
          modulo: def.modulo,
          titulo: def.titulo,
          descripcion: lista.length > 1 ? `${peor.mensaje} y ${lista.length - 1} más` : peor.mensaje,
          cantidad: lista.length,
          href: lista.length === 1 && peor.enlace ? peor.enlace : def.href,
          accion: def.accion,
        },
      };
    })
    .sort((a, b) => a.orden - b.orden)
    .map((x) => x.fila);
}
