// Comprobantes de entrega: reglas puras (ruta, tipos y límites). El archivo se valida por su contenido en el servidor.

export const BUCKET_COMPROBANTES = "ven-comprobantes";
export const TIPOS_COMPROBANTE = ["entrega", "cobro", "otro"] as const;
export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number];
export const MAX_BYTES_COMPROBANTE = 8 * 1024 * 1024;
export const MAX_COMPROBANTES_POR_ORDEN = 10;

export const ETIQUETA_COMPROBANTE: Record<TipoComprobante, string> = { entrega: "Entrega", cobro: "Cobro", otro: "Otro" };

/** Nombre de archivo seguro para la ruta (sin acentos, sin barras, corto). */
export function nombreComprobante(nombre: string): string {
  const limpio = String(nombre ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[-.]+/, "").slice(-60);
  return limpio || "comprobante";
}

export const rutaComprobante = (ordenId: string, nombre: string, ahora = Date.now(), uuid = crypto.randomUUID()) =>
  `${ordenId}/${ahora}-${uuid.slice(0, 8)}-${nombreComprobante(nombre)}`;

/** La ruta pertenece a la orden y no sale de su carpeta. */
export function rutaEsDeOrden(ruta: unknown, ordenId: string): ruta is string {
  return typeof ruta === "string" && ruta.startsWith(`${ordenId}/`) && !ruta.includes("..") && /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(ruta);
}

export const tipoValido = (t: unknown): t is TipoComprobante => (TIPOS_COMPROBANTE as readonly string[]).includes(String(t));
