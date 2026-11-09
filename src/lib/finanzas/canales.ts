// Portal AF4 360° › Canal de venta de cada tienda (`fin_unidades.canal`, migración 0929) para el EERR por canal.
// Lógica pura. Prueba en `canales.test.ts`.

export const CANALES = ["shopify", "dropi", "whatsapp", "clicksi", "otro"] as const;
export type Canal = (typeof CANALES)[number];

/** La columna de lo que no tiene canal (CORPORATIVO, tiendas sin canal elegido). */
export const SIN_CANAL = "sin-canal";

export const ETIQUETA_CANAL: Record<Canal | typeof SIN_CANAL, string> = {
  shopify: "Shopify",
  dropi: "Dropi",
  whatsapp: "WhatsApp",
  clicksi: "Clicksi",
  otro: "Otro",
  [SIN_CANAL]: "Sin canal",
};

export const esCanal = (v: unknown): v is Canal => typeof v === "string" && (CANALES as readonly string[]).includes(v);

/** El canal guardado, o «sin canal». */
export const canalDe = (v: unknown): Canal | typeof SIN_CANAL => (esCanal(v) ? v : SIN_CANAL);

/**
 * El canal que se sugiere para una tienda que todavía no tiene: por el nombre (CLICKSI, ECOMFIVE es el proveedor de
 * Dropi, WHATSAPP) o, si tiene órdenes importadas de Shopify, Shopify. Solo tiendas; lo demás queda sin canal.
 */
export function canalSugerido(u: { nombre: string; clase: string; ordenesShopify?: number }): Canal | null {
  if (u.clase !== "tienda") return null;
  const n = u.nombre.toUpperCase();
  if (n.includes("CLICKSI")) return "clicksi";
  if (n.includes("WHATSAPP")) return "whatsapp";
  if (n.startsWith("ECOMFIVE") || n.includes("DROPI")) return "dropi";
  if ((u.ordenesShopify ?? 0) > 0) return "shopify";
  return null;
}

/** Las columnas del EERR por canal, en orden: los canales y al final «sin canal». */
export const COLUMNAS_CANAL: (Canal | typeof SIN_CANAL)[] = [...CANALES, SIN_CANAL];
