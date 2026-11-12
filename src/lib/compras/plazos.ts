// Plazos por etapa y prioridades de Compras (reunión con Alcides del 11 nov 2026; prototipo aprobado por Hernán). Los usan la lista de
// Compras, el portal de Shen Zhen y su Tablero (que es el mismo portal). Lógica pura, con prueba (`plazos.test.ts`).
//
//   01 - Cotizar               Francis la envía a cotizar en 48 h (2 días).
//   02 - Enviado a cotización  el proveedor cotiza en 48 h; nunca más de 5 días.
//   03 - Cotizado              Ecomfive decide (comprar o descartar) en 2 días.
//   04 - En Producción         máximo 15 días.
//   05 - Tracking              el plazo prometido del país y la vía (Compras › Envíos), contado desde la fecha de envío.

const DIA = 86_400_000;

/** Las prioridades, de la más a la menos urgente. «Media» se guarda como `normal` (lo que la base ya aceptaba, migración 0076). */
export const PRIORIDADES = [
  { valor: "urgente", etiqueta: "Urgente" },
  { valor: "alta", etiqueta: "Alta" },
  { valor: "normal", etiqueta: "Media" },
  { valor: "baja", etiqueta: "Baja" },
] as const;
export type Prioridad = (typeof PRIORIDADES)[number]["valor"];

const ORDEN_PRIORIDAD: Record<string, number> = Object.fromEntries(PRIORIDADES.map((p, i) => [p.valor, i]));

/** Para ordenar: urgente primero; sin prioridad, al final. */
export const ordenPrioridad = (p: string | null | undefined): number => ORDEN_PRIORIDAD[p ?? ""] ?? PRIORIDADES.length;

export const esPrioridad = (p: unknown): p is Prioridad => typeof p === "string" && p in ORDEN_PRIORIDAD;

export const etiquetaPrioridad = (p: string | null | undefined): string => PRIORIDADES.find((x) => x.valor === p)?.etiqueta ?? "Sin prioridad";

/** El color de cada prioridad (el del prototipo aprobado): urgente en rojo, alta en ámbar, media en el morado del sistema y baja en gris. */
const COLOR_PRIORIDAD: Record<string, string> = { urgente: "#d92d20", alta: "#d97706", normal: "#8a35c9", baja: "#8d8d8d" };
export const colorPrioridad = (p: string): string | undefined => COLOR_PRIORIDAD[p];

/** Días de plazo de cada etapa (la de Tracking depende del país y la vía, ver `plazoDeCompra`). */
export const PLAZO_ETAPA: Readonly<Record<string, number>> = {
  cotizar: 2,
  enviado_cotizacion: 5,
  cotizado: 2,
  produccion: 15,
};

/** Lo que se espera del proveedor al cotizar (48 h); el máximo es `PLAZO_ETAPA.enviado_cotizacion`. */
export const META_COTIZAR_DIAS = 2;

export type TonoPlazo = "ok" | "aviso" | "vencido";

export interface EstadoPlazo {
  /** Días enteros que lleva en la etapa. */
  dias: number;
  plazo: number;
  tono: TonoPlazo;
  /** Días enteros desde que venció (0 si venció hace menos de un día o no venció). */
  vencidoHace: number;
  /** Cuánto del plazo ya pasó, de 0 a 100. */
  pct: number;
}

/** Un instante: una fecha sola («2026-11-03») cuenta desde la medianoche de Panamá. */
function instante(fecha: string): number {
  return Date.parse(fecha.length === 10 ? `${fecha}T00:00:00-05:00` : fecha);
}

/**
 * Cómo va una compra contra su plazo: en verde mientras queda tiempo, en ámbar en el último día (o el último 10 % de un plazo largo) y
 * en rojo cuando ya pasó. Se mide en horas: 48 h vencen a las 48 h, no al terminar el segundo día.
 */
export function estadoPlazo(desde: string, plazo: number, ahora: number): EstadoPlazo | null {
  const inicio = instante(desde);
  if (!Number.isFinite(inicio) || !(plazo > 0)) return null;
  const transcurrido = Math.max(0, ahora - inicio);
  const limite = plazo * DIA;
  const vencido = transcurrido > limite;
  const aviso = !vencido && limite - transcurrido <= Math.max(DIA, limite * 0.1);
  return {
    dias: Math.floor(transcurrido / DIA),
    plazo,
    tono: vencido ? "vencido" : aviso ? "aviso" : "ok",
    vencidoHace: vencido ? Math.floor((transcurrido - limite) / DIA) : 0,
    pct: Math.min(100, Math.round((transcurrido / limite) * 100)),
  };
}

export interface CompraConPlazo {
  etapa: string;
  etapaDesde: string | null;
  fechaEnvio: string | null;
  fechaLlegada?: string | null;
}

/**
 * El plazo de la etapa en que está la compra, o `null` si su etapa no tiene plazo (Backlog, Arribo, cerradas) o no se sabe desde cuándo
 * está en ella. En Tracking cuenta desde la fecha de envío (o, sin ella, desde que pasó a Tracking) contra `plazoTransito`, el plazo del
 * país y la vía; sin plazo conocido, no se mide.
 */
export function plazoDeCompra(c: CompraConPlazo, plazoTransito: number | null, ahora: number): EstadoPlazo | null {
  if (c.etapa === "tracking") {
    const desde = c.fechaEnvio ?? c.etapaDesde;
    if (!desde || c.fechaLlegada || plazoTransito == null) return null;
    return estadoPlazo(desde, plazoTransito, ahora);
  }
  const plazo = PLAZO_ETAPA[c.etapa];
  if (plazo === undefined || !c.etapaDesde) return null;
  return estadoPlazo(c.etapaDesde, plazo, ahora);
}

/** «3 d de 5 d», «Vence hoy» o «Vencido hace 2 d» (en español; el portal tiene sus propios textos). */
export function textoPlazoEtapa(e: EstadoPlazo): string {
  if (e.tono === "vencido") return e.vencidoHace > 0 ? `Vencido hace ${e.vencidoHace} d` : "Vencido hoy";
  return `${e.dias} d de ${e.plazo} d`;
}

/** Clave de un plazo de tránsito: agente (vacío = cualquiera), país y vía. */
export const clavePlazoTransito = (agente: string | null, pais: string | null, via: string) => `${(agente ?? "").trim().toLowerCase()}|${pais ?? ""}|${via}`;

/** Plazos de tránsito de Compras › Envíos: el máximo prometido de cada agente, país y vía, y de cualquier agente para ese país y vía. */
export function plazosTransitoDeRutas(rutas: { agente: string | null; pais: string | null; via: string; diasMin: number | null; diasMax: number | null }[]): Record<string, number> {
  const plazos: Record<string, number> = {};
  for (const r of rutas) {
    const dias = r.diasMax ?? r.diasMin;
    if (dias == null || !(dias > 0)) continue;
    for (const clave of [clavePlazoTransito(r.agente, r.pais, r.via), clavePlazoTransito(null, r.pais, r.via)]) plazos[clave] = Math.max(plazos[clave] ?? 0, dias);
  }
  return plazos;
}

/** El plazo de tránsito de una compra: el de su agente para su país y vía; si no, el de cualquier agente. Aéreo solo si es lo único que lleva. */
export function plazoTransitoDe(plazos: Record<string, number>, c: { agenteEnvio: string | null; paisCodigo: string | null; viaEnvio: string[] }): number | null {
  const via = c.viaEnvio.length === 1 ? c.viaEnvio[0] : "mar";
  return plazos[clavePlazoTransito(c.agenteEnvio, c.paisCodigo, via)] ?? plazos[clavePlazoTransito(null, c.paisCodigo, via)] ?? null;
}
