// Recompra, cohortes, LTV, CAC y ROAS (Clientes y marketing). Lógica pura: sirve en las páginas, en la descarga y en las
// pruebas (`metricas.test.ts`). Los conteos y sumas salen de Postgres (migración 0920: `cli_resumen_mensual`,
// `cli_cohortes`, `cli_curva_cohortes`, `cli_frecuencia`, `cli_marketing_mensual`); aquí solo se juntan y se dividen.
//
// «Ámbito»: `todas` o el id de una tienda. En una tienda, el cliente nace con su primera entrega en esa tienda.

export const TODAS = "todas";

/** Debajo de esto, LTV/CAC va en rojo: cada cliente no devuelve tres veces lo que costó traerlo. */
export const LTV_CAC_MINIMO = 3;
/** Debajo de esto, el ROAS de margen va en rojo: el margen no paga la publicidad. */
export const POAS_MINIMO = 1;
/** Días de las ventanas de recompra y de LTV. */
export const DIAS_RECOMPRA = [30, 60, 90, 180] as const;
export const DIAS_LTV = [90, 180, 365] as const;
/** Cuántas cohortes maduras recientes se usan como referencia cuando las del período todavía no maduran. */
export const COHORTES_REFERENCIA = 3;

export type DiasRecompra = (typeof DIAS_RECOMPRA)[number];
export type DiasLtv = (typeof DIAS_LTV)[number];

// ---------------------------------------------------------------------------------------------
// Plataformas de marketing
// ---------------------------------------------------------------------------------------------

export type Plataforma = "meta" | "tiktok" | "google" | "otros" | "offline";

export const PLATAFORMAS: { clave: Plataforma; etiqueta: string }[] = [
  { clave: "meta", etiqueta: "Meta" },
  { clave: "tiktok", etiqueta: "TikTok" },
  { clave: "google", etiqueta: "Google Ads" },
  { clave: "otros", etiqueta: "Otras online" },
  { clave: "offline", etiqueta: "Offline" },
];

export const ETIQUETA_PLATAFORMA = Object.fromEntries(PLATAFORMAS.map((p) => [p.clave, p.etiqueta])) as Record<Plataforma, string>;

/** La plataforma de un tipo de marketing del libro. La misma regla vive en la vista `cli_marketing_mensual` (0133). */
export function plataformaDeTipo(nombreTipo: string): Plataforma {
  const n = nombreTipo.toLowerCase();
  if (n.includes("facebook") || n.includes("meta") || n.includes("instagram")) return "meta";
  if (n.includes("tiktok")) return "tiktok";
  if (n.includes("google")) return "google";
  if (n.includes("offline")) return "offline";
  return "otros";
}

// ---------------------------------------------------------------------------------------------
// Entradas (filas de las funciones SQL)
// ---------------------------------------------------------------------------------------------

export interface ResumenMes {
  ambito: string;
  periodo: string;
  ordenes: number;
  entregadas: number;
  ordenes_sin_cliente: number;
  compradores: number;
  nuevos: number;
  recurrentes: number;
  ventas: number;
  costo_mercancia: number;
  costo_envio: number;
  margen: number;
}

export interface Cohorte {
  ambito: string;
  cohorte: string;
  clientes: number;
  maduros_30: number;
  maduros_60: number;
  maduros_90: number;
  maduros_180: number;
  maduros_365: number;
  recompra_30: number;
  recompra_60: number;
  recompra_90: number;
  recompra_180: number;
  ltv_90: number;
  ltv_180: number;
  ltv_365: number;
  entregadas: number;
  margen: number;
  dias_segunda: number;
  con_segunda: number;
}

export interface PuntoCurva {
  ambito: string;
  cohorte: string;
  mes: number;
  activos: number;
  margen: number;
  completo: boolean;
}

export interface FilaFrecuencia {
  ambito: string;
  /** 1 a 5 (5 = cinco o más). */
  entregas: number;
  clientes: number;
  dias: number;
  intervalos: number;
}

export interface GastoMarketing {
  periodo: string;
  unidad_id: string;
  plataforma: Plataforma;
  gasto: number;
}

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

export const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

const CAMPOS_COHORTE = [
  "clientes",
  "maduros_30",
  "maduros_60",
  "maduros_90",
  "maduros_180",
  "maduros_365",
  "recompra_30",
  "recompra_60",
  "recompra_90",
  "recompra_180",
  "ltv_90",
  "ltv_180",
  "ltv_365",
  "entregadas",
  "margen",
  "dias_segunda",
  "con_segunda",
] as const;

/** Suma varias cohortes (de varios meses) en una. */
export function sumarCohortes(cs: Cohorte[], ambito = TODAS, cohorte = ""): Cohorte {
  const t = Object.fromEntries(CAMPOS_COHORTE.map((c) => [c, 0])) as Record<(typeof CAMPOS_COHORTE)[number], number>;
  for (const c of cs) for (const k of CAMPOS_COHORTE) t[k] += c[k];
  return { ambito, cohorte, ...t, ltv_90: r2(t.ltv_90), ltv_180: r2(t.ltv_180), ltv_365: r2(t.ltv_365), margen: r2(t.margen) };
}

/** Parte de los clientes maduros a N días que volvió a recibir dentro de esos N días; null si ninguno maduró. */
export const recompra = (c: Cohorte, dias: DiasRecompra): number | null => div(c[`recompra_${dias}`], c[`maduros_${dias}`]);

/** Margen de contribución promedio por cliente en sus primeros N días; null si ninguno maduró. */
export const ltv = (c: Cohorte, dias: DiasLtv): number | null => div(c[`ltv_${dias}`], c[`maduros_${dias}`]);

const maduros = (c: Cohorte, dias: number) => c[`maduros_${dias}` as keyof Cohorte] as number;

export interface Referencia {
  cohorte: Cohorte;
  /** true si las cohortes del período todavía no maduran y se usan las últimas que sí. */
  estimado: boolean;
  /** Meses de las cohortes usadas. */
  meses: string[];
}

/**
 * Las cohortes que sirven para una métrica a N días en un período: las del período con clientes maduros; si ninguna
 * maduró todavía, las `COHORTES_REFERENCIA` más recientes que sí (anteriores al período), marcadas como estimado.
 */
export function referencia(cohortes: Cohorte[], meses: string[], dias: number): Referencia | null {
  const delPeriodo = cohortes.filter((c) => meses.includes(c.cohorte) && maduros(c, dias) > 0);
  if (delPeriodo.length) return { cohorte: sumarCohortes(delPeriodo, delPeriodo[0].ambito), estimado: false, meses: delPeriodo.map((c) => c.cohorte) };
  const desde = [...meses].sort()[0] ?? "9999";
  const previas = cohortes
    .filter((c) => c.cohorte < desde && maduros(c, dias) > 0)
    .sort((a, b) => b.cohorte.localeCompare(a.cohorte))
    .slice(0, COHORTES_REFERENCIA);
  if (!previas.length) return null;
  return { cohorte: sumarCohortes(previas, previas[0].ambito), estimado: true, meses: previas.map((c) => c.cohorte).sort() };
}

// ---------------------------------------------------------------------------------------------
// Curva de margen acumulado por cliente (para la recuperación del CAC)
// ---------------------------------------------------------------------------------------------

/** El último día del mes `mes` de vida de una cohorte («2026-04-01», 1 → «2026-05-31»). */
export function finDeMes(cohorte: string, mes: number): string {
  const a = Number(cohorte.slice(0, 4));
  const m = Number(cohorte.slice(5, 7)) - 1 + mes;
  return new Date(Date.UTC(a, m + 1, 0)).toISOString().slice(0, 10);
}

/**
 * Margen acumulado promedio por cliente al cierre de cada mes de vida (0 = el mes de la primera entrega). En cada mes
 * solo cuentan las cohortes que ya lo completaron al corte, con todos sus clientes. Se corta en el primer mes que
 * ninguna cohorte completó.
 */
export function curvaAcumulada(puntos: PuntoCurva[], cohortes: Cohorte[], corte: string): number[] {
  const margen = new Map<string, number>();
  for (const p of puntos) margen.set(`${p.cohorte}|${p.mes}`, (margen.get(`${p.cohorte}|${p.mes}`) ?? 0) + p.margen);
  const curva: number[] = [];
  for (let mes = 0; mes <= 12; mes++) {
    let suma = 0;
    let n = 0;
    for (const c of cohortes) {
      if (finDeMes(c.cohorte, mes) > corte || !c.clientes) continue;
      for (let k = 0; k <= mes; k++) suma += margen.get(`${c.cohorte}|${k}`) ?? 0;
      n += c.clientes;
    }
    if (!n) break;
    curva.push(suma / n);
  }
  return curva;
}

/** En cuántos meses de vida el margen acumulado por cliente cubre el CAC (1 = en el mismo mes); null si no llega. */
export function mesesRecuperacion(curva: number[], cac: number | null): number | null {
  if (cac === null) return null;
  if (cac <= 0) return 1;
  const i = curva.findIndex((v) => v >= cac);
  return i < 0 ? null : i + 1;
}

// ---------------------------------------------------------------------------------------------
// Indicadores de adquisición
// ---------------------------------------------------------------------------------------------

export interface Indicadores {
  nuevos: number;
  recurrentes: number;
  compradores: number;
  ordenes: number;
  entregadas: number;
  ventas: number;
  /** Margen de contribución antes de marketing (ventas entregadas − mercancía − envío). */
  margen: number;
  /** Gasto de marketing de los meses con libro. */
  gasto: number;
  /** Gasto ÷ clientes nuevos (de los meses con libro). */
  cac: number | null;
  /** Ventas entregadas ÷ gasto (de los meses con libro). */
  roas: number | null;
  /** Margen de contribución ÷ gasto («ROAS de margen» o POAS). */
  poas: number | null;
  recompra90: number | null;
  recompra90Estimado: boolean;
  ltv180: number | null;
  ltv180Estimado: boolean;
  ltvCac: number | null;
  /** Meses de vida para recuperar el CAC con el margen acumulado por cliente. */
  recuperacion: number | null;
  /** La curva no alcanza a cubrir el CAC en los meses que ya hay. */
  sinRecuperar: boolean;
  /** Meses del período que el libro todavía no tiene: quedan fuera de CAC, ROAS y POAS. */
  mesesSinLibro: string[];
}

/**
 * Los indicadores de un ámbito en un período. CAC, ROAS y POAS solo comparan los meses que el libro ya tiene (`mesesLibro`):
 * en un mes sin libro el gasto de marketing todavía no está y daría un CAC de cero.
 */
export function indicadores(
  resumen: ResumenMes[],
  gastoPorMes: Map<string, number>,
  cohortes: Cohorte[],
  curva: number[],
  meses: string[],
  mesesLibro: Set<string>,
): Indicadores {
  const suma = (filas: ResumenMes[], k: keyof ResumenMes) => filas.reduce((a, r) => a + (r[k] as number), 0);
  const delPeriodo = resumen.filter((r) => meses.includes(r.periodo));
  const conLibro = delPeriodo.filter((r) => mesesLibro.has(r.periodo));
  const mesesConLibro = meses.filter((m) => mesesLibro.has(m));
  const gasto = r2(mesesConLibro.reduce((a, m) => a + (gastoPorMes.get(m) ?? 0), 0));
  const nuevosLibro = suma(conLibro, "nuevos");
  const cac = gasto > 0 ? div(gasto, nuevosLibro) : null;
  const r90 = referencia(cohortes, meses, 90);
  const l180 = referencia(cohortes, meses, 180);
  const ltv180 = l180 ? ltv(l180.cohorte, 180) : null;
  const recuperacion = mesesRecuperacion(curva, cac);
  return {
    nuevos: suma(delPeriodo, "nuevos"),
    recurrentes: suma(delPeriodo, "recurrentes"),
    compradores: suma(delPeriodo, "compradores"),
    ordenes: suma(delPeriodo, "ordenes"),
    entregadas: suma(delPeriodo, "entregadas"),
    ventas: r2(suma(delPeriodo, "ventas")),
    margen: r2(suma(delPeriodo, "margen")),
    gasto,
    cac,
    roas: div(suma(conLibro, "ventas"), gasto),
    poas: div(suma(conLibro, "margen"), gasto),
    recompra90: r90 ? recompra(r90.cohorte, 90) : null,
    recompra90Estimado: !!r90?.estimado,
    ltv180,
    ltv180Estimado: !!l180?.estimado,
    ltvCac: ltv180 !== null && cac !== null && cac > 0 ? ltv180 / cac : null,
    recuperacion,
    sinRecuperar: cac !== null && cac > 0 && recuperacion === null,
    mesesSinLibro: meses.filter((m) => !mesesLibro.has(m) && delPeriodo.some((r) => r.periodo === m)),
  };
}

export const ltvCacBajo = (v: number | null) => v !== null && v < LTV_CAC_MINIMO;
export const poasBajo = (v: number | null) => v !== null && v < POAS_MINIMO;

// ---------------------------------------------------------------------------------------------
// Frecuencia
// ---------------------------------------------------------------------------------------------

export interface Frecuencia {
  clientes: number;
  /** Clientes con 1, 2, 3, 4 y 5+ entregas. */
  porEntregas: number[];
  /** Parte de los clientes con más de una entrega. */
  conRecompra: number | null;
  /** Días promedio entre dos entregas de quienes volvieron. */
  diasEntreCompras: number | null;
}

export function frecuencia(filas: FilaFrecuencia[]): Frecuencia {
  const porEntregas = [0, 0, 0, 0, 0];
  let dias = 0;
  let intervalos = 0;
  for (const f of filas) {
    porEntregas[Math.min(Math.max(f.entregas, 1), 5) - 1] += f.clientes;
    dias += f.dias;
    intervalos += f.intervalos;
  }
  const clientes = porEntregas.reduce((a, b) => a + b, 0);
  return { clientes, porEntregas, conRecompra: div(clientes - porEntregas[0], clientes), diasEntreCompras: div(dias, intervalos) };
}

/** Gasto por plataforma de un conjunto de filas. */
export function gastoPorPlataforma(filas: GastoMarketing[]): Record<Plataforma, number> {
  const t = Object.fromEntries(PLATAFORMAS.map((p) => [p.clave, 0])) as Record<Plataforma, number>;
  for (const f of filas) t[f.plataforma] = r2(t[f.plataforma] + f.gasto);
  return t;
}

/** Gasto de marketing por mes de un ámbito (`todas` suma todas las unidades, también las que no venden). */
export function gastoPorMesDe(filas: GastoMarketing[], ambito: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of filas) if (ambito === TODAS || f.unidad_id === ambito) m.set(f.periodo, r2((m.get(f.periodo) ?? 0) + f.gasto));
  return m;
}
