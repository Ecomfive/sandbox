// Asistente de IA de Gestión de IDs Dropi: las reglas que ya tiene el sistema para una publicación (largo y forma del título, fotos y
// descripción mínimas) puestas como criterios para la IA y como chequeos de lo que ella propone. Así la IA trabaja con las mismas
// reglas que la «Optimización en Dropi» y lo que no cumple se descarta o se marca antes de mostrarse. Sin base ni React, con prueba.

import { esSuplemento, palabrasEnIngles, tieneAngulo, tieneCantidad } from "../optimizacion";
import type { Reglas } from "../reglas";

/** Los números de las reglas que usa la IA (lo que dice la pantalla Reglas). */
export interface ReglasIA {
  minTitulo: number;
  maxTitulo: number;
  minFotos: number;
  minDescripcion: number;
}

/** De las reglas guardadas a lo que usa la IA. `min_titulo` puede no existir todavía en las reglas: se usa 35, lo que decidió el equipo. */
export function reglasParaIA(r: Pick<Reglas, "max_titulo" | "min_fotos" | "min_descripcion"> & { min_titulo?: number }): ReglasIA {
  return { minTitulo: r.min_titulo ?? 35, maxTitulo: r.max_titulo, minFotos: r.min_fotos, minDescripcion: r.min_descripcion };
}

export interface ChequeoTitulo {
  clave: "largo" | "espanol" | "cantidad" | "angulo";
  ok: boolean;
  /** Qué se vio («38 caracteres», «Palabras en inglés: hair»). */
  texto: string;
  /** Un chequeo que sí impide usar el título; los demás solo orientan. */
  obligatorio: boolean;
}

export interface ResultadoChequeo {
  chequeos: ChequeoTitulo[];
  /** Cumple todo lo obligatorio: largo, español y, en un suplemento, la cantidad. */
  cumple: boolean;
}

/**
 * Pasa un título por las mismas reglas de «Optimización en Dropi»: de `minTitulo` a `maxTitulo` caracteres, en español, con la cantidad
 * si es un suplemento y (solo orienta) que diga para qué sirve.
 */
export function chequearTitulo(titulo: string, categoria: string | null, r: Pick<ReglasIA, "minTitulo" | "maxTitulo">): ResultadoChequeo {
  const t = titulo.trim();
  const largo = t.length;
  const ingles = palabrasEnIngles(t);
  const suple = esSuplemento(t, categoria);
  const chequeos: ChequeoTitulo[] = [
    {
      clave: "largo",
      ok: largo >= r.minTitulo && largo <= r.maxTitulo,
      texto: largo > r.maxTitulo ? `${largo} caracteres: pasa del máximo de ${r.maxTitulo}` : largo < r.minTitulo ? `${largo} caracteres: faltan ${r.minTitulo - largo} para llegar a ${r.minTitulo}` : `${largo} caracteres`,
      obligatorio: true,
    },
    { clave: "espanol", ok: ingles.length === 0, texto: ingles.length ? `Palabras en inglés: ${ingles.join(", ")}` : "En español", obligatorio: true },
  ];
  if (suple) chequeos.push({ clave: "cantidad", ok: tieneCantidad(t), texto: tieneCantidad(t) ? "Dice la cantidad" : "Falta la cantidad (cápsulas, gomitas, tabletas)", obligatorio: true });
  chequeos.push({ clave: "angulo", ok: tieneAngulo(t), texto: tieneAngulo(t) ? "Dice para qué sirve" : "No dice para qué sirve", obligatorio: false });
  return { chequeos, cumple: chequeos.every((c) => !c.obligatorio || c.ok) };
}

/** Las reglas en palabras, para ponerlas en el pedido a la IA. */
export function textoCriterios(r: ReglasIA): string {
  return [
    `Título: de ${r.minTitulo} a ${r.maxTitulo} caracteres contando espacios (Dropi no admite más de ${r.maxTitulo}; menos de ${r.minTitulo} desaprovecha espacio), en español sin palabras en inglés, con la cantidad si es un suplemento (60 cápsulas, 30 gomitas), que diga para qué sirve («para…», «contra…», «alivio de…») y claro: no todo en mayúsculas.`,
    `Fotos: mínimo ${r.minFotos} por publicación.`,
    `Descripción: mínimo ${r.minDescripcion} caracteres.`,
  ].join("\n- ");
}

/** Las partes de la IA que el equipo puede orientar con indicaciones propias (Reglas › Indicaciones para la IA). */
export const CLAVES_INDICACION = ["general", "titulo", "descripcion", "fotos", "analisis"] as const;
export type ClaveIndicacion = (typeof CLAVES_INDICACION)[number];

export const ETIQUETA_INDICACION: Record<ClaveIndicacion, string> = {
  general: "Para todo",
  titulo: "Títulos",
  descripcion: "Descripción y ángulos de venta",
  fotos: "Fotos",
  analisis: "Análisis y sugerencias",
};

export type Indicaciones = Partial<Record<ClaveIndicacion, string>>;

/** Lo que el equipo escribió para esta parte (y lo de «Para todo»), listo para el pedido. Vacío si no hay nada. */
export function textoIndicaciones(ind: Indicaciones, parte: Exclude<ClaveIndicacion, "general">): string {
  const lineas = [ind.general, ind[parte]].map((t) => (t ?? "").trim()).filter(Boolean);
  return lineas.length ? `Indicaciones del equipo de Ecomfive (síguelas):\n- ${lineas.join("\n- ")}` : "";
}

export interface Ejemplos {
  /** Títulos que el equipo eligió (o corrigió y usó) en otras publicaciones: el estilo a seguir. */
  titulos: string[];
  /** Por qué el equipo rechazó recomendaciones de título: lo que hay que evitar. */
  rechazos: string[];
}

/** Los títulos aprobados y los rechazos anteriores, para que la IA se ajuste al estilo del equipo. Vacío si no hay nada. */
export function textoEjemplos(e: Ejemplos): string {
  const partes: string[] = [];
  if (e.titulos.length) partes.push(`Títulos que el equipo aprobó antes (imita su estilo, no los copies):\n- ${e.titulos.slice(0, 8).join("\n- ")}`);
  if (e.rechazos.length) partes.push(`Por qué el equipo rechazó sugerencias antes (evítalo):\n- ${e.rechazos.slice(0, 6).join("\n- ")}`);
  return partes.join("\n\n");
}
