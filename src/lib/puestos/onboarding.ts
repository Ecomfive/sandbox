// Equipo › Puestos: el avance del onboarding de una persona en un puesto (cursos aprobados + manuales leídos, por etapa).
// Lógica pura, con prueba en onboarding.test.ts.

import { ETAPAS, type Etapa } from "./puesto";

export interface Enlace {
  tipo: "curso" | "manual";
  id: string;
  etapa: Etapa | null;
  orden: number;
}

export interface Hechos {
  /** Cursos aprobados (id → cuándo). */
  cursosAprobados: Map<string, string>;
  /** Manuales leídos (id → cuándo). */
  lecturas: Map<string, string>;
  /** Última actualización de cada manual (id → cuándo). */
  manualActualizado: Map<string, string>;
  /** Los cursos que existen hoy (uno quitado del código no cuenta). */
  cursosExistentes: Set<string>;
}

export type EstadoEnlace = "hecho" | "pendiente" | "desactualizado";

/** Un manual leído antes de su última actualización cuenta como «desactualizado» (hay que volver a leerlo). */
export function estadoDe(e: Enlace, h: Hechos): EstadoEnlace {
  if (e.tipo === "curso") return h.cursosAprobados.has(e.id) ? "hecho" : "pendiente";
  const leido = h.lecturas.get(e.id);
  if (!leido) return "pendiente";
  const cambio = h.manualActualizado.get(e.id);
  return cambio && Date.parse(cambio) > Date.parse(leido) ? "desactualizado" : "hecho";
}

export interface AvanceEtapa {
  etapa: Etapa;
  hechos: number;
  total: number;
}

/** El avance por etapa (solo lo que es parte del onboarding: lo de consulta no cuenta) y el total. */
export function avanceOnboarding(enlaces: Enlace[], h: Hechos): { etapas: AvanceEtapa[]; hechos: number; total: number } {
  const validos = enlaces.filter((e) => e.etapa !== null && (e.tipo === "manual" || h.cursosExistentes.has(e.id)));
  const etapas = ETAPAS.map((etapa) => {
    const deEtapa = validos.filter((e) => e.etapa === etapa);
    return { etapa, hechos: deEtapa.filter((e) => estadoDe(e, h) === "hecho").length, total: deEtapa.length };
  }).filter((a) => a.total > 0);
  return { etapas, hechos: etapas.reduce((s, a) => s + a.hechos, 0), total: etapas.reduce((s, a) => s + a.total, 0) };
}

/** Texto corto del avance: «3 de 5». */
export const textoAvance = (a: { hechos: number; total: number }) => (a.total === 0 ? "Sin onboarding" : `${a.hechos} de ${a.total}`);
