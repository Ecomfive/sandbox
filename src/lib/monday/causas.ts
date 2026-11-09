// Monday.com en el portal: causas de rechazo y entregas. Lógica pura: a qué causa del catálogo editable (con sus palabras
// clave, o una asignación a mano de un texto) va cada texto libre del tablero, el peso de cada causa en pedidos y en
// dinero, por tienda y por courier, y el resumen por mes (tasa de entrega, pedidos sin estado a los 10 días y el
// indicador «despachados con estado en Monday ≥ 95 % a los 10 días»). Prueba en `causas.test.ts`.

import { normalizar } from "../finanzas/clasificacion";
import { FINALES, type GrupoEstado } from "./columnas";

export interface Causa {
  codigo: string;
  nombre: string;
  palabras: string[];
  orden: number;
  activo: boolean;
}

export const CAUSA_OTRA = "otro";
/** Meta del indicador: despachados con estado final en Monday a los 10 días. */
export const META_CON_ESTADO = 95;
export const DIAS_ESTADO = 10;

export const normalizarTexto = (t: string | null | undefined) => normalizar(t ?? "").slice(0, 300);

export const esCodigoCausa = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(v);

/** Las palabras escritas por una persona (separadas por comas), normalizadas y sin repetir. */
export function leerPalabras(texto: string): string[] {
  return [...new Set(texto.split(/[,\n;]/).map((p) => normalizar(p)).filter((p) => p.length >= 2))].slice(0, 40);
}

/** Un código a partir del nombre de una causa nueva. */
export const codigoDeNombre = (nombre: string) =>
  normalizar(nombre)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40) || "causa";

/** La causa de un texto libre: la asignada a mano, la primera del catálogo (por orden) cuyas palabras aparecen, u «otro». */
export function causaDeTexto(texto: string | null, catalogo: Causa[], aMano: Map<string, string>): string | null {
  const n = normalizarTexto(texto);
  if (!n) return null;
  const manual = aMano.get(n);
  if (manual) return manual;
  const activas = catalogo.filter((c) => c.activo && c.codigo !== CAUSA_OTRA).sort((a, b) => a.orden - b.orden);
  for (const c of activas) if (c.palabras.some((p) => p && n.includes(normalizar(p)))) return c.codigo;
  return CAUSA_OTRA;
}

export interface DespachoAnalisis {
  periodo: string | null;
  unidadId: string | null;
  tienda: string | null;
  courier: string | null;
  estadoGrupo: GrupoEstado;
  causa: string | null;
  fechaDespacho: string | null;
  /** Total de la orden enlazada (venta que se pierde si se rechaza). */
  monto: number;
  /** Lo que costó llevarla (repartidor). */
  costoEnvio: number;
}

export interface PesoCausa {
  codigo: string;
  pedidos: number;
  pctPedidos: number;
  dinero: number;
  pctDinero: number;
  costoEnvio: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** El peso de cada causa entre los rechazados (pedidos, venta perdida y costo de envío), de mayor a menor. */
export function pesoCausas(despachos: DespachoAnalisis[]): PesoCausa[] {
  const rech = despachos.filter((d) => d.estadoGrupo === "rechazado");
  const total = rech.length;
  const dineroTotal = rech.reduce((a, d) => a + d.monto, 0);
  const m = new Map<string, PesoCausa>();
  for (const d of rech) {
    const k = d.causa ?? "sin_causa";
    const x = m.get(k) ?? { codigo: k, pedidos: 0, pctPedidos: 0, dinero: 0, pctDinero: 0, costoEnvio: 0 };
    x.pedidos++;
    x.dinero += d.monto;
    x.costoEnvio += d.costoEnvio;
    m.set(k, x);
  }
  return [...m.values()]
    .map((x) => ({ ...x, dinero: r2(x.dinero), costoEnvio: r2(x.costoEnvio), pctPedidos: total ? (x.pedidos / total) * 100 : 0, pctDinero: dineroTotal ? (x.dinero / dineroTotal) * 100 : 0 }))
    .sort((a, b) => b.pedidos - a.pedidos || b.dinero - a.dinero);
}

export interface FilaDimension {
  clave: string;
  despachados: number;
  entregados: number;
  rechazados: number;
  tasaEntrega: number | null;
  dineroPerdido: number;
  /** Pedidos rechazados por causa. */
  causas: Record<string, number>;
}

/** Por tienda o por courier: despachados, entregados, rechazados, tasa de entrega, venta perdida y causas. */
export function porDimension(despachos: DespachoAnalisis[], dim: "tienda" | "courier"): FilaDimension[] {
  const m = new Map<string, FilaDimension>();
  for (const d of despachos) {
    if (!esDespachado(d)) continue;
    const k = (dim === "tienda" ? d.tienda : d.courier)?.trim() || "Sin dato";
    const x = m.get(k) ?? { clave: k, despachados: 0, entregados: 0, rechazados: 0, tasaEntrega: null, dineroPerdido: 0, causas: {} };
    x.despachados++;
    if (d.estadoGrupo === "entregado") x.entregados++;
    if (d.estadoGrupo === "rechazado") {
      x.rechazados++;
      x.dineroPerdido += d.monto;
      const c = d.causa ?? "sin_causa";
      x.causas[c] = (x.causas[c] ?? 0) + 1;
    }
    m.set(k, x);
  }
  return [...m.values()]
    .map((x) => ({ ...x, dineroPerdido: r2(x.dineroPerdido), tasaEntrega: x.despachados ? (x.entregados / x.despachados) * 100 : null }))
    .sort((a, b) => b.despachados - a.despachados);
}

/** Despachado = tiene fecha de despacho o un estado que no es «sin estado» ni «cancelado». */
export const esDespachado = (d: Pick<DespachoAnalisis, "fechaDespacho" | "estadoGrupo">) =>
  d.estadoGrupo !== "cancelado" && (Boolean(d.fechaDespacho) || d.estadoGrupo !== "sin_estado");

const restarDias = (fecha: string, n: number) => {
  const t = Date.parse(`${fecha}T00:00:00Z`) - n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
};

export interface ResumenMes {
  periodo: string;
  despachados: number;
  entregados: number;
  rechazados: number;
  /** Despachados hace más de 10 días (a la fecha de corte). */
  elegibles: number;
  /** De esos, con estado final en Monday. */
  conEstado: number;
  tasaEntrega: number | null;
  pctSinEstado: number | null;
  pctConEstado: number | null;
}

/** El resumen por mes (de la orden o, sin orden, del despacho), opcionalmente solo de unas tiendas. */
export function resumenPorMes(despachos: DespachoAnalisis[], corte: string, unidades?: Set<string>): Map<string, ResumenMes> {
  const limite = restarDias(corte, DIAS_ESTADO);
  const m = new Map<string, ResumenMes>();
  for (const d of despachos) {
    if (!d.periodo || !esDespachado(d)) continue;
    if (unidades && (!d.unidadId || !unidades.has(d.unidadId))) continue;
    const x = m.get(d.periodo) ?? { periodo: d.periodo, despachados: 0, entregados: 0, rechazados: 0, elegibles: 0, conEstado: 0, tasaEntrega: null, pctSinEstado: null, pctConEstado: null };
    x.despachados++;
    if (d.estadoGrupo === "entregado") x.entregados++;
    if (d.estadoGrupo === "rechazado") x.rechazados++;
    if (d.fechaDespacho && d.fechaDespacho <= limite) {
      x.elegibles++;
      if (FINALES.has(d.estadoGrupo)) x.conEstado++;
    }
    m.set(d.periodo, x);
  }
  for (const x of m.values()) {
    x.tasaEntrega = x.despachados ? (x.entregados / x.despachados) * 100 : null;
    x.pctConEstado = x.elegibles ? (x.conEstado / x.elegibles) * 100 : null;
    x.pctSinEstado = x.pctConEstado === null ? null : 100 - x.pctConEstado;
  }
  return m;
}

/** Los textos de causa que cayeron en «otro» (para asignarlos a mano), de más a menos frecuentes. */
export function textosSinCausa(rechazados: { texto: string | null; codigo: string | null }[], limite = 30): { texto: string; pedidos: number }[] {
  const m = new Map<string, number>();
  for (const r of rechazados) {
    const n = normalizarTexto(r.texto);
    if (n && r.codigo === CAUSA_OTRA) m.set(n, (m.get(n) ?? 0) + 1);
  }
  return [...m].map(([texto, pedidos]) => ({ texto, pedidos })).sort((a, b) => b.pedidos - a.pedidos).slice(0, limite);
}
