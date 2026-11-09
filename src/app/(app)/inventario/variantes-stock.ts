import type { StockPlataformas } from "@/lib/wms/stock-plataformas";
import type { FilaStock } from "./def-stock";

const sumaPlataformas = (a: StockPlataformas | null, b: StockPlataformas | null): StockPlataformas | null => {
  if (!a) return b;
  if (!b) return a;
  return { dropi: a.dropi + b.dropi, effi: a.effi + b.effi, drop: a.drop + b.drop, total: a.total + b.total, lineas: [...a.lineas, ...b.lineas] };
};

/**
 * Un producto con variantes como una sola fila (9 nov 2026, pedido de Hernán: las variantes se ven dentro de su producto): sus cifras suman las de sus
 * variantes (y las propias del principal, que casi siempre son solo lo que viene en camino), y las variantes quedan dentro, ordenadas por SKU.
 */
export function conSusVariantes(principal: FilaStock, variantes: FilaStock[]): FilaStock {
  const dentro = [...variantes].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  const todos = [principal, ...dentro];
  const suma = (valor: (f: FilaStock) => number) => todos.reduce((t, f) => t + valor(f), 0);
  const porBodega = new Map<string, number>();
  for (const f of todos) for (const b of f.porBodega) porBodega.set(b.bodegaId, (porBodega.get(b.bodegaId) ?? 0) + b.fisico);
  return {
    ...principal,
    fisico: suma((f) => f.fisico),
    reservado: suma((f) => f.reservado),
    disponible: suma((f) => f.disponible),
    danado: suma((f) => f.danado),
    inspeccion: suma((f) => f.inspeccion),
    retenido: suma((f) => f.retenido),
    enCamino: suma((f) => f.enCamino),
    vencido: suma((f) => f.vencido),
    cajas: suma((f) => f.cajas),
    unidadesEnCajas: suma((f) => f.unidadesEnCajas),
    manejaVencimiento: todos.some((f) => f.manejaVencimiento),
    plataformas: todos.reduce<StockPlataformas | null>((t, f) => sumaPlataformas(t, f.plataformas), null),
    porBodega: [...porBodega].map(([bodegaId, fisico]) => ({ bodegaId, fisico })),
    variantes: dentro,
  };
}

/**
 * Mete cada variante dentro de su producto principal, que pasa a ser la fila con la suma. Una variante cuyo principal no está en la lista (por ejemplo
 * un filtro del servidor) sale sola, como antes.
 */
export function agruparVariantes(filas: FilaStock[]): FilaStock[] {
  const ids = new Set(filas.map((f) => f.id));
  const hijosDe = new Map<string, FilaStock[]>();
  for (const f of filas) if (f.padreId && ids.has(f.padreId)) hijosDe.set(f.padreId, [...(hijosDe.get(f.padreId) ?? []), f]);
  return filas.filter((f) => !(f.padreId && ids.has(f.padreId))).map((f) => (hijosDe.has(f.id) ? conSusVariantes(f, hijosDe.get(f.id)!) : f));
}

/** Todas las filas, con las variantes de cada producto a continuación (para buscar una por su id, p. ej. al abrir su ficha). */
export const aplanarVariantes = (filas: FilaStock[]): FilaStock[] => filas.flatMap((f) => [f, ...f.variantes]);
