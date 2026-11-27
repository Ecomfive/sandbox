// Compras › etapas de «Llegada a Puerto» (24 nov 2026, pedido de Compras): a veces llegan varios lotes de una misma compra al puerto y hay que
// tenerlos separados. Además de «06 - Llegada a Puerto» (`arribo_mercancia`, la de siempre) hay una etapa por lote. Todas significan lo mismo para el
// resto del sistema (la mercancía ya salió y está en el puerto, sin llegar a bodega), así que cualquier regla que diga «llegó a puerto» usa esta lista.

/** Las etapas por lote, en orden. */
export const ETAPAS_LLEGADA_PUERTO_LOTE = ["llegada_puerto_lote_1", "llegada_puerto_lote_2", "llegada_puerto_lote_3"] as const;

/** Todas las etapas de llegada a puerto: la general y las tres por lote. */
export const ETAPAS_LLEGADA_PUERTO: readonly string[] = ["arribo_mercancia", ...ETAPAS_LLEGADA_PUERTO_LOTE];

export const esLlegadaPuerto = (etapa: string | null | undefined): boolean => !!etapa && ETAPAS_LLEGADA_PUERTO.includes(etapa);
