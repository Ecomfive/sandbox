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

/** Lo que se le dice a la persona cuando quiere pausar una publicación que todavía tiene stock. */
export const MOTIVO_CON_STOCK = "Todavía tiene stock en Dropi: se pausa solo una publicación sin stock (para esta, usa «Archivar»).";

/**
 * «Pausar por falta de stock» (pedido de Alcides, 27 oct 2026): la salida para una publicación que no se puede archivar porque se quedó
 * sin stock. En Dropi se archiva igual (la competencia no ve que se agotó) y en el sistema sigue a la vista hasta reactivarla. Se pausa
 * solo lo que tiene ID de Dropi, ya está publicado, no está archivado y no tiene stock.
 */
export function sePuedePausar(p: { dropiId: string; archivada: boolean; sinPublicar: boolean; stock: number | null; privado: number | null }): boolean {
  return p.dropiId.trim() !== "" && !p.archivada && !p.sinPublicar && sinStockParaArchivar(p.stock, p.privado);
}

/** Una pausada está lista para reactivarse cuando la lectura de Dropi vuelve a verle unidades (el público o la reserva privada). */
export function listaParaReactivar(stock: number | null, privado: number | null = null): boolean {
  return (stock ?? 0) > 0 || (privado ?? 0) > 0;
}
