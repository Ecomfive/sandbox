// Confirmación con IA › revisión del equipo (16 nov 2026, pedido de Hernán): los asesores marcan con botones lo correcto de un pedido (los que las IA no pudieron decidir, y los que ya salieron
// «listos» o «falta un dato» por si algo está mal) y esas respuestas vuelven a la IA como ejemplos. Lógica pura, con su prueba: qué es una respuesta válida, si coincide con lo que propuso el
// sistema, el resultado final de un pedido (lo que dijo el equipo manda sobre lo que dijo la IA) y qué ejemplos entran al pedido de la IA.

import type { EstadoAnalisis } from "./combinar";
import { etiquetaDeZona } from "./combinar";
import type { Zona } from "./zonas";

/** Lo que manda el navegador al marcar un pedido: el visto bueno a lo que propuso el sistema, o lo correcto (con la ciudad si el pedido no la traía). */
export type DecisionRevision = { acierto: true } | { completa: boolean; zona?: Zona | null; falta?: string | null; ciudad?: string | null };

/** Lo que se puede marcar con un botón cuando falta un dato (se puede escribir otra cosa). Escritas para pedirlas al cliente («¿Nos puedes escribir …?»). */
export const FALTAS_RAPIDAS = [
  "el número de casa o un punto de referencia",
  "la calle o el sector",
  "la ciudad o el corregimiento",
  "el número de apartamento u oficina",
  "el nombre del edificio o de la urbanización",
] as const;

/** Lo que el equipo dice que es lo correcto. */
export interface Veredicto {
  completa: boolean;
  /** Solo si está completa y el país distingue ciudad e interior. */
  zona: Zona | null;
  /** Solo si está incompleta: lo que hay que pedirle al cliente. */
  falta: string | null;
}

/** Lo que el sistema propuso para el pedido. */
export interface Propuesta {
  estado: EstadoAnalisis;
  zona: Zona | null;
}

/**
 * Si lo que dijo el equipo es lo que el sistema había propuesto. `null` cuando el sistema no había propuesto nada (las IA no coincidieron o fallaron): ahí no hay acierto ni error que contar.
 * Un «falta un dato» coincide con otro «falta un dato» aunque el dato sea distinto; un «listo» coincide si también está completa y, donde se distingue, es la misma zona.
 */
export function coincideConPropuesta(p: Propuesta, v: Veredicto, distingueZona: boolean): boolean | null {
  if (p.estado === "revisar" || p.estado === "error" || p.estado === "adelantado") return null;
  if (p.estado === "falta_dato") return !v.completa;
  return v.completa && (!distingueZona || p.zona === v.zona);
}

const limpiar = (t: unknown, max: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Revisa lo que llegó del navegador y lo deja limpio: completa con zona (si el país la distingue) o incompleta con lo que falta. */
export function revisarVeredicto(d: { completa?: unknown; zona?: unknown; falta?: unknown }, distingueZona: boolean): { error: string } | { veredicto: Veredicto } {
  if (typeof d?.completa !== "boolean") return { error: "Elige si la dirección está completa o falta un dato." };
  if (!d.completa) {
    const falta = limpiar(d.falta, 200);
    if (falta.length < 3) return { error: "Elige o escribe qué le falta a la dirección." };
    return { veredicto: { completa: false, zona: null, falta } };
  }
  if (!distingueZona) return { veredicto: { completa: true, zona: null, falta: null } };
  if (d.zona !== "ciudad" && d.zona !== "interior") return { error: "Elige si es ciudad o interior." };
  return { veredicto: { completa: true, zona: d.zona, falta: null } };
}

/** Lo que dejó escrito el equipo sobre un pedido. */
export interface RevisionPedido extends Veredicto {
  /** Coincide con lo que había propuesto el sistema (`null`: no había propuesta). */
  ok: boolean | null;
  por: string | null;
  en: string;
}

export interface ResultadoPedido {
  estado: EstadoAnalisis;
  zona: Zona | null;
  etiqueta: string | null;
  falta: string | null;
}

/** El resultado de un pedido: si el equipo lo revisó, manda lo que dijo; si no, lo que propuso el sistema. */
export function resultadoFinal(
  f: { estado: EstadoAnalisis; zona: Zona | null; etiqueta: string | null; falta: string | null; revision: RevisionPedido | null },
  config: { etiquetaCiudad: string | null; etiquetaInterior: string | null },
): ResultadoPedido {
  const r = f.revision;
  if (!r) return { estado: f.estado, zona: f.zona, etiqueta: f.etiqueta, falta: f.falta };
  if (!r.completa) return { estado: "falta_dato", zona: null, etiqueta: null, falta: r.falta };
  return { estado: "listo", zona: r.zona, etiqueta: etiquetaDeZona(r.zona, config), falta: null };
}

/** Cuánto acertó el sistema entre los pedidos que había propuesto y el equipo revisó. */
export function acierto(filas: { revision: { ok: boolean | null } | null }[]): { revisados: number; conPropuesta: number; acertados: number } {
  const revisadas = filas.filter((f) => f.revision);
  const conPropuesta = revisadas.filter((f) => f.revision!.ok !== null);
  return { revisados: revisadas.length, conPropuesta: conPropuesta.length, acertados: conPropuesta.filter((f) => f.revision!.ok === true).length };
}

/**
 * Los ejemplos que entran al pedido de la IA, de los más recientes a los más viejos: de las completas, repartidas por igual entre ciudad, interior y sin zona (si no, la IA aprende solo del
 * lado del que más se corrige); de las incompletas, las más recientes.
 */
export function seleccionarEjemplos<T extends { completa: boolean; zona: Zona | null }>(recientesPrimero: T[], porTipo: number): T[] {
  const grupos: T[][] = [[], [], []];
  for (const e of recientesPrimero.filter((x) => x.completa)) grupos[e.zona === "ciudad" ? 0 : e.zona === "interior" ? 1 : 2].push(e);
  const completas: T[] = [];
  for (let i = 0; completas.length < porTipo && grupos.some((g) => i < g.length); i += 1) for (const g of grupos) if (i < g.length && completas.length < porTipo) completas.push(g[i]);
  return [...completas, ...recientesPrimero.filter((x) => !x.completa).slice(0, porTipo)];
}

/** Lo que falta de la dirección de un pedido según lo que vale hoy: lo que marcó el equipo, o lo que dijo la IA si nadie lo revisó. Null si ya no le falta nada. */
export function faltaVigente(a: { estado?: unknown; falta?: unknown; rev_en?: unknown; rev_completa?: unknown; rev_falta?: unknown }): string | null {
  if (a.rev_en) return a.rev_completa === false ? ((a.rev_falta as string | null) ?? null) : null;
  return a.estado === "falta_dato" ? ((a.falta as string | null) ?? null) : null;
}
