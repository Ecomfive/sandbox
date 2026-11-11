// Portal AF4 360° › Planificación › Metas por tienda (mejora 16). Las metas bajan del plan anual aprobado (su foto
// guardada) y se comparan mes a mes con lo real. Lógica pura; prueba en `metas-plan.test.ts`.
//
// Semáforo (cumple / cerca / lejos):
//  * Ventas, pedidos y EBITDA (más es mejor): cumple desde el 97 % de la meta, cerca desde el 90 %. Con una meta de EBITDA
//    negativa la tolerancia se mide sobre su valor absoluto.
//  * Tasa de entrega: cumple hasta 1 punto bajo la meta, cerca hasta 3.
//  * Pauta sobre ventas (menos es mejor): cumple hasta 0,5 puntos sobre la meta, cerca hasta 2.

import type { DatosFoto, HistoriaMes } from "./planificacion";

export type IndicadorMeta = "ventas" | "pedidos" | "tasaEntrega" | "pauta" | "ebitda";
export type EstadoMeta = "cumple" | "cerca" | "lejos" | "sin_datos";

export const INDICADORES_META: { clave: IndicadorMeta; etiqueta: string; formato: "dinero" | "entero" | "porcentaje" }[] = [
  { clave: "ventas", etiqueta: "Ventas", formato: "dinero" },
  { clave: "pedidos", etiqueta: "Pedidos", formato: "entero" },
  { clave: "tasaEntrega", etiqueta: "Tasa de entrega", formato: "porcentaje" },
  { clave: "pauta", etiqueta: "Pauta sobre ventas", formato: "porcentaje" },
  { clave: "ebitda", etiqueta: "EBITDA", formato: "dinero" },
];

export const ETIQUETA_ESTADO_META: Record<EstadoMeta, string> = { cumple: "En meta", cerca: "Cerca", lejos: "Lejos", sin_datos: "Sin datos" };

export type ValoresMeta = Record<IndicadorMeta, number | null>;

const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? r2((a / b) * 100) : null);

/** Metas por tienda y mes desde la foto del plan aprobado. */
export function metasDeFoto(foto: DatosFoto | null): Map<string, Map<string, ValoresMeta>> {
  const salida = new Map<string, Map<string, ValoresMeta>>();
  for (const t of foto?.tiendas ?? []) {
    const porMes = new Map<string, ValoresMeta>();
    for (const m of t.meses) {
      porMes.set(m.periodo, { ventas: m.ventas, pedidos: Math.round(m.pedidos), tasaEntrega: pct(m.ingresos, m.ventas), pauta: pct(m.pauta, m.ventas), ebitda: m.ebitda });
    }
    salida.set(t.id, porMes);
  }
  return salida;
}

/** Lo real de una tienda en un mes (de la historia de órdenes y el EBITDA del EERR de la tienda). */
export function realDeHistoria(h: HistoriaMes | undefined, ebitda: number | null): ValoresMeta {
  if (!h) return { ventas: null, pedidos: null, tasaEntrega: null, pauta: null, ebitda };
  return { ventas: r2(h.ventas), pedidos: h.pedidos, tasaEntrega: pct(h.entregado, h.ventas), pauta: pct(h.marketing, h.ventas), ebitda };
}

export function evaluarMeta(indicador: IndicadorMeta, meta: number | null, real: number | null): EstadoMeta {
  if (meta === null || real === null) return "sin_datos";
  if (indicador === "tasaEntrega") return real >= meta - 1 ? "cumple" : real >= meta - 3 ? "cerca" : "lejos";
  if (indicador === "pauta") return real <= meta + 0.5 ? "cumple" : real <= meta + 2 ? "cerca" : "lejos";
  if (meta > 0) return real >= meta * 0.97 ? "cumple" : real >= meta * 0.9 ? "cerca" : "lejos";
  // Meta cero o negativa (EBITDA): la tolerancia sobre su valor absoluto (o 1 dólar si es cero).
  const base = Math.max(1, Math.abs(meta));
  return real >= meta - base * 0.03 ? "cumple" : real >= meta - base * 0.1 ? "cerca" : "lejos";
}

/** Suma de meses (ventas, pedidos, EBITDA) o promedio ponderado por ventas (tasa de entrega y pauta). */
export function acumular(lista: ValoresMeta[]): ValoresMeta {
  const con = (k: IndicadorMeta) => lista.filter((v) => v[k] !== null);
  const suma = (k: IndicadorMeta) => (con(k).length ? r2(con(k).reduce((a, v) => a + (v[k] as number), 0)) : null);
  const ponderado = (k: "tasaEntrega" | "pauta") => {
    const c = lista.filter((v) => v[k] !== null && v.ventas !== null && (v.ventas as number) > 0);
    const peso = c.reduce((a, v) => a + (v.ventas as number), 0);
    return peso > 0 ? r2(c.reduce((a, v) => a + (v[k] as number) * (v.ventas as number), 0) / peso) : null;
  };
  return { ventas: suma("ventas"), pedidos: suma("pedidos"), tasaEntrega: ponderado("tasaEntrega"), pauta: ponderado("pauta"), ebitda: suma("ebitda") };
}

export interface FilaMetaTienda {
  unidadId: string;
  meta: ValoresMeta;
  real: ValoresMeta;
  estado: Record<IndicadorMeta, EstadoMeta>;
  /** Cuántos indicadores con dato están en meta. */
  enMeta: number;
  conDato: number;
}

export function filaMeta(unidadId: string, meta: ValoresMeta, real: ValoresMeta): FilaMetaTienda {
  const estado = Object.fromEntries(INDICADORES_META.map((d) => [d.clave, evaluarMeta(d.clave, meta[d.clave], real[d.clave])])) as Record<IndicadorMeta, EstadoMeta>;
  const valores = Object.values(estado);
  return { unidadId, meta, real, estado, enMeta: valores.filter((e) => e === "cumple").length, conDato: valores.filter((e) => e !== "sin_datos").length };
}

/** El estado general de una tienda: el peor de sus indicadores con dato. */
export function estadoGeneral(f: FilaMetaTienda): EstadoMeta {
  const v = Object.values(f.estado).filter((e) => e !== "sin_datos");
  if (!v.length) return "sin_datos";
  return v.includes("lejos") ? "lejos" : v.includes("cerca") ? "cerca" : "cumple";
}
