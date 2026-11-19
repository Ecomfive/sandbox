// «Reparto elegido» de un movimiento del libro (pedido de María José, Oceans, 19 nov 2026): un gasto distribuido se
// reparte solo entre las tiendas que lo asumen, con el porcentaje de cada una, en vez de entre todas por la base del mes.
// Lo guarda `fin_movimiento_reparto` (migración 0984) y `fin_eerr_movimientos` parte el movimiento. Lógica pura: la usan
// la ficha del movimiento y `libro-movimientos/vinculos-actions.ts`. Prueba en `reparto-elegido.test.ts`.

export interface ParteReparto {
  unidadId: string;
  /** De 0 (sin incluir) a 100, con hasta 4 decimales. */
  porcentaje: number;
}

export const MAX_TIENDAS_REPARTO = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOLERANCIA = 0.01;

const redondear4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Partes iguales entre estas tiendas, que suman exactamente 100 (la última se lleva el resto). */
export function partesIguales(unidades: string[]): ParteReparto[] {
  if (!unidades.length) return [];
  const cada = redondear4(100 / unidades.length);
  return unidades.map((unidadId, i) => ({ unidadId, porcentaje: i === unidades.length - 1 ? redondear4(100 - cada * (unidades.length - 1)) : cada }));
}

/** Cuánto le toca a cada tienda de este monto (en centavos exactos: suman el monto). Mismo cálculo que la vista. */
export function montosDelReparto(monto: number, partes: ParteReparto[]): { unidadId: string; monto: number }[] {
  const total = partes.reduce((s, p) => s + p.porcentaje, 0);
  if (!total) return [];
  const ordenadas = [...partes].sort((a, b) => a.unidadId.localeCompare(b.unidadId));
  let acumulado = 0;
  return ordenadas.map((p) => {
    const desde = Math.round((monto * acumulado) / total * 100) / 100;
    acumulado += p.porcentaje;
    const hasta = Math.round((monto * acumulado) / total * 100) / 100;
    return { unidadId: p.unidadId, monto: Math.round((hasta - desde) * 100) / 100 };
  });
}

/**
 * Revisa el reparto que manda el navegador: tiendas válidas, sin repetir, de las permitidas, porcentajes de 0 a 100 que
 * suman 100. Una lista vacía quita el reparto (vuelve a la base del mes o a su tienda).
 */
export function validarReparto(valor: unknown, permitidas: Set<string>): { partes: ParteReparto[] } | { error: string } {
  if (!Array.isArray(valor)) return { error: "Reparto inválido." };
  if (valor.length === 0) return { partes: [] };
  if (valor.length === 1) return { error: "Elige al menos dos tiendas (para una sola, cambia la tienda del movimiento)." };
  if (valor.length > MAX_TIENDAS_REPARTO) return { error: "Demasiadas tiendas." };
  const vistas = new Set<string>();
  const partes: ParteReparto[] = [];
  for (const v of valor) {
    const f = v as { unidadId?: unknown; porcentaje?: unknown } | null;
    const unidadId = typeof f?.unidadId === "string" ? f.unidadId : "";
    const porcentaje = redondear4(Number(f?.porcentaje));
    if (!UUID.test(unidadId) || !permitidas.has(unidadId)) return { error: "Una de las tiendas no se puede elegir." };
    if (vistas.has(unidadId)) return { error: "Una tienda está repetida." };
    if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 100) return { error: "Cada porcentaje va de 0 a 100." };
    vistas.add(unidadId);
    partes.push({ unidadId, porcentaje });
  }
  const suma = partes.reduce((s, p) => s + p.porcentaje, 0);
  if (Math.abs(suma - 100) > TOLERANCIA) return { error: `Los porcentajes suman ${redondear4(suma)} %: tienen que sumar 100 %.` };
  return { partes };
}
