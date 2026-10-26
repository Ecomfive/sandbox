// Scraping de proveedores › «Descubrir proveedores» (pedido de Hernán, 26 oct 2026): con todo el catálogo de Dropi de un país (lo lee
// la extensión «Ecomfive · Dropi» con la sesión de dropshipper de ese país), qué proveedores conviene seguir como referentes: los
// que más mueven stock (lo que bajó desde la lectura anterior, como las ventas estimadas de Scraping), los que más publican
// novedades (productos creados en los últimos 30 días: están testeando) y los más grandes. La primera lectura de un país no tiene
// con qué comparar: las ventas se ven desde la segunda. Sin base ni red, con prueba.

/** Un producto del catálogo, compacto: [id, proveedor, stock, creado «AAAA-MM-DD» o "", precio, nombre, foto (urlS3 o url)]. */
export type ProductoCatalogo = [number, number, number, string, number | null, string, string | null];

export interface LecturaCatalogo {
  pais: string;
  /** ISO. */
  leido: string;
  /** El nombre de cada proveedor por su id de Dropi. */
  proveedores: Record<string, string>;
  productos: ProductoCatalogo[];
}

/** Lo que se guarda para la próxima lectura: el stock de cada producto y de qué proveedor es. */
export type FotoCatalogo = Record<string, [number, number]>;

export interface ProveedorDescubierto {
  dropiId: number;
  nombre: string;
  productos: number;
  /** Creados en Dropi en los últimos 30 días. */
  nuevos30: number;
  stock: number;
  /** Lo que bajó el stock desde la lectura anterior (null en la primera lectura). */
  ventas: number | null;
  /** Cuántos de sus productos bajaron de stock. */
  conVentas: number;
  /** Sus productos que más se movieron (o los más nuevos si no hay lectura anterior), hasta 3. */
  destacados: { nombre: string; foto: string | null; ventas: number | null; creado: string | null }[];
}

/** La foto que se guarda para comparar la próxima vez. */
export const fotoDe = (l: LecturaCatalogo): FotoCatalogo => Object.fromEntries(l.productos.map((p) => [String(p[0]), [p[1], p[2]]]));

/** El resumen por proveedor, del más interesante al menos: ventas estimadas, luego novedades, luego tamaño. */
export function descubrir(l: LecturaCatalogo, anterior: FotoCatalogo | null): ProveedorDescubierto[] {
  const desde30 = new Date(Date.parse(l.leido) - 30 * 86_400_000).toISOString().slice(0, 10);
  const por = new Map<number, ProveedorDescubierto & { mov: { nombre: string; foto: string | null; ventas: number | null; creado: string | null; orden: number }[] }>();
  for (const [id, prov, stock, creado, , nombre, foto] of l.productos) {
    const p =
      por.get(prov) ??
      ({ dropiId: prov, nombre: l.proveedores[String(prov)] ?? `Proveedor ${prov}`, productos: 0, nuevos30: 0, stock: 0, ventas: anterior ? 0 : null, conVentas: 0, destacados: [], mov: [] } as ProveedorDescubierto & {
        mov: { nombre: string; foto: string | null; ventas: number | null; creado: string | null; orden: number }[];
      });
    por.set(prov, p);
    p.productos++;
    p.stock += Math.max(0, stock);
    const nuevo = !!creado && creado >= desde30;
    if (nuevo) p.nuevos30++;
    const antes = anterior?.[String(id)];
    const bajo = antes && antes[0] === prov && stock < antes[1] ? antes[1] - stock : 0;
    if (anterior && bajo > 0) {
      p.ventas = (p.ventas ?? 0) + bajo;
      p.conVentas++;
    }
    if (bajo > 0 || (!anterior && nuevo)) p.mov.push({ nombre, foto, ventas: anterior ? bajo : null, creado: creado || null, orden: anterior ? bajo : Date.parse(creado || "1970-01-01") });
  }
  return [...por.values()]
    .map(({ mov, ...p }) => ({ ...p, destacados: mov.sort((a, b) => b.orden - a.orden).slice(0, 3).map(({ orden: _o, ...d }) => (void _o, d)) }))
    .sort((a, b) => (b.ventas ?? 0) - (a.ventas ?? 0) || b.nuevos30 - a.nuevos30 || b.productos - a.productos);
}

/** El enlace del proveedor en Dropi (el que pide «Agregar proveedor»): `https://app.dropi.<país>/dashboard/provider/<id>/<NOMBRE>`. */
export function enlaceProveedor(pais: string, dropiId: number, nombre: string): string {
  return `https://app.dropi.${pais}/dashboard/provider/${dropiId}/${encodeURIComponent(nombre.trim().toUpperCase())}`;
}
