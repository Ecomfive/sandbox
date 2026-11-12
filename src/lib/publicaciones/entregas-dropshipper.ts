/**
 * Quién vende un producto en Dropi (12 nov 2026, pedido de Alcides): los pedidos ENTREGADOS de sus IDs de Dropi repartidos por dropshipper.
 * Las filas salen de `crm_entregas_por_producto` (migración 0275); aquí solo se eligen las del periodo y se calcula la parte de cada uno.
 */

export type PeriodoEntregas = "30" | "90" | "total";

export const PERIODOS_ENTREGAS: { id: PeriodoEntregas; nombre: string }[] = [
  { id: "30", nombre: "30 días" },
  { id: "90", nombre: "90 días" },
  { id: "total", nombre: "Todo" },
];

/** Un dropshipper (o un usuario de Dropi sin vincular) con sus pedidos entregados de este producto. */
export interface EntregaDropshipper {
  /** null = el usuario de Dropi no está vinculado a ningún dropshipper del CRM. */
  dropshipperId: string | null;
  nombre: string | null;
  usuario: string | null;
  tienda: string | null;
  entregados30: number;
  entregados90: number;
  entregadosTotal: number;
  ultimo: string | null;
}

export interface FilaReparto extends EntregaDropshipper {
  entregados: number;
  /** Parte del total del periodo, de 0 a 1. */
  parte: number;
}

export function entregadosEn(e: EntregaDropshipper, periodo: PeriodoEntregas): number {
  return periodo === "30" ? e.entregados30 : periodo === "90" ? e.entregados90 : e.entregadosTotal;
}

/** Las filas del periodo (sin las que no entregaron nada en él), de más a menos entregados, con su parte del total. */
export function repartoEntregas(filas: EntregaDropshipper[], periodo: PeriodoEntregas): { filas: FilaReparto[]; total: number } {
  const conEntregas = filas.map((e) => ({ ...e, entregados: entregadosEn(e, periodo), parte: 0 })).filter((e) => e.entregados > 0);
  const total = conEntregas.reduce((s, e) => s + e.entregados, 0);
  for (const e of conEntregas) e.parte = total ? e.entregados / total : 0;
  conEntregas.sort((a, b) => b.entregados - a.entregados || (b.ultimo ?? "").localeCompare(a.ultimo ?? ""));
  return { filas: conEntregas, total };
}

/** Cómo se llama la fila: el dropshipper; si no está vinculado, su tienda o su usuario de Dropi. */
export function nombreDeFila(e: EntregaDropshipper): string {
  if (e.nombre) return e.nombre;
  if (e.tienda) return e.tienda;
  return e.usuario ? `Usuario ${e.usuario}` : "Usuario sin datos";
}

/** Convierte una fila de `crm_entregas_por_producto`. */
export function leerEntrega(f: Record<string, unknown>): EntregaDropshipper {
  const texto = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  return {
    dropshipperId: texto(f.dropshipper_id),
    nombre: texto(f.dropshipper_nombre),
    usuario: texto(f.usuario_externo),
    tienda: texto(f.tienda_nombre),
    entregados30: Number(f.entregados_30 ?? 0),
    entregados90: Number(f.entregados_90 ?? 0),
    entregadosTotal: Number(f.entregados_total ?? 0),
    ultimo: texto(f.ultimo_entregado)?.slice(0, 10) ?? null,
  };
}
