// La planificación de una compra (pedido de Hernán, 8 oct 2026): el mes en que se espera que llegue, como «Nov26». En
// ClickUp se ponía a mano y era el mes de la fecha límite (fecha de envío + lo que tarda el envío). Aquí se calcula sola: a la
// fecha de envío se le suma lo que **de verdad** tardaron los envíos anteriores de ese país por esa vía (la mediana de los
// días entre la fecha de envío y la fecha de llegada). Es lógica pura: la usan las acciones del servidor y sus pruebas.

export const MESES_PLANIFICACION = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"] as const;

/** «2026-11-03» → «Nov26» (el formato que ya tenían las compras de ClickUp). */
export function mesPlanificacion(fecha: string): string {
  return `${MESES_PLANIFICACION[Number(fecha.slice(5, 7)) - 1]}${fecha.slice(2, 4)}`;
}

/** Sin envíos anteriores para medir, lo típico de cada vía (lo que tardan en promedio los de Panamá). */
export const DIAS_POR_DEFECTO: Record<string, number> = { mar: 60, aire: 16, tierra: 7 };
/** Con menos envíos que estos de ese país por esa vía, se usa lo de todos los países por esa vía. */
export const MIN_MUESTRA = 3;
const NOMBRE_VIA: Record<string, string> = { mar: "marítimo", aire: "aéreo", tierra: "terrestre" };

/** Un envío que ya llegó: de qué país (su id, o «importacion»), por qué vía y cuántos días tardó. */
export interface EnvioHistorico {
  clave: string;
  via: string;
  dias: number;
}

export interface Transito {
  dias: number;
  muestra: number;
}
/** Lo que tarda cada país por cada vía (`clave|via`) y cada vía en todos los países (`*|via`). */
export type TiemposTransito = Map<string, Transito>;

const mediana = (v: number[]) => {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
};

export function tiemposDeTransito(historial: EnvioHistorico[]): TiemposTransito {
  const grupos = new Map<string, number[]>();
  for (const e of historial) {
    if (!(e.dias >= 0) || e.dias > 365) continue; // una fecha mal puesta no cuenta
    for (const k of [`${e.clave}|${e.via}`, `*|${e.via}`]) grupos.set(k, [...(grupos.get(k) ?? []), e.dias]);
  }
  return new Map([...grupos].map(([k, v]) => [k, { dias: mediana(v), muestra: v.length }]));
}

export interface Estimacion {
  planificacion: string;
  llegadaEstimada: string;
  dias: number;
  via: string;
  /** De dónde salen los días: los envíos de ese país, los de todos los países o lo típico de la vía. */
  base: "pais" | "todos" | "defecto";
  muestra: number;
  /** En palabras, para la ficha: «marítimo: 59 días (mediana de 306 envíos de este país)». */
  explicacion: string;
}

/**
 * La planificación de una compra: su fecha de envío más lo que tarda su vía en su país. Con varias vías (parte por mar y
 * parte por aire) se planifica con la más lenta. Sin fecha de envío no hay planificación (null).
 */
export function estimarPlanificacion(tiempos: TiemposTransito, clave: string, vias: string[], fechaEnvio: string | null): Estimacion | null {
  if (!fechaEnvio || !/^\d{4}-\d{2}-\d{2}/.test(fechaEnvio)) return null;
  const candidatas = (vias.length ? vias : ["mar"]).filter((v) => v in DIAS_POR_DEFECTO);
  let mejor: Omit<Estimacion, "planificacion" | "llegadaEstimada" | "explicacion"> | null = null;
  for (const via of candidatas.length ? candidatas : ["mar"]) {
    const delPais = tiempos.get(`${clave}|${via}`);
    const deTodos = tiempos.get(`*|${via}`);
    const t: Omit<Estimacion, "planificacion" | "llegadaEstimada" | "explicacion"> =
      delPais && delPais.muestra >= MIN_MUESTRA
        ? { dias: delPais.dias, via, base: "pais", muestra: delPais.muestra }
        : deTodos && deTodos.muestra >= MIN_MUESTRA
          ? { dias: deTodos.dias, via, base: "todos", muestra: deTodos.muestra }
          : { dias: DIAS_POR_DEFECTO[via], via, base: "defecto", muestra: 0 };
    if (!mejor || t.dias > mejor.dias) mejor = t;
  }
  const e = mejor!;
  const llegada = new Date(`${fechaEnvio.slice(0, 10)}T12:00:00Z`);
  llegada.setUTCDate(llegada.getUTCDate() + e.dias);
  const llegadaEstimada = llegada.toISOString().slice(0, 10);
  const de =
    e.base === "pais"
      ? `mediana de ${e.muestra} envío${e.muestra === 1 ? "" : "s"} de este país`
      : e.base === "todos"
        ? `mediana de ${e.muestra} envíos de todos los países; este país aún tiene pocos`
        : "lo típico de la vía; aún no hay envíos para medir";
  return { ...e, planificacion: mesPlanificacion(llegadaEstimada), llegadaEstimada, explicacion: `${NOMBRE_VIA[e.via]}: ${e.dias} días (${de})` };
}

/**
 * La planificación que le toca a una compra al cambiar sus datos: con fecha de envío, la calculada; si se le quitó la fecha
 * de envío, ninguna; si nunca tuvo (las de ClickUp planificadas a mano), se conserva la que tenía.
 */
export function nuevaPlanificacion(
  tiempos: TiemposTransito,
  antes: { fechaEnvio: string | null; planificacion: string | null } | null,
  despues: { clave: string; vias: string[]; fechaEnvio: string | null },
): string | null {
  const e = estimarPlanificacion(tiempos, despues.clave, despues.vias, despues.fechaEnvio);
  if (e) return e.planificacion;
  return antes && !antes.fechaEnvio ? antes.planificacion : null;
}
