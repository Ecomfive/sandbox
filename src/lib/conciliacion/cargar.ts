// Lectura de la conciliación bancaria para las páginas (migración 0910). Solo lectura; los permisos los decide quien
// llama. Lo que se suma por cuenta y mes lo agrega Postgres (`conc_resumen_mensual`); el saldo según el libro sale del
// flujo por cuenta (`fin_flujo_mensual` + `fin_saldos_iniciales`, migración 0904) con `saldosPorCuenta`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { saldosPorCuenta, type FilaFlujo } from "@/lib/finanzas/flujo";
import { ETIQUETA_CLASE, FUENTE_VENTAS, type ClaseLinea, type EstadoLinea } from "./emparejar";
import { CLASES_INGRESO } from "./ingreso";

export interface ResumenMes {
  cuentaId: string;
  mes: string;
  lineas: number;
  conciliadas: number;
  sugeridas: number;
  pendientes: number;
  ignoradas: number;
  creditos: number;
  debitos: number;
  neto: number;
  sinConciliar: number;
  saldoFinal: number | null;
}

export interface CuentaConLineas {
  id: string;
  nombre: string;
  lineas: number;
}

export async function cargarResumen(supabase: SupabaseClient): Promise<{ error: string } | { resumen: ResumenMes[]; cuentas: CuentaConLineas[] }> {
  const [vista, cuentas] = await Promise.all([
    supabase.from("conc_resumen_mensual").select("*").order("mes"),
    supabase.from("fin_cuentas").select("id, nombre").order("nombre"),
  ]);
  if (vista.error) return { error: "Falta correr la migración 0910 (conciliación bancaria) en Supabase." };
  if (cuentas.error) return { error: "No se pudieron leer las cuentas del libro." };
  const resumen: ResumenMes[] = (vista.data ?? []).map((r) => ({
    cuentaId: r.cuenta_id as string,
    mes: String(r.mes).slice(0, 10),
    lineas: Number(r.lineas),
    conciliadas: Number(r.conciliadas),
    sugeridas: Number(r.sugeridas),
    pendientes: Number(r.pendientes),
    ignoradas: Number(r.ignoradas),
    creditos: Number(r.creditos),
    debitos: Number(r.debitos),
    neto: Number(r.neto),
    sinConciliar: Number(r.sin_conciliar),
    saldoFinal: r.saldo_final === null ? null : Number(r.saldo_final),
  }));
  const nombre = new Map((cuentas.data ?? []).map((c) => [c.id as string, c.nombre as string]));
  const porCuenta = new Map<string, number>();
  for (const r of resumen) porCuenta.set(r.cuentaId, (porCuenta.get(r.cuentaId) ?? 0) + r.lineas);
  return {
    resumen,
    cuentas: [...porCuenta]
      .map(([id, lineas]) => ({ id, nombre: nombre.get(id) ?? "—", lineas }))
      .sort((a, b) => b.lineas - a.lineas || a.nombre.localeCompare(b.nombre)),
  };
}

export const ETIQUETA_ESTADO: Record<EstadoLinea, string> = {
  pendiente: "Pendiente",
  sugerida: "Sugerida",
  conciliada: "Conciliada",
  ignorada: "Ignorada",
};

const ETIQUETA_EXCEL: Record<string, string> = { conciliado: "Conciliado", no_conciliado: "No conciliado", en_revision: "En revisión" };

/**
 * De dónde sale una propuesta, por las clases de sus partes: el libro, los cobros (Yappy, MiPOS, Servientrega), las
 * órdenes de las tiendas (`ven_ordenes`), lo que se cruzó a mano en el Excel de conciliación o Deliverys.
 */
export function etiquetaFuente(partes: { clase: string; orden_fuente?: string | null }[]): string {
  const clases = new Set(partes.map((p) => p.clase));
  if (clases.has("delivery")) return "Deliverys";
  if (clases.has("orden")) return partes.some((p) => p.clase === "orden" && p.orden_fuente === FUENTE_VENTAS) ? "Órdenes de las tiendas" : "Cruce del Excel";
  if (clases.has("cobro")) return "Cobros";
  if (clases.has("movimiento")) return "Libro";
  return "—";
}

export interface PropuestaVista {
  grupo: string;
  detalle: string;
  puntaje: number;
  metodo: string;
  estado: "sugerido" | "confirmado";
  auto: boolean;
  principal: boolean;
  partes: number;
  monto: number;
  comision: number;
  fuente: string;
}

/** Una línea del banco lista para la tabla (serializable). */
export interface FilaLinea {
  id: string;
  fecha: string;
  descripcion: string;
  referencia: string;
  clase: string;
  claseClave: ClaseLinea;
  monto: number;
  estado: string;
  estadoClave: EstadoLinea;
  motivo: string | null;
  /** La propuesta que se ve en la tabla: la confirmada, o la sugerida de más puntaje. */
  propuesta: string;
  puntaje: number | null;
  excel: string;
  /** De dónde sale la propuesta que se ve (o «—»). */
  fuente: string;
  /** «Registrar ingreso»: ya registrado, se puede registrar, o no aplica. */
  ingreso: "registrado" | "disponible" | null;
  propuestas: PropuestaVista[];
}

type Par = {
  grupo: string;
  detalle: string | null;
  puntaje: number;
  metodo: string;
  estado: string;
  auto: boolean;
  principal: boolean;
  monto: number | string;
  comision: number | string;
  clase?: string;
  orden_fuente?: string | null;
};

/** Las parejas (no descartadas) de una línea, juntas por propuesta, la confirmada primero y luego por puntaje. */
export function propuestasDe(pares: Par[]): PropuestaVista[] {
  const grupos = new Map<string, PropuestaVista>();
  const clases = new Map<string, { clase: string; orden_fuente?: string | null }[]>();
  for (const p of pares) if (p.clase) clases.set(p.grupo, [...(clases.get(p.grupo) ?? []), { clase: p.clase, orden_fuente: p.orden_fuente }]);
  for (const p of pares) {
    if (p.estado === "descartado") continue;
    const g = grupos.get(p.grupo) ?? {
      grupo: p.grupo,
      detalle: p.detalle ?? "—",
      puntaje: p.puntaje,
      metodo: p.metodo,
      estado: p.estado as PropuestaVista["estado"],
      auto: p.auto,
      principal: p.principal,
      partes: 0,
      monto: 0,
      comision: 0,
      fuente: etiquetaFuente(clases.get(p.grupo) ?? []),
    };
    g.partes += 1;
    g.monto = Math.round((g.monto + Number(p.monto)) * 100) / 100;
    g.comision = Math.round((g.comision + Number(p.comision)) * 100) / 100;
    grupos.set(p.grupo, g);
  }
  return [...grupos.values()].sort(
    (a, b) => Number(b.estado === "confirmado") - Number(a.estado === "confirmado") || Number(b.principal) - Number(a.principal) || b.puntaje - a.puntaje,
  );
}

interface LineaDb {
  id: string;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  clase: ClaseLinea;
  monto: number | string;
  estado: EstadoLinea;
  motivo: string | null;
  estado_excel: string | null;
  ingreso_en?: string | null;
  conc_pares: Par[] | null;
}

export async function cargarLineas(supabase: SupabaseClient, cuentaId: string, mes: string): Promise<{ error: string } | FilaLinea[]> {
  const fin = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const leer = (columnas: string) =>
    traerTodasConError<LineaDb>((desde, hasta) =>
      supabase
        .from("conc_lineas")
        .select(columnas)
        .eq("cuenta_id", cuentaId)
        .gte("fecha", mes)
        .lte("fecha", fin)
        .order("fecha")
        .order("orden")
        .order("id")
        .range(desde, hasta) as unknown as PromiseLike<{ data: LineaDb[] | null; error: unknown }>,
    );
  const base = "id, fecha, descripcion, referencia, clase, monto, estado, motivo, estado_excel";
  const pares = "grupo, detalle, puntaje, metodo, estado, auto, principal, monto, comision, clase, orden_fuente";
  let r = await leer(`${base}, ingreso_en, conc_pares(${pares})`);
  // Sin la migración 0916 todavía: sin «Registrar ingreso».
  if (r.error) r = await leer(`${base}, conc_pares(${pares})`);
  if (r.error) return { error: "No se pudieron leer las líneas del banco." };
  return (r.data ?? []).map((l) => {
    const propuestas = propuestasDe(l.conc_pares ?? []);
    // En la tabla se ve lo confirmado o la propuesta elegida; las alternativas solo en la ficha.
    const vista = propuestas.find((p) => p.estado === "confirmado" || p.principal);
    const confirmadas = (l.conc_pares ?? []).filter((p) => p.estado === "confirmado").map((p) => p.clase ?? "");
    const ingreso =
      l.ingreso_en === undefined
        ? null
        : l.ingreso_en
          ? "registrado"
          : Number(l.monto) > 0 && l.estado === "conciliada" && confirmadas.length && confirmadas.every((c) => CLASES_INGRESO.has(c))
            ? "disponible"
            : null;
    return {
      id: l.id,
      fecha: String(l.fecha).slice(0, 10),
      descripcion: l.descripcion,
      referencia: l.referencia ?? "",
      clase: ETIQUETA_CLASE[l.clase] ?? l.clase,
      claseClave: l.clase,
      monto: Number(l.monto),
      estado: ETIQUETA_ESTADO[l.estado],
      estadoClave: l.estado,
      motivo: l.motivo,
      propuesta: l.estado === "ignorada" ? (l.motivo ?? "—") : vista ? vista.detalle : "—",
      puntaje: l.estado === "ignorada" || !vista ? null : vista.puntaje,
      excel: l.estado_excel ? (ETIQUETA_EXCEL[l.estado_excel] ?? l.estado_excel) : "—",
      fuente: l.estado === "ignorada" || !vista ? "—" : vista.fuente,
      ingreso,
      propuestas,
    };
  });
}

export interface SaldoMes {
  /** Saldo final según el banco: el que trae el extracto, o el inicial cargado más lo que se movió en el banco. */
  banco: number;
  /** Saldo final según el libro (flujo por cuenta). */
  libro: number;
  /** Si la cuenta tiene un saldo inicial cargado en el Flujo de caja (sin él, los dos parten de cero). */
  conSaldoInicial: boolean;
  /** Si el saldo del banco salió del extracto. */
  delExtracto: boolean;
  netoLibro: number;
  /** Lo que se movió en el mes según el banco (créditos − débitos). */
  netoBanco: number;
}

/** Saldo según banco contra saldo según libro de una cuenta al cierre de un mes. */
export async function cargarSaldo(supabase: SupabaseClient, cuentaId: string, mes: string, resumen: ResumenMes | undefined): Promise<SaldoMes | null> {
  const [flujo, saldos] = await Promise.all([
    traerTodasConError<{ mes: string; cuenta_id: string | null; tipo_id: string | null; bloque: FilaFlujo["bloque"]; sentido: FilaFlujo["sentido"]; monto: number | string }>((desde, hasta) =>
      supabase.from("fin_flujo_mensual").select("mes, cuenta_id, tipo_id, bloque, sentido, monto").eq("cuenta_id", cuentaId).order("mes").order("tipo_id").order("unidad_id").range(desde, hasta),
    ),
    supabase.from("fin_saldos_iniciales").select("cuenta_id, fecha, monto").eq("cuenta_id", cuentaId),
  ]);
  if (flujo.error || saldos.error) return null;
  const filas: FilaFlujo[] = (flujo.data ?? []).map((f) => ({
    mes: String(f.mes).slice(0, 10),
    cuenta_id: f.cuenta_id,
    tipo: "",
    orden: 0,
    bloque: f.bloque,
    sentido: f.sentido,
    monto: Number(f.monto),
  }));
  const iniciales = (saldos.data ?? []).map((s) => ({ cuenta_id: s.cuenta_id as string, fecha: String(s.fecha).slice(0, 10), monto: Number(s.monto) }));
  const [cuenta] = saldosPorCuenta(filas, iniciales, [{ id: cuentaId, nombre: "", clase: "banco" }], [mes]).filter((c) => c.id === cuentaId);
  const inicial = cuenta?.inicial[mes] ?? 0;
  const libro = cuenta?.final[mes] ?? 0;
  const delExtracto = resumen?.saldoFinal !== null && resumen?.saldoFinal !== undefined;
  return {
    banco: delExtracto ? resumen!.saldoFinal! : Math.round((inicial + (resumen?.neto ?? 0)) * 100) / 100,
    libro,
    conSaldoInicial: iniciales.length > 0,
    delExtracto,
    netoLibro: Math.round((libro - inicial) * 100) / 100,
    netoBanco: Math.round((resumen?.neto ?? 0) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------------------------------------

export type Fuente = "yappy" | "mipos" | "servientrega";

export const ETIQUETA_FUENTE: Record<Fuente, string> = { yappy: "Yappy", mipos: "MiPOS", servientrega: "Servientrega" };

/** Un lote de liquidación: un día de Yappy o de MiPOS, una consignación de Servientrega. */
export interface FilaLote {
  id: string;
  fuente: Fuente;
  lote: string;
  fecha: string;
  cobros: number;
  anuladas: number;
  bruto: number;
  comision: number;
  depositado: number;
  estado: "Depositado" | "Parcial" | "Sin depositar";
  /** Dónde llegó: «02/09 · BANCO GENERAL · 1.217,06». */
  deposito: string;
  tiendas: string;
}

interface CobroDb {
  id: string;
  fuente: Fuente;
  fecha: string;
  lote: string | null;
  tienda: string | null;
  monto_bruto: number | string;
  anulada: boolean;
}

interface ParCobroDb {
  cobro_id: string;
  monto: number | string;
  comision: number | string;
  conc_lineas: { id: string; fecha: string; monto: number | string; cuenta_id: string; descripcion: string } | { id: string; fecha: string; monto: number | string; cuenta_id: string; descripcion: string }[] | null;
}

/** El lote de un cobro: Servientrega por consignación; Yappy y MiPOS por día. */
export const loteDe = (c: { fuente: Fuente; fecha: string; lote: string | null }) =>
  c.fuente === "servientrega" ? (c.lote ?? "Sin consignación") : c.fecha;

/**
 * Lo liquidado por cada fuente contra lo que llegó al banco. La comisión de Yappy no se descuenta del depósito: el
 * banco la cobra aparte («COMISION TRANSACCIONES YAPPY» del mismo día y cuenta), y se suma aquí desde esas líneas.
 */
export async function cargarCobros(
  supabase: SupabaseClient,
  desde: string,
  hasta: string,
): Promise<{ error: string } | { lotes: FilaLote[] }> {
  const [cobros, pares, cuentas] = await Promise.all([
    traerTodasConError<CobroDb>((a, b) =>
      supabase.from("conc_fuentes_cobro").select("id, fuente, fecha, lote, tienda, monto_bruto, anulada").gte("fecha", desde).lte("fecha", hasta).order("fecha").order("id").range(a, b),
    ),
    traerTodasConError<ParCobroDb>((a, b) =>
      supabase
        .from("conc_pares")
        .select("cobro_id, monto, comision, conc_lineas(id, fecha, monto, cuenta_id, descripcion)")
        .eq("estado", "confirmado")
        .eq("clase", "cobro")
        .order("id")
        .range(a, b) as unknown as PromiseLike<{ data: ParCobroDb[] | null; error: unknown }>,
    ),
    supabase.from("fin_cuentas").select("id, nombre"),
  ]);
  if (cobros.error || pares.error) return { error: "Falta correr la migración 0910 (conciliación bancaria) en Supabase." };
  const nombreCuenta = new Map((cuentas.data ?? []).map((c) => [c.id as string, c.nombre as string]));
  const parDe = new Map<string, ParCobroDb>();
  for (const p of pares.data ?? []) parDe.set(p.cobro_id, p);

  const lotes = new Map<string, FilaLote & { lineas: Map<string, { fecha: string; cuenta: string; monto: number }>; tiendasSet: Set<string> }>();
  for (const c of cobros.data ?? []) {
    const lote = loteDe({ fuente: c.fuente, fecha: String(c.fecha).slice(0, 10), lote: c.lote });
    const clave = `${c.fuente}|${lote}`;
    const x =
      lotes.get(clave) ??
      {
        id: clave,
        fuente: c.fuente,
        lote,
        fecha: String(c.fecha).slice(0, 10),
        cobros: 0,
        anuladas: 0,
        bruto: 0,
        comision: 0,
        depositado: 0,
        estado: "Sin depositar" as const,
        deposito: "—",
        tiendas: "",
        lineas: new Map(),
        tiendasSet: new Set<string>(),
      };
    if (String(c.fecha).slice(0, 10) > x.fecha) x.fecha = String(c.fecha).slice(0, 10);
    if (c.anulada) {
      x.anuladas += 1;
      lotes.set(clave, x);
      continue;
    }
    x.cobros += 1;
    x.bruto += Number(c.monto_bruto);
    if (c.tienda) x.tiendasSet.add(c.tienda);
    const par = parDe.get(c.id);
    const linea = par ? (Array.isArray(par.conc_lineas) ? par.conc_lineas[0] : par.conc_lineas) : null;
    if (par && linea) {
      x.depositado += Number(par.monto);
      x.comision += Number(par.comision);
      x.lineas.set(linea.id, { fecha: String(linea.fecha).slice(0, 10), cuenta: nombreCuenta.get(linea.cuenta_id) ?? "—", monto: Number(linea.monto) });
    }
    lotes.set(clave, x);
  }

  // Comisión de Yappy: la línea «COMISION TRANSACCIONES YAPPY» del día del depósito, en la misma cuenta.
  const depositosYappy = [...lotes.values()].filter((l) => l.fuente === "yappy").flatMap((l) => [...l.lineas.values()].map((d) => ({ l, d })));
  if (depositosYappy.length) {
    const fechas = [...new Set(depositosYappy.map((x) => x.d.fecha))];
    const { data } = await supabase.from("conc_lineas").select("fecha, cuenta_id, monto").eq("clase", "comision_yappy").in("fecha", fechas.slice(0, 400));
    const comisionDe = new Map<string, number>();
    for (const c of data ?? []) {
      const k = `${String(c.fecha).slice(0, 10)}|${nombreCuenta.get(c.cuenta_id as string) ?? "—"}`;
      comisionDe.set(k, (comisionDe.get(k) ?? 0) + Math.abs(Number(c.monto)));
    }
    for (const { l, d } of depositosYappy) {
      const k = `${d.fecha}|${d.cuenta}`;
      l.comision += comisionDe.get(k) ?? 0;
      comisionDe.delete(k);
    }
  }

  const fecha = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
  const usd = (n: number) => n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    lotes: [...lotes.values()].map(({ lineas, tiendasSet, ...l }) => {
      const r = (n: number) => Math.round(n * 100) / 100;
      const bruto = r(l.bruto);
      const depositado = r(l.depositado);
      return {
        ...l,
        bruto,
        depositado,
        comision: r(l.comision),
        estado: depositado <= 0 ? "Sin depositar" : Math.abs(depositado + r(l.fuente === "mipos" ? l.comision : 0) - bruto) <= 0.011 ? "Depositado" : "Parcial",
        deposito: [...lineas.values()].map((d) => `${fecha(d.fecha)} · ${d.cuenta} · ${usd(d.monto)}`).join(" / ") || "—",
        tiendas: [...tiendasSet].sort().join(", "),
      };
    }),
  };
}
