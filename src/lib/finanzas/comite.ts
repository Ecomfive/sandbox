// Portal AF4 360° › Panel financiero › Comité de dirección (mejora 5). Lógica pura: los 7 indicadores que sigue el comité
// mensual (con su meta a 6 meses y el valor de partida, guardados en `fin_config`, clave `comite`), el semáforo, cómo se
// calcula cada serie mensual a partir de lo que ya tiene el portal y la validación del acta. La lectura vive en
// `cargar-comite.ts`. Prueba en `comite.test.ts`.

import type { Eerr, PorMes } from "./eerr";
import { tasasResolucion, ventasEsperadas, pautaDe, type FilaTiendaMes } from "./pauta";

const r2 = (v: number) => Math.round(v * 100) / 100;

export const CLAVE_COMITE = "comite";

export type ClaveIndicador = "margen_ebitda" | "pauta_ventas" | "tasa_entrega" | "dio" | "costo_financiero" | "pedidos_sin_estado" | "cierre_dia";

/** «minimo»: cumple con valor ≥ meta. «maximo»: cumple con valor ≤ meta (`estricto`: < meta). */
export type SentidoMeta = "minimo" | "maximo";

export type FormatoIndicador = "porcentaje" | "dias" | "dia";

export interface DefIndicador {
  clave: ClaveIndicador;
  etiqueta: string;
  /** Cómo se lee la meta («≥ 28 %»). */
  sentido: SentidoMeta;
  estricto?: boolean;
  meta: number;
  formato: FormatoIndicador;
  /** De dónde sale, en una línea. */
  fuente: string;
  href: string;
  min: number;
  max: number;
  /** Si la partida (valor hoy) se puede escribir. */
  conPartida: boolean;
}

export const INDICADORES: DefIndicador[] = [
  {
    clave: "margen_ebitda",
    etiqueta: "Margen EBITDA ajustado",
    sentido: "minimo",
    meta: 28,
    formato: "porcentaje",
    fuente: "Estado de resultados consolidado, sin intercompañía ni retiros de socios ÷ ingresos netos",
    href: "/estado-resultados",
    min: -100,
    max: 100,
    conPartida: true,
  },
  {
    clave: "pauta_ventas",
    etiqueta: "Pauta ÷ ventas de tiendas propias",
    sentido: "maximo",
    meta: 22,
    formato: "porcentaje",
    fuente: "Mayor entre marketing del libro y Meta importado ÷ ventas esperadas de Ventas por tienda",
    href: "/rentabilidad/marketing",
    min: 0,
    max: 200,
    conPartida: true,
  },
  {
    clave: "tasa_entrega",
    etiqueta: "Tasa de entrega de tiendas propias",
    sentido: "minimo",
    meta: 60,
    formato: "porcentaje",
    fuente: "Entregadas ÷ enviadas de Ventas por tienda",
    href: "/rentabilidad/zonas",
    min: 0,
    max: 100,
    conPartida: true,
  },
  {
    clave: "dio",
    etiqueta: "Días de inventario Panamá",
    sentido: "maximo",
    meta: 130,
    formato: "dias",
    fuente: "Inventario valorizado al cierre ÷ costo de lo vendido por día (90 días)",
    href: "/rentabilidad/inventario",
    min: 1,
    max: 1000,
    conPartida: true,
  },
  {
    clave: "costo_financiero",
    etiqueta: "Costo financiero mezclado",
    sentido: "maximo",
    meta: 30,
    formato: "porcentaje",
    fuente: "Intereses y costos financieros del libro, anualizados ÷ deuda promedio de Tesorería",
    href: "/tesoreria/deuda",
    min: 0,
    max: 300,
    conPartida: true,
  },
  {
    clave: "pedidos_sin_estado",
    etiqueta: "Pedidos sin estado",
    sentido: "maximo",
    estricto: true,
    meta: 5,
    formato: "porcentaje",
    fuente: "Enviados hace más de 10 días sin entregado, devuelto ni cancelado ÷ enviados (Ventas por tienda)",
    href: "/ventas-tiendas",
    min: 0,
    max: 100,
    conPartida: true,
  },
  {
    clave: "cierre_dia",
    etiqueta: "Cierre mensual publicado",
    sentido: "maximo",
    meta: 10,
    formato: "dia",
    fuente: "Cierre de mes: día del mes siguiente en que quedó cerrado",
    href: "/cierre-mes",
    min: 1,
    max: 28,
    conPartida: false,
  },
];

export const defIndicador = (c: ClaveIndicador) => INDICADORES.find((d) => d.clave === c)!;

// ---------------------------------------------------------------------------------------------------------------------
// Configuración (metas, partida y tiendas propias)
// ---------------------------------------------------------------------------------------------------------------------

export interface ConfigComite {
  metas: Record<ClaveIndicador, number>;
  /** El valor de partida (cuando arrancó el plan a 6 meses); null = sin escribir. */
  partida: Record<ClaveIndicador, number | null>;
  /** Las tiendas que cuentan como propias; null = las de por defecto (`tiendasPropiasPredeterminadas`). */
  tiendasPropias: string[] | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enRango = (n: unknown, d: DefIndicador): n is number => typeof n === "number" && Number.isFinite(n) && n >= d.min && n <= d.max;
const aNumero = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v);

export function configPredeterminada(): ConfigComite {
  return {
    metas: Object.fromEntries(INDICADORES.map((d) => [d.clave, d.meta])) as Record<ClaveIndicador, number>,
    partida: Object.fromEntries(INDICADORES.map((d) => [d.clave, null])) as Record<ClaveIndicador, number | null>,
    tiendasPropias: null,
  };
}

/** Lo guardado (jsonb): lo que falte o se salga de rango queda por defecto. */
export function leerConfigComite(v: unknown): ConfigComite {
  const c = configPredeterminada();
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const metas = o.metas && typeof o.metas === "object" ? (o.metas as Record<string, unknown>) : {};
  const partida = o.partida && typeof o.partida === "object" ? (o.partida as Record<string, unknown>) : {};
  for (const d of INDICADORES) {
    const m = aNumero(metas[d.clave]);
    if (enRango(m, d)) c.metas[d.clave] = m;
    const p = aNumero(partida[d.clave]);
    if (d.conPartida && enRango(p, d)) c.partida[d.clave] = p;
  }
  if (Array.isArray(o.tiendas_propias)) c.tiendasPropias = o.tiendas_propias.filter((x): x is string => typeof x === "string" && UUID.test(x));
  return c;
}

export const configAGuardar = (c: ConfigComite) => ({ metas: c.metas, partida: c.partida, tiendas_propias: c.tiendasPropias });

const leerTexto = (t: unknown): number | null | "invalido" => {
  const s = String(t ?? "").replace(/\s/g, "").replace(",", ".").replace(/%$/, "");
  if (s === "") return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : "invalido";
};

/**
 * Lo que llega del formulario: `meta:<clave>` (obligatoria), `partida:<clave>` (vacía = sin partida) y, si viene
 * `tiendas_elegidas=1`, las tiendas marcadas en `tienda` (solo de la lista dada).
 */
export function validarConfigComite(
  leer: (campo: string) => unknown,
  leerTodas: (campo: string) => unknown[],
  tiendasValidas: string[],
): { config: ConfigComite } | { error: string } {
  const c = configPredeterminada();
  for (const d of INDICADORES) {
    const m = leerTexto(leer(`meta:${d.clave}`));
    if (m === null || m === "invalido" || !enRango(m, d)) return { error: `${d.etiqueta}: la meta es un número de ${d.min} a ${d.max}.` };
    c.metas[d.clave] = m;
    if (!d.conPartida) continue;
    const p = leerTexto(leer(`partida:${d.clave}`));
    if (p === "invalido" || (p !== null && !enRango(p, d))) return { error: `${d.etiqueta}: el valor de partida es un número de ${d.min} a ${d.max}, o vacío.` };
    c.partida[d.clave] = p;
  }
  if (leer("tiendas_elegidas") === "1") {
    const validas = new Set(tiendasValidas);
    const elegidas = [...new Set(leerTodas("tienda").map(String))].filter((id) => validas.has(id));
    if (!elegidas.length) return { error: "Elegí al menos una tienda propia." };
    c.tiendasPropias = elegidas;
  }
  return { config: c };
}

// ---------------------------------------------------------------------------------------------------------------------
// Semáforo
// ---------------------------------------------------------------------------------------------------------------------

export type Semaforo = "cumple" | "mejora" | "lejos" | "sin_datos";

export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  cumple: "En meta",
  mejora: "Mejorando",
  lejos: "Fuera de meta",
  sin_datos: "Sin datos",
};

export function cumpleMeta(d: Pick<DefIndicador, "sentido" | "estricto">, valor: number, meta: number): boolean {
  if (d.sentido === "minimo") return valor >= meta;
  return d.estricto ? valor < meta : valor <= meta;
}

/** Cuánto más cerca está de la meta que la referencia (positivo = mejor). */
const avance = (d: Pick<DefIndicador, "sentido">, valor: number, referencia: number) => (d.sentido === "minimo" ? valor - referencia : referencia - valor);

/** Margen de «casi en meta» cuando no hay partida: 10 % de la meta (en sus unidades). */
export const TOLERANCIA_SIN_PARTIDA = 0.1;

/**
 * En meta (verde); si no, mejorando (ámbar) cuando está mejor que la partida o, sin partida, a menos del 10 % de la meta;
 * si no, fuera de meta (rojo). Sin valor, sin datos.
 */
export function semaforo(d: Pick<DefIndicador, "sentido" | "estricto">, valor: number | null, meta: number, partida: number | null): Semaforo {
  if (valor === null || !Number.isFinite(valor)) return "sin_datos";
  if (cumpleMeta(d, valor, meta)) return "cumple";
  if (partida !== null) return avance(d, valor, partida) > 0 ? "mejora" : "lejos";
  return Math.abs(valor - meta) <= Math.abs(meta) * TOLERANCIA_SIN_PARTIDA ? "mejora" : "lejos";
}

export const TONO_SEMAFORO: Record<Semaforo, "success" | "warning" | "destructive" | "neutral"> = {
  cumple: "success",
  mejora: "warning",
  lejos: "destructive",
  sin_datos: "neutral",
};

/** Cuánto del camino entre la partida y la meta ya se recorrió (0–100+; null sin partida o sin valor). */
export function progreso(d: Pick<DefIndicador, "sentido">, valor: number | null, meta: number, partida: number | null): number | null {
  if (valor === null || partida === null) return null;
  const total = avance(d, meta, partida);
  if (Math.abs(total) < 1e-9) return null;
  return (avance(d, valor, partida) / total) * 100;
}

// ---------------------------------------------------------------------------------------------------------------------
// Series de cada indicador
// ---------------------------------------------------------------------------------------------------------------------

export interface PuntoSerie {
  periodo: string;
  valor: number | null;
}

/** Un tipo del libro que es un retiro de socios (no es un gasto del negocio). */
export const esRetiroSocios = (tipo: string) => /dividendo|retiros?\s+(de\s+)?socios?|retiro\s+socio/i.test(tipo);

/**
 * El EBITDA ajustado por mes: el EBITDA sin los retiros de socios que se hayan clasificado en secciones operativas (en
 * «Otros» ya no tocan el EBITDA). Lo intercompañía lo saca quien arma el EERR (`repartirEerr` con `sinIntercompania`).
 */
export function ebitdaAjustado(e: Eerr): PorMes {
  const out: PorMes = { ...e.ebitda };
  const operativas = new Set(["ingresos", "costo_ventas", "administracion", "marketing"]);
  for (const s of e.secciones) {
    if (!operativas.has(s.seccion)) continue;
    for (const t of s.tipos) {
      if (!esRetiroSocios(t.tipo)) continue;
      for (const m of e.meses) out[m] = (out[m] ?? 0) - t.meses[m] * t.signo;
    }
  }
  return out;
}

/** Margen EBITDA ajustado (%) por mes; null sin ingresos. */
export function serieMargenEbitda(e: Eerr, meses: string[]): PuntoSerie[] {
  const aj = ebitdaAjustado(e);
  return meses.map((m) => {
    const ing = e.ingresosNetos[m] ?? 0;
    return { periodo: m, valor: ing > 0 ? ((aj[m] ?? 0) / ing) * 100 : null };
  });
}

/** Pauta ÷ ventas esperadas (%) de las tiendas propias por mes. */
export function seriePauta(filas: FilaTiendaMes[], meses: string[], propias: string[]): PuntoSerie[] {
  const set = new Set(propias);
  const tasas = tasasResolucion(filas.filter((f) => set.has(f.unidadId)));
  const serie = meses.map((m) => {
    let pauta = 0;
    let ventas = 0;
    for (const f of filas) {
      if (f.periodo !== m || !set.has(f.unidadId)) continue;
      pauta += pautaDe(f);
      ventas += ventasEsperadas(f, tasas.get(f.unidadId));
    }
    return { periodo: m, valor: ventas > 0 ? (pauta / ventas) * 100 : null };
  });
  return descartarPautaIncompleta(serie);
}

/**
 * Un mes con pauta muy por debajo de lo habitual casi siempre es pauta que todavía no se cargó en el libro (no un ahorro
 * real): se muestra «Sin datos» en vez de un verde engañoso. Regla: menos de un 25 % de la mediana de los 3 meses
 * anteriores con dato, cuando esa mediana pasa de 5 %.
 */
export function descartarPautaIncompleta(serie: PuntoSerie[]): PuntoSerie[] {
  const previos: number[] = [];
  return serie.map((p) => {
    const ult = previos.slice(-3).sort((a, b) => a - b);
    const mediana = ult.length ? ult[Math.floor(ult.length / 2)] : null;
    const incompleto = p.valor !== null && mediana !== null && mediana > 5 && p.valor < mediana * 0.25;
    if (p.valor !== null && !incompleto) previos.push(p.valor);
    return incompleto ? { periodo: p.periodo, valor: null } : p;
  });
}

/** Entregadas ÷ enviadas (%) de las tiendas propias por mes. */
export function serieEntrega(filas: FilaTiendaMes[], meses: string[], propias: string[]): PuntoSerie[] {
  const set = new Set(propias);
  return meses.map((m) => {
    let e = 0;
    let env = 0;
    for (const f of filas) {
      if (f.periodo !== m || !set.has(f.unidadId)) continue;
      e += f.entregadas;
      env += f.enviadas;
    }
    return { periodo: m, valor: env > 0 ? (e / env) * 100 : null };
  });
}

/** Pedidos sin estado (%) por mes de la orden, de todas las tiendas: sin estado ÷ enviados hace más de 10 días. */
export function serieSinEstado(filas: FilaTiendaMes[], meses: string[]): { serie: PuntoSerie[]; sinEstado: Record<string, number> } {
  const sinEstado: Record<string, number> = {};
  const serie = meses.map((m) => {
    let s = 0;
    let el = 0;
    for (const f of filas) {
      if (f.periodo !== m) continue;
      s += f.sinEstado;
      el += f.elegiblesEstado;
    }
    sinEstado[m] = s;
    return { periodo: m, valor: el > 0 ? (s / el) * 100 : null };
  });
  return { serie, sinEstado };
}

const diasMes = (p: string) => {
  const [a, m] = p.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};
const mesMenos = (p: string, n: number) => {
  const [a, m] = p.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 - n, 1)).toISOString().slice(0, 10);
};

/** Ventana del costo de lo vendido para el DIO: el mes y los dos anteriores (unos 90 días). */
export const MESES_DIO = 3;

/**
 * Días de inventario por mes: el inventario al cierre del mes ÷ el costo de lo vendido por día de los 3 meses que terminan
 * en él (mercancía + otros costos de venta). null sin inventario o sin costo.
 */
export function serieDio(meses: string[], inventario: Record<string, number | null>, costoMes: Record<string, number>): PuntoSerie[] {
  return meses.map((m) => {
    const inv = inventario[m];
    if (inv === null || inv === undefined || inv <= 0) return { periodo: m, valor: null };
    let costo = 0;
    let dias = 0;
    for (let k = 0; k < MESES_DIO; k++) {
      const p = mesMenos(m, k);
      if (costoMes[p] === undefined) continue;
      costo += costoMes[p];
      dias += diasMes(p);
    }
    return { periodo: m, valor: costo > 0 && dias > 0 ? inv / (costo / dias) : null };
  });
}

/** Un tipo del libro que es un costo financiero (intereses, FECI, financiamiento); no la amortización del capital. */
export const esCostoFinanciero = (tipo: string) =>
  /inter[eé]s|feci|financ/i.test(tipo) && !/ganad|amortiz|intertienda|compensaci|diferencia\s+de\s+cambio/i.test(tipo);

/** Los intereses y costos financieros del EERR por mes (en positivo). */
export function interesesPorMes(e: Eerr): PorMes {
  const out: PorMes = Object.fromEntries(e.meses.map((m) => [m, 0]));
  for (const s of e.secciones) {
    for (const t of s.tipos) {
      if (!esCostoFinanciero(t.tipo) || t.signo > 0) continue;
      for (const m of e.meses) out[m] += t.meses[m];
    }
  }
  return out;
}

export interface CostoFinanciero {
  /** % anual (null sin datos). */
  valor: number | null;
  /** Qué falta para calcularlo. */
  falta: string | null;
  intereses: number;
  deudaPromedio: number;
}

const SIN_DEUDA = "Faltan los préstamos y líneas de crédito en Tesorería › Deuda";
const SIN_INTERESES = "Faltan los intereses en el libro (tipos de Finanzas: intereses, FECI, financiamiento)";

/**
 * Costo financiero mezclado de un tramo de meses: intereses del tramo × 12 / meses ÷ deuda promedio (saldo al cierre del
 * mes anterior al tramo y de cada mes). `deuda` null = Tesorería sin la migración 0932.
 */
export function costoFinanciero(meses: string[], intereses: PorMes, deuda: Record<string, number> | null): CostoFinanciero {
  if (!meses.length) return { valor: null, falta: SIN_INTERESES, intereses: 0, deudaPromedio: 0 };
  if (!deuda) return { valor: null, falta: SIN_DEUDA, intereses: 0, deudaPromedio: 0 };
  const cortes = [mesMenos(meses[0], 1), ...meses].map((m) => deuda[m]).filter((v): v is number => typeof v === "number");
  const promedio = cortes.length ? cortes.reduce((a, b) => a + b, 0) / cortes.length : 0;
  const total = meses.reduce((a, m) => a + (intereses[m] ?? 0), 0);
  if (promedio <= 0) return { valor: null, falta: SIN_DEUDA, intereses: r2(total), deudaPromedio: 0 };
  if (total <= 0) return { valor: null, falta: SIN_INTERESES, intereses: 0, deudaPromedio: r2(promedio) };
  return { valor: ((total * (12 / meses.length)) / promedio) * 100, falta: null, intereses: r2(total), deudaPromedio: r2(promedio) };
}

/** La serie mensual del costo financiero (cada mes solo). */
export const serieCostoFinanciero = (meses: string[], intereses: PorMes, deuda: Record<string, number> | null): PuntoSerie[] =>
  meses.map((m) => ({ periodo: m, valor: costoFinanciero([m], intereses, deuda).valor }));

/** Tasa contractual mezclada (Σ saldo × tasa ÷ Σ saldo, en %), como referencia; null sin saldos. */
export function tasaContractual(lineas: { saldo: number; tasaAnual: number | null }[]): number | null {
  const con = lineas.filter((l) => l.saldo > 0 && l.tasaAnual !== null);
  const saldo = con.reduce((a, l) => a + l.saldo, 0);
  return saldo > 0 ? (con.reduce((a, l) => a + l.saldo * (l.tasaAnual ?? 0), 0) / saldo) * 100 : null;
}

/** El primer día del mes siguiente. */
export const mesSiguiente = (p: string) => mesMenos(p, -1);

/**
 * El día del mes siguiente en que el mes quedó cerrado (1 = el día 1; si se cerró dos meses después, sigue contando:
 * 35 = el 5 del segundo mes). null si no está cerrado.
 */
export function diaDeCierre(periodo: string, cerradoEn: string | null): number | null {
  if (!cerradoEn) return null;
  const inicio = Date.parse(`${mesSiguiente(periodo)}T00:00:00Z`);
  const dia = Date.parse(`${cerradoEn.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(inicio) || !Number.isFinite(dia)) return null;
  return Math.max(1, Math.round((dia - inicio) / 86_400_000) + 1);
}

/** El estado del cierre de un mes contra el día límite: a tiempo, tarde, pendiente (todavía hay plazo) o vencido. */
export type EstadoCierre = "a_tiempo" | "tarde" | "pendiente" | "vencido";

export function estadoCierre(periodo: string, cerradoEn: string | null, diaLimite: number, hoy: string): EstadoCierre {
  const dia = diaDeCierre(periodo, cerradoEn);
  if (dia !== null) return dia <= diaLimite ? "a_tiempo" : "tarde";
  const hoyDia = diaDeCierre(periodo, hoy);
  return hoyDia !== null && hoyDia <= diaLimite ? "pendiente" : "vencido";
}

/** El último valor con dato de una serie (y su mes). */
export function ultimoValor(serie: PuntoSerie[], hasta: string): PuntoSerie | null {
  for (let i = serie.length - 1; i >= 0; i--) if (serie[i].periodo <= hasta && serie[i].valor !== null) return serie[i];
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Acta del comité
// ---------------------------------------------------------------------------------------------------------------------

export const ESTADOS_DECISION = ["pendiente", "hecha"] as const;
export type EstadoDecision = (typeof ESTADOS_DECISION)[number];
export const esEstadoDecision = (v: unknown): v is EstadoDecision => typeof v === "string" && (ESTADOS_DECISION as readonly string[]).includes(v);

export interface Decision {
  id: string;
  periodo: string;
  decision: string;
  responsable: string | null;
  fechaCompromiso: string | null;
  estado: EstadoDecision;
  seguimiento: string | null;
  actualizadoEn: string;
}

/** Texto simple de una persona: sin caracteres de control y con los espacios ordenados. */
export function limpiarTexto(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (s: string) => FECHA.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Una decisión nueva del formulario. */
export function validarDecision(leer: (campo: string) => unknown): { error: string } | { periodo: string; decision: string; responsable: string | null; fechaCompromiso: string | null } {
  const periodo = String(leer("periodo") ?? "");
  if (!/^\d{4}-\d{2}-01$/.test(periodo) || !fechaValida(periodo)) return { error: "El mes del comité no es válido." };
  const decision = limpiarTexto(leer("decision"), 1000);
  if (!decision) return { error: "Escribí la decisión." };
  const responsable = limpiarTexto(leer("responsable"), 120) || null;
  const f = String(leer("fecha_compromiso") ?? "").trim();
  if (f && !fechaValida(f)) return { error: "La fecha comprometida no es válida." };
  return { periodo, decision, responsable, fechaCompromiso: f || null };
}

/** Las decisiones que se ven en el comité de un mes: las de ese mes y las pendientes de comités anteriores (seguimiento). */
export function decisionesDelComite(todas: Decision[], periodo: string): { delMes: Decision[]; seguimiento: Decision[] } {
  return {
    delMes: todas.filter((d) => d.periodo === periodo),
    seguimiento: todas.filter((d) => d.periodo < periodo && d.estado === "pendiente").sort((a, b) => a.periodo.localeCompare(b.periodo)),
  };
}
