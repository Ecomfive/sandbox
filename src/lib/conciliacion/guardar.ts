// Escritura de la conciliación bancaria en Supabase (migración 0910). La usan la pantalla «Importar» (en lotes, desde
// Server Actions), las acciones de la página y el script `scripts/finanzas/importar-conciliacion.ts`. Recibe el cliente
// de Supabase: no decide permisos (eso lo hace quien lo llama).

import type { SupabaseClient } from "@supabase/supabase-js";
import { UNIDAD_SIN_ASIGNAR, huella } from "@/lib/finanzas/libro-excel";
import { semanasDelivery, type FilaCierre, type FilaRepartidor, type FilaTiendaSemana } from "./delivery";
import { FUENTE_VENTAS, clasificarLinea, emparejar, sumarDias, type CobroEmp, type LineaEmp, type MovEmp, type OrdenEmp, type Propuesta, type SemanaDel } from "./emparejar";
import { puedeRegistrarIngreso, repartirIngreso, type Reparto, type UnidadIngreso } from "./ingreso";
import type { CobroLeido, FormatoHoja, LineaLeida, MetodoOrden, OrdenLeida } from "./leer-excel";

/** El origen de lo que se crea en el libro desde la conciliación (`fin_movimientos.origen`). */
export const ORIGEN_CONCILIACION = "conciliacion";

/** Tamaño de cada lote que manda la pantalla (cabe holgado en el límite de 1 MB de una Server Action). */
export const TAMANO_LOTE = 400;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HUELLA = /^[0-9a-f]{24}#\d{1,5}$/;
const texto = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const fecha = (v: unknown): string | null => (typeof v === "string" && FECHA.test(v) ? v : null);
const numero = (v: unknown): number | null => {
  const n = Number(v);
  return typeof v === "number" && Number.isFinite(n) && Math.abs(n) <= 100_000_000 ? Math.round(n * 100) / 100 : null;
};

// ---------------------------------------------------------------------------------------------
// Validación de lo que manda el navegador (no se confía en nada)
// ---------------------------------------------------------------------------------------------

export function validarLinea(v: unknown): LineaLeida | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  const f = fecha(m.fecha);
  const monto = numero(m.monto);
  if (!f || !monto || typeof m.huella !== "string" || !HUELLA.test(m.huella)) return null;
  const saldo = m.saldo === null || m.saldo === undefined ? null : numero(m.saldo);
  return {
    hoja: texto(m.hoja, 60) ?? "",
    fila: Number.isInteger(m.fila) ? (m.fila as number) : 0,
    orden: Number.isInteger(m.orden) && (m.orden as number) >= 0 ? Math.min(m.orden as number, 1_000_000) : 0,
    fecha: f,
    descripcion: texto(m.descripcion, 300) ?? "",
    referencia: texto(m.referencia, 80),
    referencia_extra: texto(m.referencia_extra, 120),
    codigo: texto(m.codigo, 20),
    monto,
    saldo,
    tienda: texto(m.tienda, 60),
    estado_excel: texto(m.estado_excel, 40),
    huella: m.huella,
  };
}

const FUENTES = new Set(["yappy", "mipos", "servientrega"]);

export function validarCobro(v: unknown): CobroLeido | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  const f = fecha(m.fecha);
  const bruto = numero(m.monto_bruto);
  if (!f || bruto === null || !FUENTES.has(m.fuente as string) || typeof m.huella !== "string" || !HUELLA.test(m.huella)) return null;
  const comision = numero(m.comision ?? 0) ?? 0;
  return {
    fuente: m.fuente as CobroLeido["fuente"],
    fila: Number.isInteger(m.fila) ? (m.fila as number) : 0,
    fecha: f,
    fecha_deposito: fecha(m.fecha_deposito),
    referencia: texto(m.referencia, 60),
    lote: texto(m.lote, 80),
    referencia_banco: typeof m.referencia_banco === "string" && /^\d{3,20}$/.test(m.referencia_banco) ? m.referencia_banco : null,
    orden: texto(m.orden, 40),
    tienda: texto(m.tienda, 60),
    repartidor: texto(m.repartidor, 60),
    metodo: texto(m.metodo, 40),
    monto_bruto: bruto,
    comision,
    anulada: m.anulada === true,
    estado_excel: texto(m.estado_excel, 40),
    huella: m.huella,
  };
}

const METODOS = new Set<MetodoOrden>(["yappy", "tarjeta", "servientrega", "efectivo", "transferencia", "cierre"]);

export function validarOrden(v: unknown): OrdenLeida | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  const numeroOrden = texto(m.numero, 60);
  const monto = numero(m.monto);
  if (!numeroOrden || !monto || !METODOS.has(m.metodo_pago as MetodoOrden) || typeof m.huella !== "string" || !HUELLA.test(m.huella)) return null;
  return {
    tienda: texto(m.tienda, 60),
    numero: numeroOrden,
    fecha: fecha(m.fecha),
    monto,
    metodo_pago: m.metodo_pago as MetodoOrden,
    repartidor: texto(m.repartidor, 60),
    huella: m.huella,
  };
}

// ---------------------------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------------------------

/** La huella guardada de una línea: la del contenido combinada con su cuenta (la misma línea en dos cuentas son dos). */
export const huellaDeLinea = (cuentaId: string, h: string) => `${huella(`${cuentaId}|${h}`)}#1`;

/** Los meses (AAAA-MM-01) que tocan unas líneas. */
export function mesesDe(lineas: { fecha: string }[]): string[] {
  return [...new Set(lineas.map((l) => `${l.fecha.slice(0, 7)}-01`))].sort();
}

export interface DatosExtracto {
  cuentaId: string;
  archivo: string;
  hoja: string;
  formato: FormatoHoja;
}

/**
 * Crea o actualiza (por huella) un lote de líneas de un extracto. Lo ya conciliado, sugerido o ignorado conserva su
 * estado: el upsert no lo toca. Devuelve cuántas eran nuevas.
 */
export async function guardarLineas(
  supabase: SupabaseClient,
  e: DatosExtracto,
  lineas: LineaLeida[],
  usuarioId: string | null,
): Promise<{ guardadas: number; nuevas: number }> {
  if (!lineas.length) return { guardadas: 0, nuevas: 0 };
  const clave = `${huella(`${e.cuentaId}|${e.archivo}|${e.hoja}`)}#1`;
  const fechas = lineas.map((l) => l.fecha).sort();
  const previo = await supabase.from("conc_extractos").select("id, desde, hasta").eq("clave", clave).maybeSingle();
  if (previo.error) throw new Error(`conc_extractos: ${previo.error.message}`);
  const desde = [previo.data?.desde, fechas[0]].filter(Boolean).sort()[0];
  const hasta = [previo.data?.hasta, fechas[fechas.length - 1]].filter(Boolean).sort().at(-1);
  const formato = e.formato === "banco_general" || e.formato === "bac" ? e.formato : "generico";
  const ext = await supabase
    .from("conc_extractos")
    .upsert(
      { clave, cuenta_id: e.cuentaId, archivo: e.archivo.slice(0, 120), hoja: e.hoja.slice(0, 60), formato, desde, hasta, creado_por: usuarioId, actualizado_en: new Date().toISOString() },
      { onConflict: "clave" },
    )
    .select("id")
    .single();
  if (ext.error || !ext.data) throw new Error(`conc_extractos: ${ext.error?.message ?? "sin respuesta"}`);

  const filas = lineas.map((l) => ({
    extracto_id: ext.data.id as string,
    cuenta_id: e.cuentaId,
    fecha: l.fecha,
    orden: l.orden,
    descripcion: l.descripcion,
    referencia: l.referencia,
    referencia_extra: l.referencia_extra,
    codigo: l.codigo,
    monto: l.monto,
    saldo: l.saldo,
    clase: clasificarLinea(l.descripcion, l.monto),
    tienda: l.tienda,
    estado_excel: l.estado_excel,
    huella: huellaDeLinea(e.cuentaId, l.huella),
    actualizado_en: new Date().toISOString(),
  }));
  const ya = await enTrozos<{ huella: string }>(filas.map((f) => f.huella), (t) => supabase.from("conc_lineas").select("huella").in("huella", t));
  const { error } = await supabase.from("conc_lineas").upsert(filas, { onConflict: "huella" });
  if (error) throw new Error(`conc_lineas: ${error.message}`);
  const total = await supabase.from("conc_lineas").select("id", { count: "exact", head: true }).eq("extracto_id", ext.data.id);
  await supabase.from("conc_extractos").update({ lineas: total.count ?? 0 }).eq("id", ext.data.id);
  return { guardadas: filas.length, nuevas: filas.length - ya.length };
}

export async function guardarCobros(supabase: SupabaseClient, cobros: CobroLeido[]): Promise<number> {
  if (!cobros.length) return 0;
  const { error } = await supabase.from("conc_fuentes_cobro").upsert(
    cobros.map((c) => ({
      fuente: c.fuente,
      fecha: c.fecha,
      fecha_deposito: c.fecha_deposito,
      referencia: c.referencia,
      lote: c.lote,
      referencia_banco: c.referencia_banco,
      orden: c.orden,
      tienda: c.tienda,
      repartidor: c.repartidor,
      metodo: c.metodo,
      monto_bruto: c.monto_bruto,
      comision: c.comision,
      anulada: c.anulada,
      estado_excel: c.estado_excel,
      huella: c.huella,
      actualizado_en: new Date().toISOString(),
    })),
    { onConflict: "huella" },
  );
  if (error) throw new Error(`conc_fuentes_cobro: ${error.message}`);
  return cobros.length;
}

export async function guardarOrdenes(supabase: SupabaseClient, ordenes: OrdenLeida[]): Promise<number> {
  if (!ordenes.length) return 0;
  const { error } = await supabase.from("conc_ordenes").upsert(
    ordenes.map((o) => ({ ...o, fuente: "libro_conciliacion" })),
    { onConflict: "huella" },
  );
  if (error) throw new Error(`conc_ordenes: ${error.message}`);
  return ordenes.length;
}

// ---------------------------------------------------------------------------------------------
// Buscar coincidencias de una cuenta en un mes
// ---------------------------------------------------------------------------------------------

/** De a cuántos ids va cada consulta con `.in(...)`: 150 UUID ya son ~6 KB de dirección. */
export const TROZO = 150;

/**
 * Corre una consulta con `.in(...)` de a `TROZO` ids (una dirección con cientos de ids pasa el límite del servidor) y
 * junta las filas. Lanza si alguna falla.
 */
export async function enTrozos<T>(ids: string[], consulta: (trozo: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const salida: T[] = [];
  for (let i = 0; i < ids.length; i += TROZO) {
    const { data, error } = await consulta(ids.slice(i, i + TROZO));
    if (error) throw new Error(error.message || "La consulta falló.");
    salida.push(...(data ?? []));
  }
  return salida;
}

/** De a `TROZO` ids por consulta para no alargar la dirección. */
async function confirmadosDe(supabase: SupabaseClient, columna: "movimiento_id" | "cobro_id" | "orden_id", ids: string[]): Promise<Set<string>> {
  const salida = new Set<string>();
  for (let i = 0; i < ids.length; i += TROZO) {
    const { data, error } = await supabase.from("conc_pares").select(columna).eq("estado", "confirmado").in(columna, ids.slice(i, i + TROZO));
    if (error) throw new Error(`conc_pares: ${error.message}`);
    for (const r of data ?? []) salida.add((r as Record<string, string>)[columna]);
  }
  return salida;
}

/** Trae todas las filas de una consulta, de a 1 000 (el tope de PostgREST). */
async function todas<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    if (error) throw new Error(error.message);
    salida.push(...(data ?? []));
    if (!data || data.length < 1000) return salida;
  }
}

export const SIN_MIGRACION_V2 = "Falta correr la migración 0916 (conciliación bancaria v2) en Supabase.";

/**
 * Lo de Deliverys entre dos fechas (semanas que empiezan en ese rango): por repartidor, semana y tienda, sin lo ya
 * conciliado. Si Deliverys (0124) o la 0129 no están, no hay semanas: la conciliación sigue con lo demás.
 */
export async function leerSemanasDelivery(supabase: SupabaseClient, desde: string, hasta: string): Promise<SemanaDel[]> {
  const [tiendas, cierres, repartidores, unidades, confirmadas] = await Promise.all([
    todas<FilaTiendaSemana>((a, b) =>
      supabase
        .from("conc_delivery_tiendas")
        .select("repartidor_id, semana, unidad_id, pago_aparte, monto, cobrado_efectivo")
        .gte("semana", desde)
        .lte("semana", hasta)
        .order("semana")
        .order("repartidor_id")
        .order("unidad_id")
        .range(a, b),
    ).catch(() => null),
    todas<FilaCierre>((a, b) =>
      supabase.from("del_cierres").select("repartidor_id, semana, estado, adelantos, descuentos, neto, fecha_pago").gte("semana", desde).lte("semana", hasta).order("id").range(a, b),
    ).catch(() => [] as FilaCierre[]),
    supabase.from("del_repartidores").select("id, nombre, alias"),
    supabase.from("fin_unidades").select("id, nombre"),
    todas<{ del_repartidor_id: string; del_semana: string; del_unidad_id: string | null }>((a, b) =>
      supabase
        .from("conc_pares")
        .select("del_repartidor_id, del_semana, del_unidad_id")
        .eq("estado", "confirmado")
        .eq("clase", "delivery")
        .gte("del_semana", desde)
        .lte("del_semana", hasta)
        .order("id")
        .range(a, b),
    ).catch(() => []),
  ]);
  if (!tiendas || repartidores.error) return [];
  const num = (v: unknown) => Number(v ?? 0);
  return semanasDelivery(
    tiendas.map((t) => ({ ...t, semana: String(t.semana).slice(0, 10), monto: num(t.monto), cobrado_efectivo: num(t.cobrado_efectivo) })),
    cierres.map((c) => ({ ...c, semana: String(c.semana).slice(0, 10), adelantos: num(c.adelantos), descuentos: num(c.descuentos), neto: c.neto === null ? null : num(c.neto), fecha_pago: c.fecha_pago ? String(c.fecha_pago).slice(0, 10) : null })),
    ((repartidores.data ?? []) as FilaRepartidor[]).map((r) => ({ id: r.id, nombre: r.nombre, alias: r.alias ?? [] })),
    new Map((unidades.data ?? []).map((u) => [u.id as string, u.nombre as string])),
    new Set(confirmadas.map((c) => `${c.del_repartidor_id}|${String(c.del_semana).slice(0, 10)}|${c.del_unidad_id ?? ""}`)),
  );
}

export interface ResultadoRecalculo {
  lineas: number;
  auto: number;
  sugeridas: number;
  pendientes: number;
}

type Uno<T> = T | T[] | null;
const uno = <T>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * Vuelve a buscar coincidencias para las líneas sin conciliar de una cuenta en un mes: borra sus sugerencias, corre
 * `emparejar` contra lo que todavía no está conciliado y guarda lo nuevo. Lo que tiene prueba se confirma solo; lo
 * descartado por una persona no se vuelve a proponer.
 */
export async function recalcularCuentaMes(supabase: SupabaseClient, cuentaId: string, mes: string): Promise<ResultadoRecalculo> {
  const inicio = `${mes.slice(0, 7)}-01`;
  const fin = sumarDias(`${new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)).toISOString().slice(0, 10)}`, -1);
  const desde = sumarDias(inicio, -10);
  const hasta = sumarDias(fin, 7);

  const lineasDb = await todas<{ id: string; fecha: string; monto: number | string; descripcion: string; referencia: string | null; referencia_extra: string | null; clase: string }>((a, b) =>
    supabase
      .from("conc_lineas")
      .select("id, fecha, monto, descripcion, referencia, referencia_extra, clase")
      .eq("cuenta_id", cuentaId)
      .gte("fecha", inicio)
      .lte("fecha", fin)
      .in("estado", ["pendiente", "sugerida"])
      .order("fecha")
      .order("orden")
      .range(a, b),
  );
  if (!lineasDb.length) return { lineas: 0, auto: 0, sugeridas: 0, pendientes: 0 };
  const lineas: LineaEmp[] = lineasDb.map((l) => ({
    id: l.id,
    fecha: String(l.fecha).slice(0, 10),
    monto: Number(l.monto),
    descripcion: l.descripcion,
    referencia: l.referencia,
    referenciaExtra: l.referencia_extra,
    clase: l.clase as LineaEmp["clase"],
  }));
  const ids = lineas.map((l) => l.id);

  const [movsDb, cobrosDb, ordenesDb, descartadosDb] = await Promise.all([
    todas<{ id: string; fecha_pago: string | null; fecha_registro: string | null; monto: number | string; descripcion: string; fin_tipos: Uno<{ signo: number }> }>((a, b) =>
      supabase
        .from("fin_movimientos")
        .select("id, fecha_pago, fecha_registro, monto, descripcion, fin_tipos(signo)")
        .eq("cuenta_id", cuentaId)
        .gte("fecha_pago", desde)
        .lte("fecha_pago", hasta)
        .order("id")
        .range(a, b) as unknown as PromiseLike<{ data: never[] | null; error: { message: string } | null }>,
    ),
    todas<{ id: string; fuente: CobroEmp["fuente"]; fecha: string; fecha_deposito: string | null; lote: string | null; referencia_banco: string | null; monto_bruto: number | string; anulada: boolean }>((a, b) =>
      supabase
        .from("conc_fuentes_cobro")
        .select("id, fuente, fecha, fecha_deposito, lote, referencia_banco, monto_bruto, anulada")
        .gte("fecha", sumarDias(desde, -5))
        .lte("fecha", hasta)
        .order("id")
        .range(a, b),
    ),
    // Solo las que ninguna línea tiene confirmadas (la vista lo resuelve en Postgres; migración 0916).
    todas<{ id: string; fuente: string; numero: string; fecha: string | null; monto: number | string; metodo_pago: string; repartidor: string | null; tienda: string | null }>((a, b) =>
      supabase
        .from("conc_ordenes_libres")
        .select("id, fuente, numero, fecha, monto, metodo_pago, repartidor, tienda")
        .in("metodo_pago", ["efectivo", "transferencia", "cierre"])
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("id")
        .range(a, b),
    ),
    enTrozos<{ grupo: string }>(ids, (t) => supabase.from("conc_pares").select("grupo").eq("estado", "descartado").in("linea_id", t).limit(5000)),
  ]).catch((e: Error) => {
    throw new Error(/conc_ordenes_libres/.test(e.message) ? SIN_MIGRACION_V2 : e.message);
  });

  const propias = new Set(ids);
  const [movsUsados, cobrosUsados, ordenesDeOtras, clientes, semanas] = await Promise.all([
    confirmadosDe(supabase, "movimiento_id", movsDb.map((m) => m.id)),
    confirmadosDe(supabase, "cobro_id", cobrosDb.map((c) => c.id)),
    // Las órdenes son de todas las cuentas: la que ya es la propuesta elegida de una línea de otra cuenta u otro mes no
    // se ofrece otra vez (si no, al confirmar las dos chocarían).
    enTrozos<{ orden_id: string; linea_id: string }>(ordenesDb.map((o) => o.id), (t) =>
      supabase.from("conc_pares").select("orden_id, linea_id").eq("estado", "sugerido").eq("principal", true).in("orden_id", t),
    ).then((r) => new Set(r.filter((x) => !propias.has(x.linea_id)).map((x) => x.orden_id))),
    // Quien compró, para las órdenes pagadas por transferencia: se compara con el nombre que trae el banco.
    enTrozos<{ orden_id: string; nombre: string | null }>(
      ordenesDb.filter((o) => o.fuente === FUENTE_VENTAS && o.metodo_pago === "transferencia").map((o) => o.id),
      (t) => supabase.from("ven_ordenes_clientes").select("orden_id, nombre").in("orden_id", t),
    ).catch(() => [] as { orden_id: string; nombre: string | null }[]),
    leerSemanasDelivery(supabase, sumarDias(desde, -21), hasta),
  ]);
  const clienteDe = new Map(clientes.map((c) => [c.orden_id, c.nombre]));
  const movimientos: MovEmp[] = movsDb
    .filter((m) => !movsUsados.has(m.id))
    .map((m) => ({
      id: m.id,
      fecha: (m.fecha_pago ?? m.fecha_registro)?.slice(0, 10) ?? null,
      // Sin tipo no se sabe el signo: casi todo lo que llega sin tipo es un gasto (como en el flujo).
      efecto: Number(m.monto) * ((uno(m.fin_tipos)?.signo ?? -1) === 1 ? 1 : -1),
      descripcion: m.descripcion,
    }));
  const cobros: CobroEmp[] = cobrosDb
    .filter((c) => !cobrosUsados.has(c.id))
    .map((c) => ({
      id: c.id,
      fuente: c.fuente,
      fecha: String(c.fecha).slice(0, 10),
      fechaDeposito: c.fecha_deposito ? String(c.fecha_deposito).slice(0, 10) : null,
      lote: c.lote,
      referenciaBanco: c.referencia_banco,
      bruto: Number(c.monto_bruto),
      anulada: c.anulada,
    }));
  const ordenes: OrdenEmp[] = ordenesDb.filter((o) => !ordenesDeOtras.has(o.id)).map((o) => ({
    id: o.id,
    fuente: o.fuente,
    numero: o.numero,
    fecha: o.fecha ? String(o.fecha).slice(0, 10) : null,
    monto: Number(o.monto),
    metodo: o.metodo_pago,
    repartidor: o.repartidor,
    tienda: o.tienda,
    cliente: clienteDe.get(o.id) ?? null,
  }));

  const r = emparejar(lineas, { movimientos, cobros, ordenes, semanas }, {}, new Set(descartadosDb.map((d) => d.grupo)));

  // Se borran las sugerencias anteriores de estas líneas y se guardan las nuevas.
  for (let i = 0; i < ids.length; i += TROZO) {
    const { error } = await supabase.from("conc_pares").delete().eq("estado", "sugerido").in("linea_id", ids.slice(i, i + TROZO));
    if (error) throw new Error(`conc_pares: ${error.message}`);
  }
  const ahora = new Date().toISOString();
  const fila = (p: Propuesta, confirmar: boolean, principal = true) =>
    p.partes.map((x) => ({
      linea_id: p.lineaId,
      clase: x.clase,
      movimiento_id: x.clase === "movimiento" ? x.id : null,
      cobro_id: x.clase === "cobro" ? x.id : null,
      orden_id: x.clase === "orden" ? x.id : null,
      orden_fuente: x.clase === "orden" ? (x.fuente ?? "conc_ordenes") : null,
      del_repartidor_id: x.clase === "delivery" ? (x.delivery?.repartidorId ?? null) : null,
      del_semana: x.clase === "delivery" ? (x.delivery?.semana ?? null) : null,
      del_unidad_id: x.clase === "delivery" ? (x.delivery?.unidadId ?? null) : null,
      monto: x.monto,
      comision: x.comision ?? 0,
      puntaje: p.puntaje,
      metodo: p.metodo,
      grupo: p.grupo,
      detalle: p.detalle,
      estado: confirmar ? "confirmado" : "sugerido",
      auto: confirmar,
      principal,
      confirmado_en: confirmar ? ahora : null,
    }));
  const nuevas = [
    ...r.elegidas.flatMap((p) => fila(p, p.auto)),
    ...[...r.alternativas.values()].flat().flatMap((p) => fila(p, false, false)),
  ];
  for (let i = 0; i < nuevas.length; i += 500) {
    const { error } = await supabase.from("conc_pares").insert(nuevas.slice(i, i + 500));
    if (error) throw new Error(`conc_pares: ${error.message}`);
  }

  const auto = r.elegidas.filter((p) => p.auto).map((p) => p.lineaId);
  // Sugerida = tiene una propuesta elegida; con solo alternativas (sus partes las tomó otra línea) sigue pendiente.
  const sugeridas = new Set(r.elegidas.filter((p) => !p.auto).map((p) => p.lineaId));
  const pendientes = ids.filter((id) => !auto.includes(id) && !sugeridas.has(id));
  const marcar = async (lista: string[], cambios: Record<string, unknown>) => {
    for (let i = 0; i < lista.length; i += TROZO) {
      const { error } = await supabase.from("conc_lineas").update({ ...cambios, actualizado_en: ahora }).in("id", lista.slice(i, i + TROZO));
      if (error) throw new Error(`conc_lineas: ${error.message}`);
    }
  };
  await marcar(auto, { estado: "conciliada", conciliada_en: ahora, conciliada_por: null });
  await marcar([...sugeridas], { estado: "sugerida" });
  await marcar(pendientes, { estado: "pendiente" });
  return { lineas: ids.length, auto: auto.length, sugeridas: sugeridas.size, pendientes: pendientes.length };
}

// ---------------------------------------------------------------------------------------------
// Ingresos por cuenta (migración 0916): de qué tienda es lo que cubre cada línea conciliada
// ---------------------------------------------------------------------------------------------

export interface PlanIngreso {
  lineaId: string;
  huella: string;
  fecha: string;
  monto: number;
  cuentaId: string;
  cuenta: string;
  descripcion: string;
  reparto: (Reparto & { tienda: string })[];
}

/**
 * Para las líneas que se pueden registrar como ingreso (crédito conciliado solo con cobros, órdenes o deliverys y sin
 * registrar): cuánto va a cada tienda. Las demás no vuelven.
 */
export async function planIngresos(supabase: SupabaseClient, ids: string[]): Promise<PlanIngreso[]> {
  const [lineas, pares, unidades, tiendas, cuentas] = await Promise.all([
    enTrozos<{ id: string; huella: string; fecha: string; monto: number | string; cuenta_id: string; descripcion: string; estado: string; ingreso_en: string | null }>(ids, (t) =>
      supabase.from("conc_lineas").select("id, huella, fecha, monto, cuenta_id, descripcion, estado, ingreso_en").in("id", t),
    ),
    enTrozos<{ linea_id: string; clase: string; monto: number | string; cobro_id: string | null; orden_id: string | null; del_unidad_id: string | null }>(ids, (t) =>
      supabase.from("conc_pares").select("linea_id, clase, monto, cobro_id, orden_id, del_unidad_id").eq("estado", "confirmado").in("linea_id", t),
    ),
    supabase.from("fin_unidades").select("id, nombre"),
    supabase.from("del_tiendas").select("unidad_id, etiqueta"),
    supabase.from("fin_cuentas").select("id, nombre"),
  ]);
  if (unidades.error) throw new Error("No se pudieron leer las tiendas del libro.");
  const etiquetas = new Map<string, string[]>();
  for (const t of tiendas.data ?? []) etiquetas.set(t.unidad_id as string, [...(etiquetas.get(t.unidad_id as string) ?? []), t.etiqueta as string]);
  const lista: UnidadIngreso[] = (unidades.data ?? []).map((u) => ({ id: u.id as string, nombre: u.nombre as string, etiquetas: etiquetas.get(u.id as string) ?? [] }));
  const sinAsignar = lista.find((u) => u.nombre === UNIDAD_SIN_ASIGNAR);
  if (!sinAsignar) throw new Error(`Falta la unidad «${UNIDAD_SIN_ASIGNAR}» del libro (migración 0901).`);
  const porLinea = new Map<string, typeof pares>();
  for (const p of pares) porLinea.set(p.linea_id, [...(porLinea.get(p.linea_id) ?? []), p]);
  const elegibles = lineas.filter((l) =>
    puedeRegistrarIngreso({ monto: Number(l.monto), estado: l.estado, ingresoEn: l.ingreso_en }, (porLinea.get(l.id) ?? []).map((p) => p.clase)),
  );
  const deElegibles = elegibles.flatMap((l) => porLinea.get(l.id) ?? []);
  const cobroIds = [...new Set(deElegibles.map((p) => p.cobro_id).filter((x): x is string => !!x))];
  const ordenIds = [...new Set(deElegibles.map((p) => p.orden_id).filter((x): x is string => !!x))];
  const [cobros, ordenes] = await Promise.all([
    enTrozos<{ id: string; tienda: string | null }>(cobroIds, (t) => supabase.from("conc_fuentes_cobro").select("id, tienda").in("id", t)),
    enTrozos<{ id: string; tienda: string | null }>(ordenIds, (t) => supabase.from("conc_ordenes_fuente").select("id, tienda").in("id", t)),
  ]);
  const tiendaDe = new Map([...cobros, ...ordenes].map((x) => [x.id, x.tienda]));
  const nombreUnidad = new Map(lista.map((u) => [u.id, u.nombre]));
  const nombreCuenta = new Map((cuentas.data ?? []).map((c) => [c.id as string, c.nombre as string]));
  return elegibles.map((l) => {
    const partes = (porLinea.get(l.id) ?? []).map((p) => ({
      monto: Number(p.monto),
      unidadId: p.del_unidad_id,
      tienda: tiendaDe.get(p.cobro_id ?? p.orden_id ?? "") ?? null,
    }));
    return {
      lineaId: l.id,
      huella: l.huella,
      fecha: String(l.fecha).slice(0, 10),
      monto: Number(l.monto),
      cuentaId: l.cuenta_id,
      cuenta: nombreCuenta.get(l.cuenta_id) ?? "—",
      descripcion: l.descripcion,
      reparto: repartirIngreso(Number(l.monto), partes, lista, sinAsignar.id).map((r) => ({ ...r, tienda: nombreUnidad.get(r.unidadId) ?? "—" })),
    };
  });
}
