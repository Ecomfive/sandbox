// Asistente de IA de Gestión de IDs Dropi: las reglas que ya tiene el sistema para una publicación (largo y forma del título, fotos y
// descripción mínimas) puestas como criterios para la IA y como chequeos de lo que ella propone. Así la IA trabaja con las mismas
// reglas que la «Optimización en Dropi» y lo que no cumple se descarta o se marca antes de mostrarse. Sin base ni React, con prueba.

import { ABREVIATURAS_CANTIDAD, esSuplemento, palabrasEnIngles, tieneAngulo, tieneCantidad } from "../optimizacion";
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
  clave: "largo" | "espanol" | "formato" | "cantidad" | "angulo";
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
export function chequearTitulo(titulo: string, categoria: string | null, r: Pick<ReglasIA, "minTitulo" | "maxTitulo">, nombreProducto?: string | null): ResultadoChequeo {
  const t = titulo.trim();
  const largo = t.length;
  const ingles = palabrasEnIngles(t, nombreProducto);
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
  const letras = t.replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ]/g, "");
  const mayusculas = letras.length >= 8 && letras === letras.toUpperCase();
  const palabras = t.split(/\s+/).filter(Boolean).length;
  chequeos.push({ clave: "formato", ok: !mayusculas && palabras >= 3, texto: mayusculas ? "Todo en mayúsculas" : palabras < 3 ? "Muy corto" : "Claro", obligatorio: true });
  if (suple) chequeos.push({ clave: "cantidad", ok: tieneCantidad(t), texto: tieneCantidad(t) ? "Dice la cantidad" : "Falta la cantidad (30c, 30go, 30t, 30sg)", obligatorio: true });
  chequeos.push({ clave: "angulo", ok: tieneAngulo(t), texto: tieneAngulo(t) ? "Dice para qué sirve" : "No dice para qué sirve", obligatorio: false });
  return { chequeos, cumple: chequeos.every((c) => !c.obligatorio || c.ok) };
}

/** Las reglas en palabras, para ponerlas en el pedido a la IA. */
export function textoCriterios(r: ReglasIA): string {
  return [
    `Título: de ${r.minTitulo} a ${r.maxTitulo} caracteres contando espacios (Dropi no admite más de ${r.maxTitulo}; menos de ${r.minTitulo} desaprovecha espacio). Orden: el nombre del producto, la cantidad y el uso principal. El nombre del producto va tal cual aunque esté en inglés («15 Days Cleanse»); lo que se le agrega va en español. Si es un suplemento, la cantidad; si no cabe completa, abreviada: ${ABREVIATURAS_CANTIDAD.map((a) => `30${a.abrev} = 30 ${a.nombre}`).join(", ")} (mejor abreviar que dejar fuera el uso). El uso puede ir directo, sin «para» («Limpieza Intestinal»). Claro: no todo en mayúsculas. Ejemplo: «15 Days Cleanse 30c Limpieza Intestinal».`,
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
  /** Nombres en Dropi que el equipo cambió a mano en la ficha (antes → después): el criterio más directo del equipo. */
  correcciones?: Correccion[];
}

export interface Correccion {
  antes: string;
  despues: string;
}

/** Cuántas correcciones a mano se pasan a la IA en cada pedido (las más nuevas). */
export const MAX_CORRECCIONES = 12;

/**
 * Los cambios de nombre hechos a mano en la ficha de una publicación, desde la auditoría (`editar_publicacion_dropi`, dato «Producto»),
 * con las filas de la más nueva a la más vieja: el último cambio de cada publicación (los anteriores son pasos intermedios), sin vacíos,
 * sin «—», sin cambios que no cambian nada y un solo cambio por nombre final. Una fila que también trae «SKU» no es de la ficha (la
 * escribió un script de revisión de vínculos) y no cuenta.
 */
export function correccionesDeAuditoria(filas: { antes: unknown; despues: unknown; entidad_id?: string | null }[], max = MAX_CORRECCIONES): Correccion[] {
  const out: Correccion[] = [];
  const vistos = new Set<string>();
  const publicaciones = new Set<string>();
  const leer = (o: unknown) => {
    const v = o && typeof o === "object" ? (o as Record<string, unknown>).Producto : null;
    const t = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
    return t && t !== "—" ? t : "";
  };
  for (const f of filas) {
    if (f.despues && typeof f.despues === "object" && "SKU" in f.despues) continue;
    if (f.entidad_id) {
      if (publicaciones.has(f.entidad_id)) continue;
      publicaciones.add(f.entidad_id);
    }
    const antes = leer(f.antes);
    const despues = leer(f.despues);
    if (!antes || !despues || antes === despues) continue;
    const clave = despues.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ antes, despues });
    if (out.length >= max) break;
  }
  return out;
}

/** Los títulos aprobados y los rechazos anteriores, para que la IA se ajuste al estilo del equipo. Vacío si no hay nada. */
export function textoEjemplos(e: Ejemplos): string {
  const partes: string[] = [];
  const correcciones = e.correcciones ?? [];
  if (correcciones.length)
    partes.push(
      `Nombres que el equipo corrigió a mano en Dropi (antes → después). Es lo que más pesa: entiende por qué se cambió cada uno y escribe con ese mismo criterio, sin copiarlos:\n- ${correcciones
        .slice(0, MAX_CORRECCIONES)
        .map((c) => `«${c.antes}» → «${c.despues}»`)
        .join("\n- ")}`,
    );
  if (e.titulos.length) partes.push(`Títulos que el equipo aprobó antes (imita su estilo, no los copies):\n- ${e.titulos.slice(0, 8).join("\n- ")}`);
  if (e.rechazos.length) partes.push(`Por qué el equipo rechazó sugerencias antes (evítalo):\n- ${e.rechazos.slice(0, 6).join("\n- ")}`);
  return partes.join("\n\n");
}
