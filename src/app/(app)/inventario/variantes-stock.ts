import { compararOpciones } from "@/lib/wms/talla";
import type { StockPlataformas } from "@/lib/wms/stock-plataformas";
import type { FilaStock } from "./def-stock";

const sumaPlataformas = (a: StockPlataformas | null, b: StockPlataformas | null): StockPlataformas | null => {
  if (!a) return b;
  if (!b) return a;
  return { dropi: a.dropi + b.dropi, effi: a.effi + b.effi, drop: a.drop + b.drop, dunamixfy: a.dunamixfy + b.dunamixfy, total: a.total + b.total, lineas: [...a.lineas, ...b.lineas] };
};

/**
 * Un producto con variantes como una sola fila (9 nov 2026, pedido de Hernán: las variantes se ven dentro de su producto): sus cifras suman las de sus
 * variantes (y las propias del principal, que casi siempre son solo lo que viene en camino), y las variantes quedan dentro, ordenadas por SKU.
 */
export function conSusVariantes(principal: FilaStock, variantes: FilaStock[]): FilaStock {
  const dentro = [...variantes].sort((a, b) => compararOpciones(a.opciones, b.opciones) || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
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
    generalPorBodega: principal.porBodega,
    // Cada variante sabe cuánto stock general queda en su producto, para decir «sale del general» solo donde es cierto.
    variantes: dentro.map((v) => ({ ...v, generalPorBodega: principal.porBodega })),
  };
}

/**
 * Si, mirando lo que se ve, queda stock general sin repartir entre las variantes (19 nov 2026, pedido de Jhokser: con el filtro de la bodega Despacho Plaza 100, donde ya estaba repartido, la fila
 * seguía diciendo «Stock sin repartir» porque en otras bodegas sí quedaba). Con una bodega elegida (el selector de arriba o el filtro «Bodega»), cuenta solo el stock general de esa bodega; sin
 * bodega, el de cualquiera. Sin el dato por bodega (una variante suelta), vale la marca del producto.
 */
export function sinRepartirEn(f: Pick<FilaStock, "repartoPendiente" | "generalPorBodega">, bodegaId: string | null | undefined): boolean {
  if (!f.repartoPendiente) return false;
  if (!f.generalPorBodega) return true;
  return bodegaId ? f.generalPorBodega.some((b) => b.bodegaId === bodegaId && b.fisico !== 0) : f.generalPorBodega.some((b) => b.fisico !== 0);
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
