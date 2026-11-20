// Anuncios Meta › Equipo: la actividad de cada persona del grupo de trabajo (20 nov 2026, pedido de Alcides). El registro es de la persona, no de una cuenta publicitaria: lo que montó en todas las cuentas se suma
// (3 campañas en una cuenta y 3 el mismo día en otra son 6 ese día) y de ahí salen los promedios. La pantalla puede filtrar por una cuenta; entonces aquí solo llegan las campañas y eventos de esa cuenta.
// Lógica pura, con prueba: cada cuánto sube campañas, cuánto lleva sin subir, cuántas por rango, por mes y por día de la semana, qué tipo sube más y qué más cambia en Meta.

import { claveDeTexto } from "./nombre";

/** Una campaña creada: lo que hace falta para contar quién la montó, cuándo y de qué tipo. */
export interface CreacionDeCampana {
  persona: string | null;
  /** Fecha y hora de creación en Meta (ISO, UTC). */
  creadaEn: string | null;
  etapa: string | null;
  estructura: string | null;
  puja: string | null;
  producto: string | null;
  cuenta: string;
}

/** Un evento del registro de actividad de Meta. */
export interface EventoDeActividad {
  fecha: string;
  actor: string | null;
  tipo: string;
  objetoTipo: string | null;
  objeto: string | null;
  detalle: string | null;
  cuenta: string;
  /** El id de la campaña en el sistema, si el evento es de una campaña que se conoce. */
  campanaId: string | null;
}

/** Los rangos que se cuentan a la vez (días hacia atrás desde hoy, contando hoy). */
export const RANGOS_ACTIVIDAD = [
  { clave: "hoy", etiqueta: "Hoy", dias: 1 },
  { clave: "7", etiqueta: "7 días", dias: 7 },
  { clave: "30", etiqueta: "30 días", dias: 30 },
  { clave: "90", etiqueta: "3 meses", dias: 90 },
  { clave: "180", etiqueta: "6 meses", dias: 180 },
  { clave: "365", etiqueta: "1 año", dias: 365 },
] as const;
export type ClaveRango = (typeof RANGOS_ACTIVIDAD)[number]["clave"];

/** Los promedios y «lo que más sube» se miden sobre los últimos 90 días: lo reciente dice cómo trabaja hoy la persona. */
export const VENTANA_PROMEDIO_DIAS = 90;

export const NOMBRES_DIA_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;

const MS_DIA = 86_400_000;
/** Panamá es UTC−5 todo el año. */
const OFFSET_PANAMA_MS = 5 * 3_600_000;

/** El día (AAAA-MM-DD) de Panamá de un instante ISO; null si no es una fecha. */
export function diaDePanama(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? new Date(t - OFFSET_PANAMA_MS).toISOString().slice(0, 10) : null;
}

const restarDia = (dia: string, n: number): string => new Date(new Date(`${dia}T00:00:00Z`).getTime() - n * MS_DIA).toISOString().slice(0, 10);
export const diasEntreDias = (desde: string, hasta: string): number => Math.round((new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / MS_DIA);

/** El nombre que se muestra de un evento del registro de Meta. */
const NOMBRE_EVENTO: Record<string, string> = {
  create_campaign_group: "Creó la campaña",
  create_campaign: "Creó la campaña",
  update_campaign_budget: "Cambió el presupuesto",
  update_campaign_run_status: "Cambió el estado (encendida o pausada)",
  update_campaign_name: "Le cambió el nombre",
  update_campaign_bid_strategy: "Cambió la estrategia de puja",
  create_ad_set: "Creó un conjunto de anuncios",
  update_ad_set_budget: "Cambió el presupuesto de un conjunto",
  update_ad_set_run_status: "Cambió el estado de un conjunto",
  create_ad: "Creó un anuncio",
  update_ad_run_status: "Cambió el estado de un anuncio",
  update_ad_creative: "Cambió el creativo de un anuncio",
};
export const nombreEvento = (tipo: string): string => NOMBRE_EVENTO[tipo] ?? "Hizo un cambio";

/** El nombre de un grupo de cambios según cuántos son («1 anuncio creado», «3 anuncios creados»). */
const SINGULAR_CATEGORIA: Record<CategoriaEvento, string> = { campañas: "campaña creada", conjuntos: "conjunto creado", anuncios: "anuncio creado", presupuesto: "cambio de presupuesto", estado: "encendido o pausa", otros: "otro cambio" };
const PLURAL_CATEGORIA: Record<CategoriaEvento, string> = { campañas: "campañas creadas", conjuntos: "conjuntos creados", anuncios: "anuncios creados", presupuesto: "cambios de presupuesto", estado: "encendidos y pausas", otros: "otros cambios" };
export const textoDeCambios = (cat: CategoriaEvento, n: number): string => `${n} ${n === 1 ? SINGULAR_CATEGORIA[cat] : PLURAL_CATEGORIA[cat]}`;

export type CategoriaEvento = "campañas" | "conjuntos" | "anuncios" | "presupuesto" | "estado" | "otros";
export const CATEGORIAS_EVENTO: CategoriaEvento[] = ["campañas", "conjuntos", "anuncios", "presupuesto", "estado", "otros"];
export const NOMBRE_CATEGORIA: Record<CategoriaEvento, string> = { campañas: "Campañas creadas", conjuntos: "Conjuntos creados", anuncios: "Anuncios creados", presupuesto: "Cambios de presupuesto", estado: "Encendidos y pausas", otros: "Otros cambios" };

/** En qué grupo cuenta un evento del registro. */
export function categoriaDeEvento(tipo: string): CategoriaEvento {
  if (tipo === "create_campaign_group" || tipo === "create_campaign") return "campañas";
  if (tipo === "create_ad_set") return "conjuntos";
  if (tipo === "create_ad") return "anuncios";
  if (/budget/.test(tipo)) return "presupuesto";
  if (/run_status/.test(tipo)) return "estado";
  return "otros";
}

export interface ConteoDe {
  nombre: string;
  n: number;
  /** De 0 a 100, sobre el total de la lista. */
  pct: number;
}

export interface ResumenActividad {
  /** Cuántas campañas montó en todo lo leído. */
  total: number;
  primera: string | null;
  ultima: string | null;
  /** Días desde la última campaña (0 = hoy); null si nunca montó una. */
  diasDesdeUltima: number | null;
  /** Campañas por rango: hoy, 7, 30, 90, 180 y 365 días. */
  porRango: Record<ClaveRango, number>;
  /** Días distintos con campañas en la ventana de 90 días. */
  diasActivos: number;
  /** Campañas por día con campañas (los días de varias cuentas ya van sumados). */
  campanasPorDiaActivo: number | null;
  /** Cada cuántos días sube campañas: promedio y mediana entre un día con campañas y el siguiente (ventana de 90 días). Null con menos de dos días. */
  intervaloPromedioDias: number | null;
  intervaloMedianoDias: number | null;
  /** El hueco más largo sin subir, en días (ventana de 90 días). */
  huecoMaximoDias: number | null;
  /** Campañas por semana y por mes en la ventana de 90 días. */
  porSemana: number;
  porMes: number;
  /** El día que más campañas montó en la ventana de 90 días. */
  mejorDia: { fecha: string; n: number } | null;
  /** Campañas por mes, los últimos 6 meses (el más viejo primero). */
  meses: { mes: string; n: number }[];
  /** Campañas por día de la semana (lunes a domingo) en la ventana de 90 días. */
  porDiaSemana: number[];
  /** Campañas por día, los últimos 14 días (el más viejo primero). */
  tira: number[];
  /** Lo que más sube (ventana de 90 días): por etapa, estructura, puja y producto. */
  tipos: { etapa: ConteoDe[]; estructura: ConteoDe[]; puja: ConteoDe[]; producto: ConteoDe[] };
  /** En qué cuentas montó campañas (ventana de 90 días). */
  cuentas: ConteoDe[];
}

export interface FilaPersona extends ResumenActividad {
  persona: string;
  /** Lo que hizo en Meta además de montar campañas (todo el registro leído), por grupo. */
  cambios: Record<CategoriaEvento, number>;
  cambiosTotal: number;
  /** Cambios de los últimos 30 días. */
  cambios30: number;
  /** La última vez que hizo algo en Meta (campaña o cambio). */
  ultimaActividad: string | null;
}

export interface DatosActividad {
  /** Todo el grupo junto. */
  equipo: ResumenActividad & { personas: number; cambios: Record<CategoriaEvento, number>; cambiosTotal: number; cambios30: number };
  personas: FilaPersona[];
  /** Lo más reciente que se hizo (todas las personas), del más nuevo al más viejo. */
  reciente: EventoDeActividad[];
  /** Campañas montadas por cuenta publicitaria (todos los rangos), para ver cómo se reparte. */
  porCuenta: { cuenta: string; total: number; ultimos30: number; ultima: string | null }[];
  /** Desde cuándo hay datos: la campaña más vieja leída. Si es reciente, los promedios largos todavía no dicen nada. */
  desde: string | null;
}

const vacioPorRango = (): Record<ClaveRango, number> => ({ hoy: 0, "7": 0, "30": 0, "90": 0, "180": 0, "365": 0 });

function contar(valores: (string | null)[]): ConteoDe[] {
  const m = new Map<string, number>();
  let total = 0;
  for (const v of valores) {
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
    total++;
  }
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([nombre, n]) => ({ nombre, n, pct: total ? Math.round((n / total) * 100) : 0 }));
}

function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Los últimos `n` meses (AAAA-MM), el más viejo primero, terminando en el mes de `hoy`. */
function ultimosMeses(hoy: string, n: number): string[] {
  let a = Number(hoy.slice(0, 4));
  let m = Number(hoy.slice(5, 7));
  const lista: string[] = [];
  for (let i = 0; i < n; i++) {
    lista.unshift(`${a}-${String(m).padStart(2, "0")}`);
    m--;
    if (m === 0) {
      m = 12;
      a--;
    }
  }
  return lista;
}

/** Resume las campañas de un conjunto (una persona, o todo el grupo): todas las cuentas juntas, los días se suman entre cuentas. */
export function resumirCreaciones(creaciones: CreacionDeCampana[], hoy: string): ResumenActividad {
  const conDia = creaciones.map((c) => ({ c, dia: diaDePanama(c.creadaEn) })).filter((x): x is { c: CreacionDeCampana; dia: string } => !!x.dia && x.dia <= hoy);
  const porRango = vacioPorRango();
  const porDia = new Map<string, number>();
  for (const { dia } of conDia) {
    const atras = diasEntreDias(dia, hoy);
    for (const r of RANGOS_ACTIVIDAD) if (atras < r.dias) porRango[r.clave]++;
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }
  const dias = [...porDia.keys()].sort();
  const ultima = dias.length ? dias[dias.length - 1] : null;
  const primera = dias.length ? dias[0] : null;

  const corte = restarDia(hoy, VENTANA_PROMEDIO_DIAS - 1);
  const enVentana = conDia.filter((x) => x.dia >= corte);
  const diasVentana = [...new Set(enVentana.map((x) => x.dia))].sort();
  const huecos: number[] = [];
  for (let i = 1; i < diasVentana.length; i++) huecos.push(diasEntreDias(diasVentana[i - 1], diasVentana[i]));
  // Si la persona tiene menos de 90 días de historia, el promedio por semana y por mes se calcula sobre el tiempo que lleva, no sobre 90 días.
  const diasDeHistoria = primera ? Math.min(VENTANA_PROMEDIO_DIAS, diasEntreDias(primera, hoy) + 1) : VENTANA_PROMEDIO_DIAS;
  const mejor = [...porDia].filter(([d]) => d >= corte).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0];

  const porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
  for (const x of enVentana) porDiaSemana[(new Date(`${x.dia}T00:00:00Z`).getUTCDay() + 6) % 7]++;
  const meses = ultimosMeses(hoy, 6).map((mes) => ({ mes, n: conDia.filter((x) => x.dia.startsWith(mes)).length }));
  const tira = Array.from({ length: 14 }, (_, i) => porDia.get(restarDia(hoy, 13 - i)) ?? 0);
  // Lo que más sube: la ventana reciente; si no hay nada ahí, todo lo leído.
  const base = enVentana.length ? enVentana : conDia;
  return {
    total: conDia.length,
    primera,
    ultima,
    diasDesdeUltima: ultima ? diasEntreDias(ultima, hoy) : null,
    porRango,
    diasActivos: diasVentana.length,
    campanasPorDiaActivo: diasVentana.length ? Math.round((enVentana.length / diasVentana.length) * 10) / 10 : null,
    intervaloPromedioDias: huecos.length ? Math.round((huecos.reduce((s, h) => s + h, 0) / huecos.length) * 10) / 10 : null,
    intervaloMedianoDias: mediana(huecos),
    huecoMaximoDias: huecos.length ? Math.max(...huecos) : null,
    porSemana: Math.round((enVentana.length / (diasDeHistoria / 7)) * 10) / 10,
    porMes: Math.round((enVentana.length / (diasDeHistoria / 30.44)) * 10) / 10,
    mejorDia: mejor ? { fecha: mejor[0], n: mejor[1] } : null,
    meses,
    porDiaSemana,
    tira,
    tipos: {
      etapa: contar(base.map((x) => x.c.etapa)),
      estructura: contar(base.map((x) => x.c.estructura)),
      puja: contar(base.map((x) => x.c.puja)),
      producto: contar(base.map((x) => x.c.producto)),
    },
    cuentas: contar(enVentana.map((x) => x.c.cuenta)),
  };
}

const sinCambios = (): Record<CategoriaEvento, number> => ({ campañas: 0, conjuntos: 0, anuncios: 0, presupuesto: 0, estado: 0, otros: 0 });

/** La llave con que se junta a una persona aunque cambien mayúsculas, acentos o espacios («ARIANNY» y «Arianny»). */
export const llavePersona = (nombre: string): string => claveDeTexto(nombre);

/**
 * Todo lo del equipo: cada persona con sus promedios y el grupo completo, con todas las cuentas juntas. Las campañas sin persona conocida cuentan para el grupo pero no tienen fila propia.
 * `eventos` ya viene ordenado del más nuevo al más viejo (o se ordena aquí).
 */
export function resumirEquipo(creaciones: CreacionDeCampana[], eventos: EventoDeActividad[], hoy: string, opciones: { maxReciente?: number } = {}): DatosActividad {
  // Una persona aparece una sola vez aunque su nombre llegue de dos formas; se muestra la forma que más se repite.
  const formas = new Map<string, Map<string, number>>();
  const anotar = (nombre: string | null) => {
    if (!nombre?.trim()) return null;
    const k = llavePersona(nombre);
    if (!k) return null;
    const f = formas.get(k) ?? new Map<string, number>();
    f.set(nombre.trim(), (f.get(nombre.trim()) ?? 0) + 1);
    formas.set(k, f);
    return k;
  };
  const creacionesConPersona = creaciones.map((c) => ({ c, k: anotar(c.persona) }));
  const eventosConPersona = eventos.map((e) => ({ e, k: anotar(e.actor) }));
  const etiqueta = (k: string) => [...(formas.get(k) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? k;

  const llaves = [...formas.keys()];
  const personas: FilaPersona[] = llaves.map((k) => {
    const suyas = creacionesConPersona.filter((x) => x.k === k).map((x) => x.c);
    const resumen = resumirCreaciones(suyas, hoy);
    const cambios = sinCambios();
    let ultimoEvento: string | null = null;
    let cambios30 = 0;
    const corte30 = restarDia(hoy, 29);
    for (const { e, k: ke } of eventosConPersona) {
      if (ke !== k) continue;
      const cat = categoriaDeEvento(e.tipo);
      cambios[cat]++;
      const d = diaDePanama(e.fecha);
      if (d && d >= corte30 && cat !== "campañas") cambios30++;
      if (!ultimoEvento || e.fecha > ultimoEvento) ultimoEvento = e.fecha;
    }
    const ultimaCampana = suyas.map((c) => c.creadaEn).filter((x): x is string => !!x).sort().pop() ?? null;
    const ultimaActividad = [ultimoEvento, ultimaCampana].filter((x): x is string => !!x).sort().pop() ?? null;
    return { persona: etiqueta(k), ...resumen, cambios, cambiosTotal: Object.values(cambios).reduce((s, n) => s + n, 0), cambios30, ultimaActividad };
  });
  personas.sort((a, b) => b.porRango["30"] - a.porRango["30"] || b.total - a.total || a.persona.localeCompare(b.persona, "es"));

  const equipoResumen = resumirCreaciones(creaciones, hoy);
  const cambiosEquipo = sinCambios();
  let cambios30 = 0;
  const corte30 = restarDia(hoy, 29);
  for (const e of eventos) {
    const cat = categoriaDeEvento(e.tipo);
    cambiosEquipo[cat]++;
    const d = diaDePanama(e.fecha);
    if (d && d >= corte30 && cat !== "campañas") cambios30++;
  }

  const porCuentaMapa = new Map<string, { total: number; ultimos30: number; ultima: string | null }>();
  for (const c of creaciones) {
    const dia = diaDePanama(c.creadaEn);
    if (!dia) continue;
    const f = porCuentaMapa.get(c.cuenta) ?? { total: 0, ultimos30: 0, ultima: null };
    f.total++;
    if (dia >= corte30) f.ultimos30++;
    if (!f.ultima || dia > f.ultima) f.ultima = dia;
    porCuentaMapa.set(c.cuenta, f);
  }
  const porCuenta = [...porCuentaMapa].map(([cuenta, f]) => ({ cuenta, ...f })).sort((a, b) => b.ultimos30 - a.ultimos30 || b.total - a.total);

  const reciente = [...eventos].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)).slice(0, opciones.maxReciente ?? 80);
  return { equipo: { ...equipoResumen, personas: personas.length, cambios: cambiosEquipo, cambiosTotal: Object.values(cambiosEquipo).reduce((s, n) => s + n, 0), cambios30 }, personas, reciente, porCuenta, desde: equipoResumen.primera };
}

/** «hace 3 días», «hoy», «ayer»: para decir cuánto lleva sin subir una campaña. */
export function textoDias(n: number | null): string {
  if (n === null) return "nunca";
  if (n === 0) return "hoy";
  if (n === 1) return "ayer";
  return `hace ${n} días`;
}
