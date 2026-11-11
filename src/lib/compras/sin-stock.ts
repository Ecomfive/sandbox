// Compras › Sin stock (pedido de Alcides, 27 oct 2026; migración 0167): qué productos se quedaron sin stock en Dropi, a partir de las
// publicaciones del país y de la última lectura de «Mis productos». Sin base ni React, con prueba.

export interface PublicacionParaStock {
  nombre: string;
  dropiIds: string[];
  skuId: string | null;
  skuNombre: string | null;
  /** Se sigue vendiendo o reponiendo: no está archivada del todo (una pausada por falta de stock sí cuenta). */
  viva: boolean;
}

export interface EstadoProducto {
  /** «sku:<uuid>» (el producto vinculado, con todos sus IDs) o «dropi:<ID>» (sin vincular). */
  clave: string;
  skuId: string | null;
  nombre: string;
  dropiIds: string[];
  /** Unidades en Dropi (público + reservadas a privados) de todos sus IDs; null si la lectura no trae ninguno. */
  stock: number | null;
}

export const DECISIONES = [
  { valor: "comprar", etiqueta: "Comprar" },
  { valor: "inventario_manual", etiqueta: "Hay inventario manual" },
  { valor: "no_reponer", etiqueta: "No reponer" },
] as const;
export type Decision = (typeof DECISIONES)[number]["valor"];

export const esDecision = (v: unknown): v is Decision => DECISIONES.some((d) => d.valor === v);

/**
 * El stock en Dropi de cada producto: las publicaciones vivas del mismo producto vinculado se juntan (todos sus IDs, públicos y privados);
 * una sin vincular cuenta sola, por su primer ID. `stock` = suma de lo que la lectura trae de esos IDs (cada ID una vez).
 */
export function estadoDeProductos(pubs: PublicacionParaStock[], stockPorId: Map<string, number>): EstadoProducto[] {
  const grupos = new Map<string, { skuId: string | null; nombre: string; ids: Set<string> }>();
  for (const p of pubs) {
    if (!p.viva || !p.dropiIds.length) continue;
    const clave = p.skuId ? `sku:${p.skuId}` : `dropi:${p.dropiIds[0]}`;
    const g =
      grupos.get(clave) ??
      grupos
        .set(clave, {
          skuId: p.skuId,
          nombre: p.skuNombre || p.nombre,
          ids: new Set(),
        })
        .get(clave)!;
    p.dropiIds.forEach((id) => g.ids.add(id));
  }
  return [...grupos].map(([clave, g]) => {
    const ids = [...g.ids];
    const leidos = ids.filter((id) => stockPorId.has(id));
    return {
      clave,
      skuId: g.skuId,
      nombre: g.nombre,
      dropiIds: ids,
      stock: leidos.length ? leidos.reduce((t, id) => t + (stockPorId.get(id) ?? 0), 0) : null,
    };
  });
}

/**
 * Qué alertas abrir y cuáles cerrar: se abre una para cada producto sin stock que no tiene una alerta viva (abierta o revisada); se cierra
 * la alerta viva de un producto al que Dropi le vuelve a ver unidades. Lo que la lectura no trae (sin datos, o archivado del todo) no
 * abre ni cierra nada.
 */
export function conciliarAlertas(productos: EstadoProducto[], vivas: { id: string; clave: string }[]): { abrir: EstadoProducto[]; cerrar: string[] } {
  const viva = new Map(vivas.map((a) => [a.clave, a.id]));
  const abrir = productos.filter((p) => p.stock !== null && p.stock <= 0 && !viva.has(p.clave));
  const conStock = new Set(productos.filter((p) => p.stock !== null && p.stock > 0).map((p) => p.clave));
  return {
    abrir,
    cerrar: vivas.filter((a) => conStock.has(a.clave)).map((a) => a.id),
  };
}
