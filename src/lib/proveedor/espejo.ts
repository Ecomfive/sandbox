// Portal del proveedor: qué etapa de la compra corresponde a cuál del portal y qué vía se muestra. La misma regla vive en el
// disparador de la migración 0124 (`proveedor_sincronizar`); una prueba comprueba que las dos digan lo mismo. Lógica pura.

export const ETAPAS_PORTAL = ["por_cotizar", "cotizado", "produccion", "enviado", "llegado", "descartado"] as const;
export type EtapaPortal = (typeof ETAPAS_PORTAL)[number];

/** Etapa de la compra (`wms_compras.etapa`) → etapa del portal. Las que no están (Backlog y las retiradas) no se muestran. */
export const ETAPA_PORTAL_DE_COMPRA: Readonly<Record<string, EtapaPortal>> = {
  cotizar: "por_cotizar",
  cotizado: "cotizado",
  produccion: "produccion",
  tracking: "enviado",
  arribo_mercancia: "llegado",
  completado: "llegado",
  descartado: "descartado",
};

/** Cómo se nombra cada etapa en las dos vistas (todo en español, acordado el 21 oct 2026). */
export const ETIQUETA_ETAPA_PORTAL: Readonly<Record<EtapaPortal, string>> = {
  por_cotizar: "Por cotizar",
  cotizado: "Cotizado",
  produccion: "En producción",
  enviado: "Enviado",
  llegado: "Llegado",
  descartado: "Descartado",
};

export type ViaPortal = "mar" | "aire";

/** Una sola vía en el portal: aéreo solo si es lo único que lleva la compra; terrestre o sin vía cuentan como marítimo. */
export function viaPortal(vias: readonly string[] | null | undefined): ViaPortal {
  return vias?.length === 1 && vias[0] === "aire" ? "aire" : "mar";
}

export function etapaPortal(etapaCompra: string): EtapaPortal | null {
  return ETAPA_PORTAL_DE_COMPRA[etapaCompra] ?? null;
}
