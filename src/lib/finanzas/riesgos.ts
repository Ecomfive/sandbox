// Matriz de riesgos financieros viva (Capital y riesgo › Riesgos, mejora 25, migración 0948). Lógica pura.
//
// Cada riesgo tiene probabilidad e impacto de 1 a 5, dueño y plan de mitigación. Si tiene un **indicador vivo** (calculado
// con datos del portal: concentración, semanas de caja, costo financiero, tipo de cambio, pauta, entrega, inventario lento,
// intercompañía, obligaciones fiscales), su probabilidad la decide el indicador con cuatro umbrales configurables (cada
// umbral cruzado sube un punto: 1 a 5); sin dato del indicador manda la probabilidad escrita a mano. El puntaje es
// probabilidad × impacto y el nivel sale de él (bajo ≤ 4, medio ≤ 9, alto ≤ 14, crítico ≥ 15). La tarea diaria guarda los
// cambios de nivel en el historial y deja una alerta `riesgo_sube` mientras el último cambio de un riesgo haya sido una
// subida. Prueba en `riesgos.test.ts`.

export const INDICADORES_RIESGO = [
  "concentracion_dropi",
  "concentracion_courier",
  "concentracion_proveedor",
  "liquidez_semanas",
  "costo_financiero",
  "tipo_cambio_crc",
  "pauta_ventas",
  "tasa_entrega",
  "inventario_lento",
  "intercompania",
  "fiscal_vencidas",
] as const;
export type IndicadorRiesgo = (typeof INDICADORES_RIESGO)[number];
export const esIndicadorRiesgo = (v: unknown): v is IndicadorRiesgo => typeof v === "string" && (INDICADORES_RIESGO as readonly string[]).includes(v);

export type UnidadIndicador = "porcentaje" | "semanas" | "dinero" | "cantidad";
export type Sentido = "mayor_peor" | "menor_peor";

export interface DefIndicadorRiesgo {
  clave: IndicadorRiesgo;
  etiqueta: string;
  unidad: UnidadIndicador;
  sentido: Sentido;
  /** Umbrales predeterminados (los que suben la probabilidad a 2, 3, 4 y 5). */
  umbrales: [number, number, number, number];
  /** De dónde sale, para la ficha. */
  fuente: string;
}

export const DEF_INDICADORES: Record<IndicadorRiesgo, DefIndicadorRiesgo> = {
  concentracion_dropi: { clave: "concentracion_dropi", etiqueta: "Ventas por Dropi", unidad: "porcentaje", sentido: "mayor_peor", umbrales: [30, 45, 60, 75], fuente: "Tiendas por mes del comité, últimos 3 meses cerrados" },
  concentracion_courier: { clave: "concentracion_courier", etiqueta: "Envíos del repartidor o courier principal", unidad: "porcentaje", sentido: "mayor_peor", umbrales: [30, 45, 60, 75], fuente: "Unidad económica por repartidor, últimos 3 meses" },
  concentracion_proveedor: { clave: "concentracion_proveedor", etiqueta: "Compras al proveedor principal", unidad: "porcentaje", sentido: "mayor_peor", umbrales: [30, 45, 60, 75], fuente: "Compras de Panamá de los últimos 12 meses" },
  liquidez_semanas: { clave: "liquidez_semanas", etiqueta: "Semanas de caja", unidad: "semanas", sentido: "menor_peor", umbrales: [12, 8, 5, 3], fuente: "Proyección de caja: caja de hoy ÷ salida semanal promedio" },
  costo_financiero: { clave: "costo_financiero", etiqueta: "Costo financiero mezclado", unidad: "porcentaje", sentido: "mayor_peor", umbrales: [10, 14, 18, 24], fuente: "Comité: intereses de 3 meses anualizados ÷ deuda promedio" },
  tipo_cambio_crc: { clave: "tipo_cambio_crc", etiqueta: "Movimiento del colón en 3 meses", unidad: "porcentaje", sentido: "mayor_peor", umbrales: [2, 4, 7, 10], fuente: "Tipos de cambio de cierre (CRC por USD)" },
  pauta_ventas: { clave: "pauta_ventas", etiqueta: "Pauta sobre ventas", unidad: "porcentaje", sentido: "mayor_peor", umbrales: [16, 20, 22, 26], fuente: "Comité: tiendas propias, último mes cerrado" },
  tasa_entrega: { clave: "tasa_entrega", etiqueta: "Tasa de entrega", unidad: "porcentaje", sentido: "menor_peor", umbrales: [80, 75, 70, 62], fuente: "Comité: tiendas propias, último mes cerrado" },
  inventario_lento: { clave: "inventario_lento", etiqueta: "Inventario sin salida en 90 días o más", unidad: "porcentaje", sentido: "mayor_peor", umbrales: [10, 20, 30, 45], fuente: "Inventario valorizado: % del valor" },
  intercompania: { clave: "intercompania", etiqueta: "Partidas intercompañía por mes", unidad: "dinero", sentido: "mayor_peor", umbrales: [5000, 15000, 30000, 60000], fuente: "EERR por partes: promedio de 3 meses cerrados" },
  fiscal_vencidas: { clave: "fiscal_vencidas", etiqueta: "Obligaciones fiscales vencidas sin presentar", unidad: "cantidad", sentido: "mayor_peor", umbrales: [1, 2, 3, 5], fuente: "Calendario fiscal" },
};

export const CATEGORIAS_RIESGO = ["concentracion", "liquidez", "financiero", "cambiario", "comercial", "operativo", "inventario", "intercompania", "fiscal", "otro"] as const;
export type CategoriaRiesgo = (typeof CATEGORIAS_RIESGO)[number];
export const ETIQUETA_CATEGORIA: Record<CategoriaRiesgo, string> = {
  concentracion: "Concentración",
  liquidez: "Liquidez",
  financiero: "Financiero",
  cambiario: "Tipo de cambio",
  comercial: "Comercial",
  operativo: "Operativo",
  inventario: "Inventario",
  intercompania: "Intercompañía",
  fiscal: "Fiscal",
  otro: "Otro",
};
export const esCategoriaRiesgo = (v: unknown): v is CategoriaRiesgo => typeof v === "string" && (CATEGORIAS_RIESGO as readonly string[]).includes(v);

export type NivelRiesgo = "bajo" | "medio" | "alto" | "critico";
export const NIVELES: NivelRiesgo[] = ["bajo", "medio", "alto", "critico"];
export const ETIQUETA_NIVEL: Record<NivelRiesgo, string> = { bajo: "Bajo", medio: "Medio", alto: "Alto", critico: "Crítico" };
export const TONO_NIVEL: Record<NivelRiesgo, "success" | "warning" | "destructive" | "neutral"> = { bajo: "success", medio: "neutral", alto: "warning", critico: "destructive" };
export const ordenNivel = (n: NivelRiesgo) => NIVELES.indexOf(n);

export function nivelDe(puntaje: number): NivelRiesgo {
  if (puntaje >= 15) return "critico";
  if (puntaje >= 10) return "alto";
  if (puntaje >= 5) return "medio";
  return "bajo";
}

export interface Riesgo {
  id: string;
  clave: string;
  nombre: string;
  categoria: CategoriaRiesgo;
  descripcion: string | null;
  probabilidadManual: number;
  impacto: number;
  dueno: string | null;
  mitigacion: string | null;
  indicador: IndicadorRiesgo | null;
  /** Umbrales propios (null = los del indicador). */
  umbrales: [number, number, number, number] | null;
  activo: boolean;
  /** Lo último que guardó la evaluación. */
  nivelGuardado: NivelRiesgo | null;
  evaluadoEn: string | null;
}

export interface ValorIndicador {
  valor: number | null;
  /** Qué falta, o una precisión del dato. */
  nota: string | null;
}

/** La probabilidad (1–5) que da un valor: un punto más por cada umbral cruzado. */
export function probabilidadPorIndicador(valor: number, umbrales: readonly number[], sentido: Sentido): number {
  let p = 1;
  for (const u of umbrales) if (sentido === "mayor_peor" ? valor >= u : valor <= u) p++;
  return Math.min(p, 5);
}

/** Los umbrales tienen que ir en el sentido del indicador (crecientes si más es peor, decrecientes si menos es peor). */
export function umbralesValidos(u: readonly number[], sentido: Sentido): boolean {
  if (u.length !== 4 || u.some((x) => !Number.isFinite(x))) return false;
  for (let i = 1; i < 4; i++) if (sentido === "mayor_peor" ? u[i] < u[i - 1] : u[i] > u[i - 1]) return false;
  return true;
}

export interface RiesgoEvaluado extends Riesgo {
  probabilidad: number;
  fuente: "indicador" | "manual";
  valor: number | null;
  notaIndicador: string | null;
  puntaje: number;
  nivel: NivelRiesgo;
  /** El nivel cambió desde la última evaluación guardada. */
  cambio: "sube" | "baja" | null;
}

export function evaluarRiesgo(r: Riesgo, valores: Map<IndicadorRiesgo, ValorIndicador>): RiesgoEvaluado {
  const def = r.indicador ? DEF_INDICADORES[r.indicador] : null;
  const v = r.indicador ? valores.get(r.indicador) : undefined;
  const conDato = def && v && v.valor !== null;
  const probabilidad = conDato ? probabilidadPorIndicador(v!.valor!, r.umbrales ?? def!.umbrales, def!.sentido) : r.probabilidadManual;
  const puntaje = probabilidad * r.impacto;
  const nivel = nivelDe(puntaje);
  const cambio = r.nivelGuardado && r.nivelGuardado !== nivel ? (ordenNivel(nivel) > ordenNivel(r.nivelGuardado) ? "sube" : "baja") : null;
  return { ...r, probabilidad, fuente: conDato ? "indicador" : "manual", valor: v?.valor ?? null, notaIndicador: v?.nota ?? null, puntaje, nivel, cambio };
}

export function evaluarRiesgos(rs: Riesgo[], valores: Map<IndicadorRiesgo, ValorIndicador>): RiesgoEvaluado[] {
  return rs
    .filter((r) => r.activo)
    .map((r) => evaluarRiesgo(r, valores))
    .sort((a, b) => b.puntaje - a.puntaje || b.impacto - a.impacto || a.nombre.localeCompare(b.nombre));
}

/** El mapa de calor 5 × 5: filas de impacto 5 a 1, columnas de probabilidad 1 a 5, con los riesgos de cada celda. */
export function mapaCalor(rs: RiesgoEvaluado[]): { impacto: number; celdas: { probabilidad: number; nivel: NivelRiesgo; riesgos: RiesgoEvaluado[] }[] }[] {
  return [5, 4, 3, 2, 1].map((impacto) => ({
    impacto,
    celdas: [1, 2, 3, 4, 5].map((probabilidad) => ({
      probabilidad,
      nivel: nivelDe(probabilidad * impacto),
      riesgos: rs.filter((r) => r.impacto === impacto && r.probabilidad === probabilidad),
    })),
  }));
}

// ---------------------------------------------------------------------------------------------
// Historial y alertas
// ---------------------------------------------------------------------------------------------
export interface CambioNivel {
  riesgoId: string;
  antes: NivelRiesgo | null;
  despues: NivelRiesgo;
  probabilidad: number;
  impacto: number;
  valor: number | null;
  origen: "auto" | "manual";
}

/**
 * Los cambios de nivel que hay que guardar: los riesgos cuyo nivel es distinto del guardado (y los que nunca se
 * evaluaron, como punto de partida, sin alerta).
 */
export function cambiosDeNivel(rs: RiesgoEvaluado[], origen: "auto" | "manual" = "auto"): CambioNivel[] {
  return rs
    .filter((r) => r.nivelGuardado !== r.nivel)
    .map((r) => ({ riesgoId: r.id, antes: r.nivelGuardado, despues: r.nivel, probabilidad: r.probabilidad, impacto: r.impacto, valor: r.valor, origen }));
}

export interface UltimoCambio {
  riesgoId: string;
  antes: NivelRiesgo | null;
  despues: NivelRiesgo;
  fecha: string;
}

export interface AlertaRiesgo {
  clave: string;
  severidad: "info" | "aviso" | "critica";
  mensaje: string;
}

/**
 * Las alertas `riesgo_sube`: una por riesgo cuyo **último** cambio de nivel fue una subida (y sigue en ese nivel o más).
 * Bajar de nivel la resuelve. La clave lleva el nivel, así una nueva subida es una alerta nueva.
 */
export function alertasRiesgo(rs: RiesgoEvaluado[], ultimos: Map<string, UltimoCambio>): AlertaRiesgo[] {
  const out: AlertaRiesgo[] = [];
  for (const r of rs) {
    const u = ultimos.get(r.id);
    if (!u || !u.antes || ordenNivel(u.despues) <= ordenNivel(u.antes)) continue;
    if (ordenNivel(r.nivel) < ordenNivel(u.despues)) continue;
    const def = r.indicador ? DEF_INDICADORES[r.indicador] : null;
    const dato = def && r.valor !== null ? ` (${def.etiqueta}: ${formatoIndicador(def.unidad, r.valor)})` : "";
    out.push({
      clave: `riesgo:${r.clave}:${u.despues}`.slice(0, 200),
      severidad: r.nivel === "critico" ? "critica" : r.nivel === "alto" ? "aviso" : "info",
      mensaje: `${r.nombre}: subió de ${ETIQUETA_NIVEL[u.antes].toLowerCase()} a ${ETIQUETA_NIVEL[u.despues].toLowerCase()}${dato}.${r.dueno ? ` Dueño: ${r.dueno}.` : ""}`.slice(0, 500),
    });
  }
  return out;
}

/** El valor de un indicador en texto corto (para mensajes: sin depender del formato de la página). */
export function formatoIndicador(u: UnidadIndicador, v: number): string {
  if (u === "porcentaje") return `${v.toFixed(1)} %`;
  if (u === "semanas") return `${v.toFixed(1)} semanas`;
  if (u === "dinero") return `$${Math.round(v).toLocaleString("en-US")}`;
  return String(Math.round(v));
}

// ---------------------------------------------------------------------------------------------
// Validación de lo que llega del navegador
// ---------------------------------------------------------------------------------------------
export interface RiesgoEditable {
  nombre: string;
  categoria: CategoriaRiesgo;
  descripcion: string | null;
  probabilidadManual: number;
  impacto: number;
  dueno: string | null;
  mitigacion: string | null;
  indicador: IndicadorRiesgo | null;
  umbrales: [number, number, number, number] | null;
}

const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const entero15 = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

export function validarRiesgo(leer: (campo: string) => unknown): RiesgoEditable | { error: string } {
  const nombre = texto(leer("nombre"), 120);
  if (!nombre) return { error: "Escribe el nombre del riesgo." };
  const categoria = leer("categoria");
  if (!esCategoriaRiesgo(categoria)) return { error: "Elige la categoría." };
  const p = entero15(leer("probabilidad"));
  const i = entero15(leer("impacto"));
  if (p === null) return { error: "La probabilidad va de 1 a 5." };
  if (i === null) return { error: "El impacto va de 1 a 5." };
  const ind = leer("indicador");
  const indicador = ind === "" || ind === null || ind === undefined ? null : esIndicadorRiesgo(ind) ? ind : undefined;
  if (indicador === undefined) return { error: "Indicador desconocido." };
  let umbrales: [number, number, number, number] | null = null;
  const crudos = [1, 2, 3, 4].map((k) => leer(`umbral${k}`));
  if (indicador && crudos.some((c) => typeof c === "string" && c.trim() !== "")) {
    const u = crudos.map((c) => Number(String(c ?? "").replace(",", ".")));
    if (!umbralesValidos(u, DEF_INDICADORES[indicador].sentido)) {
      return { error: DEF_INDICADORES[indicador].sentido === "mayor_peor" ? "Los cuatro umbrales van de menor a mayor." : "Los cuatro umbrales van de mayor a menor." };
    }
    umbrales = u as [number, number, number, number];
  }
  return {
    nombre,
    categoria,
    descripcion: texto(leer("descripcion"), 1000),
    probabilidadManual: p,
    impacto: i,
    dueno: texto(leer("dueno"), 120),
    mitigacion: texto(leer("mitigacion"), 2000),
    indicador,
    umbrales,
  };
}

/** Una clave estable a partir del nombre (para los riesgos que se agregan desde la página). */
export function claveDeNombre(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 50) || "riesgo"
  );
}

export function leerRiesgo(f: Record<string, unknown>): Riesgo {
  const u = Array.isArray(f.umbrales) && f.umbrales.length === 4 && f.umbrales.every((x) => Number.isFinite(Number(x))) ? (f.umbrales.map(Number) as [number, number, number, number]) : null;
  const nivel = typeof f.nivel_actual === "string" && (NIVELES as string[]).includes(f.nivel_actual) ? (f.nivel_actual as NivelRiesgo) : null;
  return {
    id: String(f.id),
    clave: String(f.clave ?? ""),
    nombre: String(f.nombre ?? ""),
    categoria: esCategoriaRiesgo(f.categoria) ? f.categoria : "otro",
    descripcion: (f.descripcion as string | null) ?? null,
    probabilidadManual: entero15(f.probabilidad) ?? 3,
    impacto: entero15(f.impacto) ?? 3,
    dueno: (f.dueno as string | null) ?? null,
    mitigacion: (f.mitigacion as string | null) ?? null,
    indicador: esIndicadorRiesgo(f.indicador) ? f.indicador : null,
    umbrales: u,
    activo: f.activo !== false,
    nivelGuardado: nivel,
    evaluadoEn: (f.evaluado_en as string | null) ?? null,
  };
}
