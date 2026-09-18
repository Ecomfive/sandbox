export interface ProductoFila {
  id: string;
  sku: string;
  nombre: string;
  costo: number | null;
  precio_actual: number | null;
  margen_minimo: number;
  ultima_modificacion_precio: string | null;
  plataforma_nombre: string | null;
  sku_maestro_id: string | null;
}

export function margenActual(p: ProductoFila): number | null {
  if (p.costo === null || p.precio_actual === null || p.precio_actual === 0) return null;
  return ((p.precio_actual - p.costo) / p.precio_actual) * 100;
}
