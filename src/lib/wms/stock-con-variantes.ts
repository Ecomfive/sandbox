// La ficha del producto principal en Inventario muestra, en cada bodega, lo de todo el producto: su stock general más lo que ya está repartido en sus variantes (19 nov 2026, pedido de
// Jhokser: el Ventilador Portátil MF019 Mini tenía 146 en Despacho Plaza 100, ya repartidos al color Blanco, y la ficha del principal parecía decir que ahí no había nada). La cifra de cada
// bodega es la SUMA (general + variantes), así que no se cuenta dos veces; el detalle de quién tiene qué va debajo como partes de esa suma. Lógica pura, con su prueba.

/** Las cubetas de stock que se muestran por bodega. */
export interface Cubetas {
  fisico: number;
  reservado: number;
  disponible: number;
  danado: number;
  inspeccion: number;
  retenido: number;
  vencido: number;
  enCamino: number;
}

export type CubetasDeBodega = Cubetas & { bodegaId: string };

/** Una variante con su stock en cada bodega del país. */
export interface VarianteConStock {
  id: string;
  /** Cómo se llama en pantalla («Blanco», «M», «Beige / L»). */
  etiqueta: string;
  bodegas: CubetasDeBodega[];
}

/** Lo que una parte de una bodega (el stock general o una variante) aporta al total de esa bodega. */
export interface ParteDeBodega {
  /** `general` o el id de la variante. */
  clave: string;
  nombre: string;
  general: boolean;
  cubetas: Cubetas;
}

export interface BodegaConPartes<T extends CubetasDeBodega> {
  bodega: T;
  /** Lo de todo el producto en esa bodega: el stock general más el de sus variantes. */
  total: Cubetas;
  /** Quién tiene cada parte (primero el stock general, luego cada variante); vacío si no hay stock de ninguna variante, porque entonces el total ya es el general. */
  partes: ParteDeBodega[];
}

const CLAVES: (keyof Cubetas)[] = ["fisico", "reservado", "disponible", "danado", "inspeccion", "retenido", "vencido", "enCamino"];

export const cubetasVacias = (): Cubetas => ({ fisico: 0, reservado: 0, disponible: 0, danado: 0, inspeccion: 0, retenido: 0, vencido: 0, enCamino: 0 });

const soloCubetas = (c: Cubetas): Cubetas => ({ fisico: c.fisico, reservado: c.reservado, disponible: c.disponible, danado: c.danado, inspeccion: c.inspeccion, retenido: c.retenido, vencido: c.vencido, enCamino: c.enCamino });

export function sumarCubetas(...lista: Cubetas[]): Cubetas {
  const r = cubetasVacias();
  for (const c of lista) for (const k of CLAVES) r[k] += c[k];
  return r;
}

/** Si alguna cubeta tiene algo (un saldo negativo también cuenta). */
export const tieneAlgo = (c: Cubetas): boolean => CLAVES.some((k) => c[k] !== 0);

/**
 * Junta, bodega por bodega, el stock general del producto principal con el de sus variantes. El total de cada bodega es la suma; `partes` dice de dónde sale (solo si alguna variante
 * tiene algo ahí). Las variantes se muestran en el orden que llegan.
 */
export function juntarConVariantes<T extends CubetasDeBodega>(propias: readonly T[], variantes: readonly VarianteConStock[]): BodegaConPartes<T>[] {
  return propias.map((bodega) => {
    const deVariantes = variantes
      .map((v) => ({ v, c: v.bodegas.find((b) => b.bodegaId === bodega.bodegaId) }))
      .filter((x): x is { v: VarianteConStock; c: CubetasDeBodega } => !!x.c && tieneAlgo(x.c));
    const general = soloCubetas(bodega);
    const total = sumarCubetas(general, ...deVariantes.map((x) => soloCubetas(x.c)));
    const partes: ParteDeBodega[] =
      deVariantes.length === 0
        ? []
        : [
            ...(tieneAlgo(general) ? [{ clave: "general", nombre: "Stock general", general: true, cubetas: general }] : []),
            ...deVariantes.map((x) => ({ clave: x.v.id, nombre: x.v.etiqueta, general: false, cubetas: soloCubetas(x.c) })),
          ];
    return { bodega, total, partes };
  });
}
