// A qué producto se le cuenta lo que viene en camino (26 oct 2026, pedido de Jhokser: una orden de una máquina de vapor venía en camino y su
// publicación de Dropi no lo marcaba). Una orden trae líneas de productos, pero lo que se vende no siempre es ese mismo producto:
//  - una **variante** suma al producto del que es variante;
//  - un **combo** («Pack 2», 2x1) se arma con productos simples: si la orden es del simple, el combo también tiene unidades en camino
//    (las que se pueden armar: de cada componente, las unidades entre lo que lleva cada combo, y el menor de todos); y si la orden es del
//    combo, sus componentes también (unidades × lo que lleva cada combo).
// Sin base ni red, con prueba.

export interface LineaDeOrden {
  compraId: string;
  skuId: string;
  unidades: number;
}

export interface ComponenteDeCombo {
  comboId: string;
  componenteId: string;
  /** Cuántas unidades del componente lleva un combo. */
  cantidad: number;
}

/** Las unidades que una orden le aporta a un producto. */
export interface Aporte {
  compraId: string;
  unidades: number;
}

/**
 * Las unidades en camino de cada producto, orden por orden. `padres` dice de qué producto es variante cada variante; `componentes`, de qué
 * se arma cada combo. Un producto sin nada en camino no aparece.
 */
export function repartirEnCamino(lineas: LineaDeOrden[], padres: Map<string, string>, componentes: ComponenteDeCombo[]): Map<string, Aporte[]> {
  const deCombo = new Map<string, ComponenteDeCombo[]>();
  for (const c of componentes) deCombo.set(c.comboId, [...(deCombo.get(c.comboId) ?? []), c]);

  // producto → orden → unidades
  const total = new Map<string, Map<string, number>>();
  // Lo mismo, pero solo con lo que se pidió de productos que no son combos (de ahí salen los combos que se pueden armar).
  const sueltos = new Map<string, Map<string, number>>();
  const sumar = (mapa: Map<string, Map<string, number>>, sku: string, compraId: string, n: number) => {
    const porOrden = mapa.get(sku) ?? new Map<string, number>();
    porOrden.set(compraId, (porOrden.get(compraId) ?? 0) + n);
    mapa.set(sku, porOrden);
  };
  /** El producto y, si es variante, el producto del que es variante. */
  const destinos = (sku: string) => [...new Set([sku, padres.get(sku)].filter((x): x is string => !!x))];

  for (const l of lineas) {
    if (!l.skuId || !(l.unidades > 0)) continue;
    const esCombo = deCombo.has(l.skuId);
    for (const id of destinos(l.skuId)) {
      sumar(total, id, l.compraId, l.unidades);
      if (!esCombo) sumar(sueltos, id, l.compraId, l.unidades);
    }
    // La orden es de un combo: también trae sus componentes.
    if (esCombo) for (const c of deCombo.get(l.skuId)!) for (const id of destinos(c.componenteId)) sumar(total, id, l.compraId, l.unidades * c.cantidad);
  }

  // Los combos que se pueden armar con lo que viene de sus componentes, en cada orden donde vienen todos.
  for (const [comboId, comps] of deCombo) {
    const ordenes = comps.map((c) => new Set(sueltos.get(c.componenteId)?.keys() ?? []));
    for (const compraId of ordenes[0] ?? []) {
      if (!ordenes.every((o) => o.has(compraId))) continue;
      const armables = Math.min(...comps.map((c) => Math.floor((sueltos.get(c.componenteId)?.get(compraId) ?? 0) / c.cantidad)));
      if (armables > 0) sumar(total, comboId, compraId, armables);
    }
  }

  const salida = new Map<string, Aporte[]>();
  for (const [sku, porOrden] of total) salida.set(sku, [...porOrden].map(([compraId, unidades]) => ({ compraId, unidades })));
  return salida;
}
