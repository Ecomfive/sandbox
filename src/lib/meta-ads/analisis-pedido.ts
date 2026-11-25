// Anuncios Meta › análisis a pedido y vigilancias (24 nov 2026, pedido de Alcides): el chat de Hallazgos ya no contesta solo con lo calculado. Si una pregunta necesita un análisis que no está hecho (otro rango de fechas, otro
// desglose, un producto o un ángulo concreto, comparar dos periodos), la IA **pide** uno y el sistema lo corre sobre los resultados por día; y si la persona pide que desde ahora se le indique algo, queda como una «vigilancia» que se evalúa
// cada día y se muestra en Hallazgos con la prioridad que se dijo. La IA nunca escribe consultas: solo llena los campos de un formulario cerrado (esquema), y todo lo que devuelve se valida aquí. Lógica pura, con prueba; los datos los
// pasa quien llama (`BaseDias`, que lee `base-dias.ts`).

import type { Familia, Hallazgo } from "./historico";
import { cpa, cpm, ctr, cvr, efectividad, hookRate, resultado as resultadoDe, sinResultados, sumar, type Resultados } from "./metricas";

export const DIMENSIONES = ["producto", "campana", "video", "angulo", "gancho", "formato", "cta", "estructura", "puja", "etapa", "familia", "dia", "semana", "mes"] as const;
export type Dimension = (typeof DIMENSIONES)[number];
export const METRICAS = ["gasto", "compras", "cpa", "ctr", "hook", "cpm", "cvr", "clic_a_visita", "resultado"] as const;
export type Metrica = (typeof METRICAS)[number];
export const CLAVES_FILTRO = ["producto", "campana", "angulo", "gancho", "formato", "cta", "etapa", "estructura", "puja", "familia"] as const;
export type ClaveFiltro = (typeof CLAVES_FILTRO)[number];
export type Filtros = Partial<Record<ClaveFiltro, string>>;
export type Prioridad = "alta" | "media" | "baja";

/** Si subir es bueno, malo o ninguna de las dos (el gasto). */
export const SENTIDO_METRICA: Record<Metrica, "sube_bien" | "sube_mal" | "neutral"> = { gasto: "neutral", compras: "sube_bien", cpa: "sube_mal", ctr: "sube_bien", hook: "sube_bien", cpm: "sube_mal", cvr: "sube_bien", clic_a_visita: "sube_bien", resultado: "sube_bien" };
export const NOMBRE_METRICA: Record<Metrica, string> = { gasto: "Gasto", compras: "Compras", cpa: "CPA", ctr: "CTR", hook: "Hook", cpm: "CPM", cvr: "CVR", clic_a_visita: "Clic a visita", resultado: "Resultado estimado" };

// ───────────────────────── Los datos sobre los que se calcula ─────────────────────────

export interface CampanaBase {
  id: string;
  nombre: string;
  producto: string | null;
  familia: Familia;
  etapa: string | null;
  estructura: string | null;
  puja: string | null;
  tope: number;
}
export interface VideoBase {
  id: string;
  nombre: string;
  angulo: string | null;
  gancho: string | null;
  formato: string | null;
  cta: string | null;
}
export interface FilaDiaBase {
  fecha: string;
  campanaId: string;
  videoId: string | null;
  r: Resultados;
}
export interface BaseDias {
  campanas: Map<string, CampanaBase>;
  videos: Map<string, VideoBase>;
  dias: FilaDiaBase[];
}

// ───────────────────────── Validación de lo que pide la IA ─────────────────────────

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (v: unknown): v is string => typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const entre = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const texto = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const sinTildes = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const uno = <T extends string>(v: unknown, lista: readonly T[], def: T): T => (typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : def);

/** Máximo de días que abarca un análisis (algo más de dos años: más allá no hay historial). */
export const MAX_DIAS_ANALISIS = 800;
export const MAX_FILAS = 15;

export function validarFiltros(crudo: unknown): Filtros {
  const f: Filtros = {};
  if (!crudo || typeof crudo !== "object") return f;
  for (const k of CLAVES_FILTRO) {
    const t = texto((crudo as Record<string, unknown>)[k], 60);
    if (t) f[k] = t;
  }
  return f;
}

export interface AnalisisSpec {
  titulo: string;
  agrupar: Dimension;
  desde: string;
  hasta: string;
  comparar: { desde: string; hasta: string } | null;
  filtros: Filtros;
  orden: Metrica;
  sentido: "asc" | "desc";
  limite: number;
  gastoMinimo: number;
}

function periodoValido(crudo: unknown): { desde: string; hasta: string } | null {
  if (!crudo || typeof crudo !== "object") return null;
  const { desde, hasta } = crudo as { desde?: unknown; hasta?: unknown };
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) return null;
  if ((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000 > MAX_DIAS_ANALISIS) return null;
  return { desde, hasta };
}

/** El análisis que pidió la IA, revisado campo por campo; null si no se puede entender. Sin fechas, los últimos 30 días; una fecha futura se recorta a hoy. */
export function validarAnalisis(crudo: unknown, hoy: string): AnalisisSpec | null {
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  const agrupar = uno(o.agrupar, DIMENSIONES, "producto");
  let periodo = periodoValido({ desde: o.desde ?? sumarDias(hoy, -29), hasta: o.hasta ?? hoy });
  if (!periodo) return null;
  if (periodo.hasta > hoy) periodo = { desde: periodo.desde > hoy ? hoy : periodo.desde, hasta: hoy };
  let comparar = o.comparar ? periodoValido(o.comparar) : null;
  if (comparar && comparar.hasta > hoy) comparar = { desde: comparar.desde > hoy ? hoy : comparar.desde, hasta: hoy };
  const orden = uno(o.orden, METRICAS, "gasto");
  const filtros = validarFiltros(o.filtros);
  return {
    titulo: texto(o.titulo, 90) ?? `${NOMBRE_METRICA[orden]} por ${agrupar}`,
    agrupar,
    ...periodo,
    comparar,
    filtros,
    orden,
    sentido: o.sentido === "asc" ? "asc" : "desc",
    limite: Math.round(entre(o.limite, 1, MAX_FILAS, 10)),
    gastoMinimo: entre(o.gasto_minimo ?? o.gastoMinimo, 0, 10_000, 0),
  };
}

// ───────────────────────── Cálculo ─────────────────────────

interface Acum {
  r: Resultados;
  res: number;
}

const valorDe = (a: Acum, m: Metrica): number | null => {
  switch (m) {
    case "gasto": return a.r.gasto;
    case "compras": return a.r.compras;
    case "cpa": return cpa(a.r);
    case "ctr": return ctr(a.r);
    case "hook": return hookRate(a.r);
    case "cpm": return cpm(a.r);
    case "cvr": return cvr(a.r);
    case "clic_a_visita": return efectividad(a.r);
    case "resultado": return a.res;
  }
};
const r2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

function contiene(valor: string | null | undefined, buscado: string): boolean {
  if (!valor) return false;
  const v = sinTildes(valor);
  return sinTildes(buscado).split(/\s+/).filter((p) => p.length >= 2).every((p) => v.includes(p)) && buscado.trim().length > 0;
}

/** ¿La fila pasa los filtros? Los de video piden que el anuncio tenga video analizado. */
function pasa(f: FilaDiaBase, base: BaseDias, filtros: Filtros): boolean {
  const c = base.campanas.get(f.campanaId);
  if (!c) return false;
  const v = f.videoId ? base.videos.get(f.videoId) : undefined;
  if (filtros.producto && !contiene(c.producto, filtros.producto)) return false;
  if (filtros.campana && !contiene(c.nombre, filtros.campana)) return false;
  if (filtros.etapa && !contiene(c.etapa, filtros.etapa)) return false;
  if (filtros.estructura && !contiene(c.estructura, filtros.estructura)) return false;
  if (filtros.puja && !contiene(c.puja, filtros.puja)) return false;
  if (filtros.familia && sinTildes(c.familia) !== sinTildes(filtros.familia)) return false;
  if (filtros.angulo && !contiene(v?.angulo, filtros.angulo)) return false;
  if (filtros.gancho && !contiene(v?.gancho, filtros.gancho)) return false;
  if (filtros.formato && !contiene(v?.formato, filtros.formato)) return false;
  if (filtros.cta && !contiene(v?.cta, filtros.cta)) return false;
  return true;
}

const lunesDe = (fecha: string) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  return sumarDias(fecha, -((d.getUTCDay() + 6) % 7));
};

/** El grupo al que pertenece una fila según cómo se agrupa; null si no se puede (un video sin análisis no tiene ángulo). */
function claveDeGrupo(f: FilaDiaBase, base: BaseDias, agrupar: Dimension): string | null {
  const c = base.campanas.get(f.campanaId)!;
  const v = f.videoId ? base.videos.get(f.videoId) : undefined;
  switch (agrupar) {
    case "producto": return c.producto ?? "Sin producto";
    case "campana": return c.nombre;
    case "video": return v ? v.nombre : null;
    case "angulo": return v ? (v.angulo ?? "Sin ángulo") : null;
    case "gancho": return v ? (v.gancho ?? "Sin tipo de gancho") : null;
    case "formato": return v ? (v.formato ?? "Sin formato") : null;
    case "cta": return v ? (v.cta ?? "Sin llamado a la acción") : null;
    case "estructura": return c.estructura ?? "Sin dato";
    case "puja": return c.puja ?? "Sin dato";
    case "etapa": return c.etapa ?? "Sin etapa";
    case "familia": return c.familia;
    case "dia": return f.fecha;
    case "semana": return lunesDe(f.fecha);
    case "mes": return f.fecha.slice(0, 7);
  }
}

function agrupar(base: BaseDias, desde: string, hasta: string, dim: Dimension | "total", filtros: Filtros): Map<string, Acum> {
  const m = new Map<string, Acum>();
  for (const f of base.dias) {
    if (f.fecha < desde || f.fecha > hasta || !pasa(f, base, filtros)) continue;
    const k = dim === "total" ? "Todo lo filtrado" : claveDeGrupo(f, base, dim);
    if (k === null) continue;
    const a = m.get(k) ?? { r: sinResultados(), res: 0 };
    a.r = sumar(a.r, f.r);
    a.res += resultadoDe(f.r, base.campanas.get(f.campanaId)!.tope);
    m.set(k, a);
  }
  return m;
}

export interface FilaAnalisis {
  nombre: string;
  gasto: number;
  compras: number;
  cpa: number | null;
  ctr: number | null;
  hook: number | null;
  cpm: number | null;
  cvr: number | null;
  clic_a_visita: number | null;
  resultado_estimado: number;
  /** Solo con `comparar`: lo mismo en el otro periodo y cuánto cambió la métrica de orden (en %). */
  comparacion?: { gasto: number; compras: number; cpa: number | null; valor_orden: number | null };
  cambio_pct_de_la_metrica_de_orden?: number | null;
}
export interface ResultadoAnalisis {
  titulo: string;
  agrupado_por: Dimension;
  periodo: { desde: string; hasta: string };
  comparado_con: { desde: string; hasta: string } | null;
  filtros: Filtros;
  ordenado_por: Metrica;
  total: Omit<FilaAnalisis, "nombre" | "comparacion" | "cambio_pct_de_la_metrica_de_orden">;
  filas: FilaAnalisis[];
  filas_no_mostradas: number;
  aviso?: string;
}

const filaDe = (nombre: string, a: Acum): FilaAnalisis => ({ nombre, gasto: r2(a.r.gasto)!, compras: a.r.compras, cpa: r2(cpa(a.r)), ctr: r2(ctr(a.r)), hook: r2(hookRate(a.r)), cpm: r2(cpm(a.r)), cvr: r2(cvr(a.r)), clic_a_visita: r2(efectividad(a.r)), resultado_estimado: r2(a.res)! });
const sumaTotal = (m: Map<string, Acum>): Acum => [...m.values()].reduce<Acum>((t, a) => ({ r: sumar(t.r, a.r), res: t.res + a.res }), { r: sinResultados(), res: 0 });

/** Corre un análisis sobre los resultados por día: agrupa, calcula las métricas, ordena y, si se pidió, compara con otro periodo. */
export function ejecutarAnalisis(spec: AnalisisSpec, base: BaseDias): ResultadoAnalisis {
  const actual = agrupar(base, spec.desde, spec.hasta, spec.agrupar, spec.filtros);
  const otro = spec.comparar ? agrupar(base, spec.comparar.desde, spec.comparar.hasta, spec.agrupar, spec.filtros) : null;
  const nombres = new Set([...actual.keys(), ...(otro ? [...otro.keys()] : [])]);
  const vacia: Acum = { r: sinResultados(), res: 0 };
  const orden = (n: string) => valorDe(actual.get(n) ?? vacia, spec.orden);
  let filas = [...nombres]
    .filter((n) => (actual.get(n)?.r.gasto ?? 0) >= spec.gastoMinimo && ((actual.get(n)?.r.gasto ?? 0) > 0 || (otro?.get(n)?.r.gasto ?? 0) > 0))
    .map((n): FilaAnalisis => {
      const a = actual.get(n) ?? vacia;
      const f = filaDe(n, a);
      if (otro) {
        const b = otro.get(n) ?? vacia;
        const vb = valorDe(b, spec.orden);
        const va = valorDe(a, spec.orden);
        f.comparacion = { gasto: r2(b.r.gasto)!, compras: b.r.compras, cpa: r2(cpa(b.r)), valor_orden: r2(vb) };
        f.cambio_pct_de_la_metrica_de_orden = va !== null && vb !== null && vb !== 0 ? r2(((va - vb) / Math.abs(vb)) * 100) : null;
      }
      return f;
    });
  const clave = (n: string) => orden(n);
  const esTiempo = spec.agrupar === "dia" || spec.agrupar === "semana" || spec.agrupar === "mes";
  filas.sort((x, y) => {
    if (esTiempo) return x.nombre.localeCompare(y.nombre);
    const a = clave(x.nombre);
    const b = clave(y.nombre);
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return spec.sentido === "asc" ? a - b : b - a;
  });
  const total = filas.length;
  filas = filas.slice(0, spec.limite);
  const t = filaDe("", sumaTotal(actual));
  const { nombre: _n, ...totalSinNombre } = t;
  void _n;
  const sinDatos = actual.size === 0 && (!otro || otro.size === 0);
  return {
    titulo: spec.titulo,
    agrupado_por: spec.agrupar,
    periodo: { desde: spec.desde, hasta: spec.hasta },
    comparado_con: spec.comparar,
    filtros: spec.filtros,
    ordenado_por: spec.orden,
    total: totalSinNombre,
    filas,
    filas_no_mostradas: Math.max(0, total - filas.length),
    ...(sinDatos ? { aviso: "No hay resultados de Meta con esos filtros en esas fechas." } : {}),
  };
}

/** Una llave corta del «tema» de un análisis (qué agrupa, qué filtra y qué ordena, sin fechas): sirve para contar cuántas veces se pregunta lo mismo. */
export function claveDeTema(spec: Pick<AnalisisSpec, "agrupar" | "orden" | "filtros">): string {
  const f = Object.entries(spec.filtros).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${sinTildes(v).trim()}`).join("&");
  const bruto = `${spec.agrupar}|${spec.orden}|${f}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < bruto.length; i++) h = Math.imul(h ^ bruto.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// ───────────────────────── Vigilancias ─────────────────────────

export const VENTANAS_VIGILANCIA = [7, 14, 30] as const;
const DIMENSIONES_VIGILANCIA = ["total", "producto", "campana", "angulo", "gancho", "formato", "cta", "estructura", "puja", "etapa", "familia"] as const;
export type DimensionVigilancia = (typeof DIMENSIONES_VIGILANCIA)[number];

export interface VigilanciaSpec {
  titulo: string;
  agrupar: DimensionVigilancia;
  metrica: Metrica;
  /** Se compara lo de los últimos N días con los N anteriores. */
  ventanaDias: (typeof VENTANAS_VIGILANCIA)[number];
  /** Cuánto tiene que moverse (en %) para que se marque. */
  umbralPct: number;
  /** Lo que tiene que haber gastado en la ventana reciente para que un grupo cuente (con menos no hay datos para decir nada). */
  gastoMinimo: number;
  filtros: Filtros;
}

export function validarVigilancia(crudo: unknown): VigilanciaSpec | null {
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  const metrica = uno(o.metrica, METRICAS, "cpa");
  const agrupar = uno(o.agrupar, DIMENSIONES_VIGILANCIA, "total");
  const ventana = Number(o.ventana_dias ?? o.ventanaDias);
  return {
    titulo: texto(o.titulo, 90) ?? `${NOMBRE_METRICA[metrica]} ${agrupar === "total" ? "de todo" : `por ${agrupar}`}`,
    agrupar,
    metrica,
    ventanaDias: (VENTANAS_VIGILANCIA as readonly number[]).includes(ventana) ? (ventana as VigilanciaSpec["ventanaDias"]) : 14,
    umbralPct: Math.round(entre(o.umbral_pct ?? o.umbralPct, 5, 200, 20)),
    gastoMinimo: entre(o.gasto_minimo ?? o.gastoMinimo, 0, 10_000, 40),
    filtros: validarFiltros(o.filtros),
  };
}

export const validarPrioridad = (v: unknown): Prioridad => uno(v, ["alta", "media", "baja"] as const, "media");

/** De un análisis que se preguntó mucho a la vigilancia que lo sigue solo (sin fechas: los últimos 14 días contra los 14 anteriores). */
export function vigilanciaDeAnalisis(a: AnalisisSpec): VigilanciaSpec {
  const agrupar = (DIMENSIONES_VIGILANCIA as readonly string[]).includes(a.agrupar) ? (a.agrupar as DimensionVigilancia) : "total";
  return { titulo: a.titulo, agrupar, metrica: a.orden, ventanaDias: 14, umbralPct: 20, gastoMinimo: 40, filtros: a.filtros };
}

export type EstadoVigilancia = "alerta" | "bueno" | "estable" | "sin_datos";
export interface FilaVigilancia {
  nombre: string;
  antes: number | null;
  ahora: number | null;
  cambioPct: number | null;
  sentido: "malo" | "bueno" | "neutral";
  gasto: number;
}
export interface ResultadoVigilancia {
  id: string;
  titulo: string;
  prioridad: Prioridad;
  origen: "chat" | "insistencia";
  activa: boolean;
  metrica: Metrica;
  ventanaDias: number;
  umbralPct: number;
  estado: EstadoVigilancia;
  resumen: string;
  filas: FilaVigilancia[];
  /** Cuánto gastaron los grupos que se marcaron (para ordenar y para la certeza). */
  gasto: number;
  evaluadaEn: string;
}

const formatoMetrica = (m: Metrica, n: number | null): string => {
  if (n === null) return "—";
  if (m === "gasto" || m === "cpa" || m === "cpm" || m === "resultado") return `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
  if (m === "compras") return String(Math.round(n));
  return `${n.toFixed(m === "hook" || m === "clic_a_visita" ? 1 : 2)} %`;
};

/** Evalúa una vigilancia: los últimos N días contra los N anteriores, por grupo; marca los que se movieron más que el umbral (en contra, «alerta»; a favor, «bueno»). */
export function evaluarVigilancia(v: { id: string; spec: VigilanciaSpec; prioridad: Prioridad; origen: "chat" | "insistencia"; activa: boolean }, base: BaseDias, hoy: string): ResultadoVigilancia {
  const s = v.spec;
  const n = s.ventanaDias;
  const rec = agrupar(base, sumarDias(hoy, -(n - 1)), hoy, s.agrupar, s.filtros);
  const prev = agrupar(base, sumarDias(hoy, -(2 * n - 1)), sumarDias(hoy, -n), s.agrupar, s.filtros);
  const sentidoBase = SENTIDO_METRICA[s.metrica];
  const filas: FilaVigilancia[] = [];
  for (const [nombre, a] of rec) {
    if (a.r.gasto < s.gastoMinimo) continue;
    const b = prev.get(nombre);
    const ahora = valorDe(a, s.metrica);
    const antes = b ? valorDe(b, s.metrica) : null;
    const cambioPct = ahora !== null && antes !== null && antes !== 0 ? ((ahora - antes) / Math.abs(antes)) * 100 : null;
    let sentido: FilaVigilancia["sentido"] = "neutral";
    if (cambioPct !== null && Math.abs(cambioPct) >= s.umbralPct && sentidoBase !== "neutral") {
      const sube = cambioPct > 0;
      sentido = (sentidoBase === "sube_bien") === sube ? "bueno" : "malo";
    }
    filas.push({ nombre, antes: r2(antes), ahora: r2(ahora), cambioPct: r2(cambioPct), sentido, gasto: r2(a.r.gasto)! });
  }
  // Primero lo que se movió en contra, luego lo que se movió a favor y luego lo demás, por tamaño del cambio.
  const rango = (f: FilaVigilancia) => (f.sentido === "malo" ? 0 : f.sentido === "bueno" ? 1 : 2);
  filas.sort((x, y) => rango(x) - rango(y) || Math.abs(y.cambioPct ?? 0) - Math.abs(x.cambioPct ?? 0) || y.gasto - x.gasto);
  const malos = filas.filter((f) => f.sentido === "malo");
  const buenos = filas.filter((f) => f.sentido === "bueno");
  const estado: EstadoVigilancia = filas.length === 0 ? "sin_datos" : malos.length ? "alerta" : buenos.length ? "bueno" : "estable";
  const m = NOMBRE_METRICA[s.metrica];
  const linea = (f: FilaVigilancia) => `${f.nombre === "Todo lo filtrado" ? m : `${m} de «${f.nombre}»`}: ${formatoMetrica(s.metrica, f.antes)} → ${formatoMetrica(s.metrica, f.ahora)}${f.cambioPct === null ? "" : ` (${f.cambioPct > 0 ? "+" : ""}${Math.round(f.cambioPct)} %)`}`;
  const resumen =
    estado === "sin_datos"
      ? `Sin gasto suficiente en los últimos ${n} días (mínimo $${s.gastoMinimo}) para comparar.`
      : estado === "alerta"
        ? `${linea(malos[0])} en los últimos ${n} días${malos.length > 1 ? `; y ${malos.length - 1} más en contra` : ""}.`
        : estado === "bueno"
          ? `${linea(buenos[0])} en los últimos ${n} días${buenos.length > 1 ? `; y ${buenos.length - 1} más a favor` : ""}.`
          : `Sin cambios de más de ${s.umbralPct} % en los últimos ${n} días.`;
  return {
    id: v.id,
    titulo: s.titulo,
    prioridad: v.prioridad,
    origen: v.origen,
    activa: v.activa,
    metrica: s.metrica,
    ventanaDias: n,
    umbralPct: s.umbralPct,
    estado,
    resumen,
    filas: filas.slice(0, 6),
    gasto: Math.round(malos.concat(buenos).reduce((t, f) => t + f.gasto, 0)),
    evaluadaEn: new Date().toISOString(),
  };
}

const RANGO_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };
const RANGO_ESTADO: Record<EstadoVigilancia, number> = { alerta: 0, bueno: 1, estable: 2, sin_datos: 3 };

/** Las vigilancias en el orden en que se muestran: las que están en alerta primero y, dentro, las de más prioridad. */
export function ordenarVigilancias<T extends Pick<ResultadoVigilancia, "estado" | "prioridad" | "gasto">>(lista: readonly T[]): T[] {
  return [...lista].sort((a, b) => RANGO_ESTADO[a.estado] - RANGO_ESTADO[b.estado] || RANGO_PRIORIDAD[a.prioridad] - RANGO_PRIORIDAD[b.prioridad] || b.gasto - a.gasto);
}

/** Una vigilancia en alerta como hallazgo, para que entre a las sugerencias del Resumen con la prioridad que se le dio. */
export function hallazgoDeVigilancia(v: ResultadoVigilancia): Hallazgo | null {
  if (!v.activa || v.estado !== "alerta") return null;
  return {
    id: `vigilancia:${v.id}`,
    categoria: "tendencia",
    tono: "alerta",
    titulo: `Vigilancia · ${v.titulo}`,
    detalle: v.resumen,
    accion: "Lo estás vigilando: revisa el detalle en Hallazgos › Lo que estás vigilando.",
    certeza: v.gasto >= 300 ? "firme" : v.gasto >= 100 ? "probable" : "poca",
    gasto: v.gasto,
    prioridad: v.prioridad,
  };
}
