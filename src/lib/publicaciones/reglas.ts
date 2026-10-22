// Gestión de IDs Dropi › Reglas (migración 0127, 21 oct 2026): los umbrales con que el sistema calcula las acciones y las
// recomendaciones dejan de estar fijos en el código. La forma de cada regla sigue en el código (automatico.ts,
// recomendaciones.ts); aquí solo los números, con su valor de siempre como respaldo. Sin base ni React, con prueba.

export type UnidadRegla = "porcentaje" | "unidades" | "dias";

export interface DefRegla {
  clave: ClaveRegla;
  etiqueta: string;
  /** Qué decide este número, en una frase (se ve en la pantalla de Reglas). */
  descripcion: string;
  unidad: UnidadRegla;
  /** El valor de siempre (en porcentaje, una fracción: 0.3 = 30 %). */
  defecto: number;
  min: number;
  max: number;
  grupo: "margen" | "ventas" | "combo" | "optimizacion" | "tareas";
}

export type ClaveRegla =
  | "margen_minimo"
  | "margen_critico"
  | "margen_sano"
  | "caida_ventas"
  | "min_ventas_antes"
  | "dias_nuevo"
  | "combo_min_ventas"
  | "combo_descuento"
  | "dias_plazo"
  | "max_titulo"
  | "min_fotos"
  | "min_descripcion";

export const REGLAS: DefRegla[] = [
  { clave: "margen_minimo", grupo: "margen", etiqueta: "Margen bruto mínimo", descripcion: "Por debajo, la publicación sale en «Margen bajo» y recibe recomendaciones de precio o combo.", unidad: "porcentaje", defecto: 0.3, min: 0.05, max: 0.8 },
  { clave: "margen_critico", grupo: "margen", etiqueta: "Margen crítico", descripcion: "Por debajo, el margen se marca como crítico. No se recomienda bajar el precio si quedaría por debajo de este margen.", unidad: "porcentaje", defecto: 0.2, min: 0, max: 0.6 },
  { clave: "margen_sano", grupo: "margen", etiqueta: "Margen saludable", descripcion: "Desde este margen se considera saludable.", unidad: "porcentaje", defecto: 0.4, min: 0.1, max: 0.9 },
  { clave: "caida_ventas", grupo: "ventas", etiqueta: "Caída de ventas", descripcion: "Sale en «Ventas en caída» si en 30 días vende menos que este porcentaje de los 30 días anteriores.", unidad: "porcentaje", defecto: 0.5, min: 0.05, max: 0.95 },
  { clave: "min_ventas_antes", grupo: "ventas", etiqueta: "Ventas mínimas para comparar", descripcion: "La caída solo se mide si en los 30 días anteriores vendió al menos esto.", unidad: "unidades", defecto: 10, min: 1, max: 1000 },
  { clave: "dias_nuevo", grupo: "ventas", etiqueta: "Días de producto nuevo", descripcion: "Un producto publicado hace menos de estos días todavía no se verifica con su dropshipper.", unidad: "dias", defecto: 30, min: 1, max: 365 },
  { clave: "combo_min_ventas", grupo: "combo", etiqueta: "Ventas mínimas para sugerir un combo", descripcion: "Solo se sugiere un combo x2 si vendió al menos esto en 30 días.", unidad: "unidades", defecto: 5, min: 0, max: 1000 },
  { clave: "max_titulo", grupo: "optimizacion", etiqueta: "Largo máximo del título", descripcion: "Un título de Dropi con más caracteres se recomienda acortar.", unidad: "unidades", defecto: 30, min: 10, max: 200 },
  { clave: "min_fotos", grupo: "optimizacion", etiqueta: "Fotos mínimas por publicación", descripcion: "Con menos fotos en Dropi, se recomienda agregar más.", unidad: "unidades", defecto: 7, min: 1, max: 30 },
  { clave: "min_descripcion", grupo: "optimizacion", etiqueta: "Largo mínimo de la descripción", descripcion: "Con menos caracteres en la descripción de Dropi, se recomienda mejorarla (Dropi pide 200).", unidad: "unidades", defecto: 200, min: 50, max: 5000 },
  { clave: "dias_plazo", grupo: "tareas", etiqueta: "Plazo para hacer una recomendación aceptada", descripcion: "Pasado este plazo sin hacerse, la tarea sale como atrasada.", unidad: "dias", defecto: 7, min: 1, max: 90 },
  { clave: "combo_descuento", grupo: "combo", etiqueta: "Descuento del combo x2", descripcion: "El precio sugerido del combo es el de dos unidades menos este descuento.", unidad: "porcentaje", defecto: 0.1, min: 0, max: 0.5 },
];

export type Reglas = Record<ClaveRegla, number>;

export const REGLAS_DEFECTO: Reglas = Object.fromEntries(REGLAS.map((r) => [r.clave, r.defecto])) as Reglas;

export const defRegla = (clave: string) => REGLAS.find((r) => r.clave === clave);

/** Junta lo guardado con los valores de siempre: lo que falte o esté fuera de rango queda en su valor de siempre. */
export function reglasDesde(filas: { clave: string; valor: number | string | null }[]): Reglas {
  const out = { ...REGLAS_DEFECTO };
  for (const f of filas) {
    const d = defRegla(f.clave);
    const v = f.valor === null ? NaN : Number(f.valor);
    if (d && Number.isFinite(v) && v >= d.min && v <= d.max) out[d.clave] = v;
  }
  return out;
}

/**
 * Lee lo que se escribe en la pantalla (un porcentaje como «25» o «25,5»; unidades y días enteros) y lo deja como se guarda.
 * Devuelve el error en palabras si no sirve.
 */
export function leerValorRegla(clave: ClaveRegla, texto: string): { valor: number } | { error: string } {
  const d = defRegla(clave)!;
  const limpio = texto.trim().replace(",", ".").replace(/\s*%$/, "");
  if (!limpio) return { error: `${d.etiqueta}: escribe un valor.` };
  const n = Number(limpio);
  if (!Number.isFinite(n)) return { error: `${d.etiqueta}: «${texto}» no es un número.` };
  if (d.unidad !== "porcentaje" && !Number.isInteger(n)) return { error: `${d.etiqueta}: debe ser un número entero.` };
  const valor = d.unidad === "porcentaje" ? Math.round(n * 10) / 1000 : n;
  if (valor < d.min || valor > d.max) return { error: `${d.etiqueta}: debe estar entre ${mostrarRegla(d, d.min)} y ${mostrarRegla(d, d.max)}.` };
  return { valor };
}

/** Las reglas tienen que tener sentido entre sí. */
export function revisarReglas(r: Reglas): string | null {
  if (r.margen_critico >= r.margen_minimo) return "El margen crítico debe ser menor que el margen mínimo.";
  if (r.margen_minimo >= r.margen_sano) return "El margen mínimo debe ser menor que el margen saludable.";
  return null;
}

const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString("es-PA")} %`;

export function mostrarRegla(d: Pick<DefRegla, "unidad">, valor: number): string {
  if (d.unidad === "porcentaje") return pct(valor);
  return `${valor.toLocaleString("es-PA")} ${d.unidad === "dias" ? (valor === 1 ? "día" : "días") : valor === 1 ? "unidad" : "unidades"}`;
}

/** Cómo se escribe el valor en su campo (un porcentaje sin el «%»). */
export const valorEnCampo = (d: Pick<DefRegla, "unidad">, valor: number) => (d.unidad === "porcentaje" ? String(Math.round(valor * 1000) / 10) : String(valor));

/** El nivel del margen según las reglas: crítico, bajo, aceptable o saludable. */
export type NivelMargen = "critico" | "bajo" | "aceptable" | "sano";

export function nivelMargen(margen: number | null, r: Pick<Reglas, "margen_critico" | "margen_minimo" | "margen_sano">): NivelMargen | null {
  if (margen === null) return null;
  if (margen < r.margen_critico) return "critico";
  if (margen < r.margen_minimo) return "bajo";
  if (margen < r.margen_sano) return "aceptable";
  return "sano";
}
