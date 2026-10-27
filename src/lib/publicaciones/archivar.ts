// Cuándo se puede archivar una publicación de Gestión de IDs Dropi. Sin base ni React, con prueba.

/** Lo que se le dice a la persona cuando una publicación no se puede archivar por no tener stock. */
export const MOTIVO_SIN_STOCK = "No tiene stock en Dropi: una publicación sin stock no se archiva.";

/**
 * Una publicación sin stock en Dropi no se archiva (pedido de Hernán, 27 oct 2026): ni el público ni la reserva privada tienen
 * unidades. Sin lectura de stock (`null`) no se impide: no hay cómo saberlo. Sacar de Archivados siempre se puede.
 */
export function sinStockParaArchivar(stock: number | null, privado: number | null = null): boolean {
  return stock !== null && stock <= 0 && (privado ?? 0) <= 0;
}
