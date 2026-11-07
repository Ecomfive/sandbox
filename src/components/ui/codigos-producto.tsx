import { numeroProducto } from "@/lib/wms/codigos-producto";

/**
 * El N.º correlativo y el código de barras de un producto, juntos y en pequeño (7 nov 2026, pedido de Hernán: manejar el inventario por código y no solo por nombre). Va junto al SKU en
 * las listas de productos. No dibuja nada si el producto no tiene ninguno de los dos. Los lectores de pantalla oyen qué es cada código.
 */
export function CodigosProducto({ numero, barras, className = "" }: { numero?: number | null; barras?: string | null; className?: string }) {
  const n = numeroProducto(numero);
  if (!n && !barras) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground tabular-nums ${className}`}>
      {n && (
        <span>
          <span className="sr-only">N.º </span>
          {n}
        </span>
      )}
      {n && barras && <span aria-hidden="true">·</span>}
      {barras && (
        <span className="font-mono">
          <span className="sr-only">Código de barras </span>
          {barras}
        </span>
      )}
    </span>
  );
}
