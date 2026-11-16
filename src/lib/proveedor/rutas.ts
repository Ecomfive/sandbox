// Portal del proveedor: dónde van las fotos que sube el proveedor (bucket privado `proveedor-portal`, migración 0124) y cómo se
// comprueba que una ruta que manda el navegador es de ese proveedor y ese pedido. Lógica pura.

import { esUuid } from "@/lib/seguridad/ruta-almacen";

export const BUCKET_PROVEEDOR = "proveedor-portal";
/** Una foto real pesa a lo más esto (el bucket admite 25 MB; una foto de celular cabe de sobra). */
export const MAX_BYTES_FOTO = 10 * 1024 * 1024;
const EXTENSIONES = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic"]);

/** `<proveedor>/<pedido>/fotos/<id>.<ext>`: la ruta de una foto nueva. La extensión es solo para el nombre (se valida el contenido). */
export function rutaFotoReal(proveedorId: string, pedidoId: string, nombreArchivo: string, id: string): string | null {
  if (!esUuid(proveedorId) || !esUuid(pedidoId) || !/^[0-9a-f-]{8,40}$/i.test(id)) return null;
  const ext = (nombreArchivo.split(".").pop() ?? "").toLowerCase();
  return `${proveedorId}/${pedidoId}/fotos/${id}.${EXTENSIONES.has(ext) ? ext : "jpg"}`;
}

/** Si una ruta mandada por el navegador está dentro de la carpeta de ese pedido (sin «..» ni otra carpeta). */
export function rutaEsDelPedido(ruta: unknown, proveedorId: string, pedidoId: string): ruta is string {
  if (!esUuid(proveedorId) || !esUuid(pedidoId)) return false;
  if (typeof ruta !== "string" || ruta.length > 300 || ruta.includes("..") || ruta.includes("\\")) return false;
  return new RegExp(`^${proveedorId}/${pedidoId}/fotos/[0-9a-f-]{8,40}\\.[a-z]{3,4}$`, "i").test(ruta);
}

/** Cuántas imágenes de etiqueta puede tener un pedido (la etiqueta de cada caja es casi la misma: con unas pocas basta). */
export const MAX_ETIQUETAS = 6;

/** `<proveedor>/<pedido>/etiquetas/<id>.<ext>`: la ruta de una etiqueta de cajas nueva. La extensión es solo para el nombre (se valida el contenido). */
export function rutaEtiqueta(proveedorId: string, pedidoId: string, nombreArchivo: string, id: string): string | null {
  if (!esUuid(proveedorId) || !esUuid(pedidoId) || !/^[0-9a-f-]{8,40}$/i.test(id)) return null;
  const ext = (nombreArchivo.split(".").pop() ?? "").toLowerCase();
  return `${proveedorId}/${pedidoId}/etiquetas/${id}.${EXTENSIONES.has(ext) ? ext : "jpg"}`;
}

/** Si una ruta mandada por el navegador es una etiqueta de ese pedido (sin «..» ni otra carpeta). */
export function rutaEsEtiquetaDelPedido(ruta: unknown, proveedorId: string, pedidoId: string): ruta is string {
  if (!esUuid(proveedorId) || !esUuid(pedidoId)) return false;
  if (typeof ruta !== "string" || ruta.length > 300 || ruta.includes("..") || ruta.includes("\\")) return false;
  return new RegExp(`^${proveedorId}/${pedidoId}/etiquetas/[0-9a-f-]{8,40}\.[a-z]{3,4}$`, "i").test(ruta);
}
