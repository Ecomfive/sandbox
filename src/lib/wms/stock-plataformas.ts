/**
 * Lo que hay de cada producto en las plataformas de Costa Rica (6 nov 2026, pedido de Hernán, flujograma de Proveeduría Costa Rica): Dropi, Effi y Drop. Las lecturas
 * ya estaban (`dropi_productos_proveedor`, `effi_publicaciones`, `drop_publicaciones`), pero cada una en su módulo, y las bodegas externas de Inventario salían en cero
 * porque `wms_stock` no las recibe. Aquí se juntan por producto, sin escribir nada: es una vista de lo último que se leyó. Lógica pura, con prueba.
 */

import { esBodegaDropi } from "@/lib/publicaciones/automatico";
import { idsDeDropi } from "@/lib/publicaciones/sincronizar-dropi";

export type Plataforma = "dropi" | "effi" | "drop";

/** Drop es la bodega y Boxfull quien entrega: son lo mismo (Hernán, 6 nov 2026). */
export const ETIQUETA_PLATAFORMA: Record<Plataforma, string> = { dropi: "Dropi", effi: "Effi", drop: "Drop" };

/** Una publicación con su stock, para la ficha del producto. */
export interface LineaPlataforma {
  plataforma: Plataforma;
  /** Su ID en la plataforma (Dropi, Effi) o su código (Drop). */
  id: string;
  nombre: string;
  unidades: number;
  /** Dropi: lo de una bodega que no es la de Dropi, solo referencial; Effi: lo de la bodega de garantías. No suma al total. */
  aparte: number;
}

export interface StockPlataformas {
  dropi: number;
  effi: number;
  drop: number;
  total: number;
  lineas: LineaPlataforma[];
}

/** Cuándo se leyó cada plataforma por última vez. */
export type LecturasPlataformas = Record<Plataforma, string | null>;

export interface PublicacionDropi {
  sku_maestro_id: string;
  dropi_id: string | null;
  nombre: string;
  estado_publicacion: string | null;
}
export interface ProductoDropi {
  dropi_producto_id: number;
  stock: number | null;
  bodegas: { id: number; stock: number }[] | null;
  leido_en: string | null;
}
export interface PublicacionEffi {
  sku_maestro_id: string | null;
  effi_id: string | number;
  nombre: string;
  stock_principal: number | null;
  stock_garantias: number | null;
  en_effi: boolean;
  ultima_vez: string | null;
}
export interface PublicacionDrop {
  sku_maestro_id: string | null;
  codigo: string | null;
  nombre: string;
  inventario: number | null;
  en_drop: boolean;
  ultima_vez: string | null;
}

const masReciente = (fechas: (string | null)[]) => fechas.reduce<string | null>((a, f) => (f && (!a || f > a) ? f : a), null);

/**
 * Junta las tres lecturas por producto. En Dropi solo cuenta lo de su bodega (la B15): lo de otra es referencial, se pone a mano para la publicación y no es stock de
 * verdad (5 nov 2026, Alcides). Un ID de Dropi cuenta una sola vez, aunque dos publicaciones lo tengan. Effi cuenta su bodega Principal; las de las tiendas son de cada
 * dropshipper y aquí no llegan. Lo que ya no está en Effi o en Drop no cuenta. Un producto sin nada en ninguna plataforma no sale.
 */
export function armarStockPlataformas(entrada: { dropi: PublicacionDropi[]; productosDropi: ProductoDropi[]; effi: PublicacionEffi[]; drop: PublicacionDrop[] }): {
  porProducto: Map<string, StockPlataformas>;
  lecturas: LecturasPlataformas;
} {
  const porProducto = new Map<string, StockPlataformas>();
  const agregar = (sku: string, l: LineaPlataforma) => {
    const x = porProducto.get(sku) ?? { dropi: 0, effi: 0, drop: 0, total: 0, lineas: [] };
    x[l.plataforma] += l.unidades;
    x.total += l.unidades;
    x.lineas.push(l);
    porProducto.set(sku, x);
  };

  const productos = new Map(entrada.productosDropi.map((p) => [p.dropi_producto_id, p]));
  const vistos = new Set<number>();
  for (const p of entrada.dropi) {
    if (p.estado_publicacion === "borrador") continue;
    for (const id of idsDeDropi(p.dropi_id)) {
      const producto = productos.get(id);
      if (!producto || vistos.has(id)) continue;
      vistos.add(id);
      const bodegas = Array.isArray(producto.bodegas) ? producto.bodegas : null;
      const unidades = (bodegas ?? []).filter((b) => esBodegaDropi(b.id)).reduce((t, b) => t + Number(b.stock ?? 0), 0);
      // Sin el detalle por bodega no se sabe dónde está: el total queda como referencial.
      const aparte = bodegas ? bodegas.filter((b) => !esBodegaDropi(b.id)).reduce((t, b) => t + Number(b.stock ?? 0), 0) : Number(producto.stock ?? 0);
      if (unidades || aparte) agregar(p.sku_maestro_id, { plataforma: "dropi", id: String(id), nombre: p.nombre, unidades, aparte });
    }
  }
  for (const p of entrada.effi) {
    const unidades = Number(p.stock_principal ?? 0);
    const aparte = Number(p.stock_garantias ?? 0);
    if (p.sku_maestro_id && p.en_effi && (unidades || aparte)) agregar(p.sku_maestro_id, { plataforma: "effi", id: String(p.effi_id), nombre: p.nombre, unidades, aparte });
  }
  for (const p of entrada.drop) {
    const unidades = Number(p.inventario ?? 0);
    if (p.sku_maestro_id && p.en_drop && unidades) agregar(p.sku_maestro_id, { plataforma: "drop", id: p.codigo ?? "Drop", nombre: p.nombre, unidades, aparte: 0 });
  }
  return {
    porProducto,
    lecturas: {
      dropi: masReciente(entrada.productosDropi.map((p) => p.leido_en)),
      effi: masReciente(entrada.effi.map((p) => p.ultima_vez)),
      drop: masReciente(entrada.drop.map((p) => p.ultima_vez)),
    },
  };
}

/** A partir de cuántos días una lectura se avisa como vieja: Dropi y Drop se leen a mano y pueden quedarse atrás. */
export const DIAS_LECTURA_VIEJA = 2;
export const lecturaVieja = (fecha: string | null, ahora = Date.now()) => !fecha || ahora - Date.parse(fecha) > DIAS_LECTURA_VIEJA * 86_400_000;

/** «Dropi 120 · Drop 44»: lo que hay, solo las plataformas que tienen algo. */
export function textoPlataformas(s: Pick<StockPlataformas, Plataforma> | null | undefined): string {
  if (!s) return "";
  return (["dropi", "effi", "drop"] as const)
    .filter((p) => s[p] !== 0)
    .map((p) => `${ETIQUETA_PLATAFORMA[p]} ${s[p].toLocaleString("es-PA")}`)
    .join(" · ");
}
