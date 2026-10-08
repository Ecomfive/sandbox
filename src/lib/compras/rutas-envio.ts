// Compras › Envíos: lo que promete cada agente de envío (Chin, Avery…) por país y vía, y lo que de verdad tardó. Es lógica pura:
// la usan la página, las acciones y la importación desde ClickUp (con su prueba).

export const VIAS_RUTA = [
  { valor: "mar", etiqueta: "Marítimo" },
  { valor: "aire", etiqueta: "Aéreo" },
  { valor: "tierra", etiqueta: "Terrestre" },
] as const;
export const etiquetaVia = (v: string) => VIAS_RUTA.find((x) => x.valor === v)?.etiqueta ?? v;
export const MODALIDADES = ["DDP", "DAP"] as const;
export const UNIDADES_TARIFA = [
  { valor: "cbm", etiqueta: "por CBM" },
  { valor: "kg", etiqueta: "por kg" },
] as const;

/**
 * El tiempo que promete un agente, escrito como en ClickUp: «45-55 days», «about 10 days», «12-15 work days», «15 días».
 * Devuelve los días mínimo y máximo (iguales si es un solo número); null si no hay números.
 */
export function parsearTiempo(texto: string | null | undefined): { min: number; max: number } | null {
  const numeros = (texto ?? "").match(/\d+/g)?.map(Number) ?? [];
  if (numeros.length === 0) return null;
  const [a, b = a] = numeros;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/** «45–55 días», «~10 días» o «—». */
export function textoPrometido(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  if (min === null || max === null || min === max) return `${min ?? max} días`;
  return `${min}–${max} días`;
}

/** Un envío que ya llegó: cuándo llegó y cuántos días tardó desde la fecha de envío. */
export interface EnvioReal {
  llegada: string;
  dias: number;
}

export interface ResumenReal {
  n: number;
  promedio: number | null;
  min: number | null;
  max: number | null;
}

const resumir = (dias: number[]): ResumenReal =>
  dias.length === 0
    ? { n: 0, promedio: null, min: null, max: null }
    : { n: dias.length, promedio: Math.round(dias.reduce((s, d) => s + d, 0) / dias.length), min: Math.min(...dias), max: Math.max(...dias) };

/**
 * Lo que de verdad tardó una ruta: toda la vida, los últimos 12 meses y el año en curso (por la fecha de llegada). `hoy` es
 * AAAA-MM-DD. Un envío con días negativos o de más de un año es una fecha mal puesta y no cuenta.
 */
export function resumenReal(envios: EnvioReal[], hoy: string): { historico: ResumenReal; ultimos12: ResumenReal; anioActual: ResumenReal } {
  const validos = envios.filter((e) => e.dias >= 0 && e.dias <= 365);
  const haceUnAnio = `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4, 10)}`;
  return {
    historico: resumir(validos.map((e) => e.dias)),
    ultimos12: resumir(validos.filter((e) => e.llegada > haceUnAnio && e.llegada <= hoy).map((e) => e.dias)),
    anioActual: resumir(validos.filter((e) => e.llegada.slice(0, 4) === hoy.slice(0, 4)).map((e) => e.dias)),
  };
}

/** Si lo real se pasa de lo prometido (el promedio de los últimos 12 meses, o el histórico si no hay, contra el máximo). */
export function incumple(prometidoMax: number | null, r: { historico: ResumenReal; ultimos12: ResumenReal }): boolean {
  const real = r.ultimos12.promedio ?? r.historico.promedio;
  return prometidoMax !== null && real !== null && real > prometidoMax;
}
