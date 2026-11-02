// La atención por WhatsApp, armada de lo que devuelve `whatsapp_kpis` (migraciones 0164 y 0168) para la vista Equipo del panel de Dirección (3 nov 2026: antes era la pestaña
// «KPIs de atención»). Lógica pura, con prueba en atencion.test.ts: los números de la base llegan como número o texto y los minutos pueden ser null.

export interface KpisCrudos {
  numeros?: {
    id: string;
    nombre: string;
    numero: string;
    area: string;
    conversaciones: number;
    recibidos: number;
    enviados: number;
    consultas: number;
    sin_responder: number;
    en_15_min: number;
    mediana_min: number | null;
    promedio_min: number | null;
  }[];
  areas?: { area: string; conversaciones: number; consultas: number; sin_responder: number; en_15_min: number; mediana_min: number | null }[];
  dias?: { dia: string; consultas: number; sin_responder: number; mediana_min: number | null }[];
}

export interface AreaAtencion {
  area: string;
  conversaciones: number;
  consultas: number;
  sinResponder: number;
  en15: number;
  medianaMin: number | null;
}

export interface NumeroAtencion extends AreaAtencion {
  id: string;
  nombre: string;
  numero: string;
  recibidos: number;
  enviados: number;
  promedioMin: number | null;
}

export interface DiaAtencion {
  dia: string;
  consultas: number;
  sinResponder: number;
  medianaMin: number | null;
}

export interface AtencionWhatsapp {
  conversaciones: number;
  consultas: number;
  sinResponder: number;
  en15: number;
  /** La mediana de todas las consultas, aproximada con la de cada área pesada por sus consultas respondidas. */
  medianaMin: number | null;
  areas: AreaAtencion[];
  numeros: NumeroAtencion[];
  /** Del día más viejo al más nuevo. */
  dias: DiaAtencion[];
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const m = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** La mediana general: la de cada grupo pesada por sus consultas respondidas (consultas − sin responder). `null` si nadie respondió. */
export function medianaPesada(grupos: { consultas: number; sinResponder: number; medianaMin: number | null }[]): number | null {
  const con = grupos.filter((g) => g.medianaMin !== null && g.consultas - g.sinResponder > 0);
  const peso = con.reduce((s, g) => s + (g.consultas - g.sinResponder), 0);
  return peso ? con.reduce((s, g) => s + Number(g.medianaMin) * (g.consultas - g.sinResponder), 0) / peso : null;
}

export function armarAtencion(datos: KpisCrudos | null | undefined): AtencionWhatsapp {
  const areas: AreaAtencion[] = (datos?.areas ?? []).map((a) => ({
    area: a.area,
    conversaciones: n(a.conversaciones),
    consultas: n(a.consultas),
    sinResponder: n(a.sin_responder),
    en15: n(a.en_15_min),
    medianaMin: m(a.mediana_min),
  }));
  const numeros: NumeroAtencion[] = (datos?.numeros ?? []).map((x) => ({
    id: x.id,
    nombre: x.nombre,
    numero: x.numero,
    area: x.area,
    conversaciones: n(x.conversaciones),
    recibidos: n(x.recibidos),
    enviados: n(x.enviados),
    consultas: n(x.consultas),
    sinResponder: n(x.sin_responder),
    en15: n(x.en_15_min),
    medianaMin: m(x.mediana_min),
    promedioMin: m(x.promedio_min),
  }));
  const dias: DiaAtencion[] = (datos?.dias ?? []).map((d) => ({ dia: d.dia, consultas: n(d.consultas), sinResponder: n(d.sin_responder), medianaMin: m(d.mediana_min) })).sort((a, b) => a.dia.localeCompare(b.dia));
  return {
    conversaciones: areas.reduce((s, a) => s + a.conversaciones, 0),
    consultas: areas.reduce((s, a) => s + a.consultas, 0),
    sinResponder: areas.reduce((s, a) => s + a.sinResponder, 0),
    en15: areas.reduce((s, a) => s + a.en15, 0),
    medianaMin: medianaPesada(areas),
    areas,
    numeros,
    dias,
  };
}

/** «43 %» de una parte sobre un total; «—» sin total. */
export const porcentaje = (parte: number, total: number): string => (total ? `${Math.round((parte / total) * 100)} %` : "—");

/** La parte (0 a 100) de un total, para dibujar un anillo o una barra; 0 sin total. */
export const parteDe = (parte: number, total: number): number => (total ? Math.max(0, Math.min(100, Math.round((parte / total) * 100))) : 0);

/**
 * Dónde cae un tiempo en la barra de la meta (0 a 100): la barra mide `veces` veces la meta (3 por defecto: verde hasta la meta, ámbar hasta el doble, rojo
 * hasta el triple) y lo que pasa del final queda en el borde. Sin tiempo, `null`.
 */
export function posicionEnMeta(minutos: number | null, meta: number, veces = 3): number | null {
  if (minutos === null || !Number.isFinite(minutos) || meta <= 0) return null;
  return Math.max(0, Math.min(100, (minutos / (meta * veces)) * 100));
}
