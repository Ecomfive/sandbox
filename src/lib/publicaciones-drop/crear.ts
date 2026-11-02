// Crear un producto en Drop (3 nov 2026, según Nicole; ver DROP-REFERENCIA.md). Drop pide mucho menos que Dropi: el nombre (que también es el SKU), una descripción corta (la misma del
// nombre), la categoría, el precio de venta y de 1 a 5 imágenes. **No hay** precio sugerido (Drop lo calcula solo y lo ve el dropshipper), peso ni medidas, público o privado (se privatiza
// después, desde el mismo ID), simple o variable, nombre distinto para la guía, videos ni garantías. Opcionales: el enlace de los creativos y el aviso por correo de poco stock. Sin base
// ni React, con prueba (crear.test.ts).

export const MIN_IMAGENES = 1;
export const MAX_IMAGENES = 5;

export interface DatosCrearDrop {
  nombre: string;
  descripcion: string;
  categoria: string;
  /** El precio de venta, en colones; null si no se escribió. */
  precio: number | null;
  /** Cuántas imágenes se subieron. */
  imagenes: number;
  /** El enlace (Drive) a los creativos; vacío si no hay. */
  enlaceCreativos: string;
}

/** El SKU de Drop **es** el nombre del producto y no se puede cambiar. */
export const skuDeDrop = (nombre: string): string => nombre.trim();

/** La descripción que se propone al escribir el nombre: el mismo nombre (así lo hace Nicole casi siempre). */
export const descripcionPorDefecto = (nombre: string): string => nombre.trim();

/** Un enlace http o https, sin usuario ni clave; vacío no es válido (el enlace es opcional: se comprueba solo si se escribió). */
export function enlaceValido(texto: string): boolean {
  try {
    const u = new URL(texto.trim());
    return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Lo que falta o está mal para crear el producto, con el nombre del dato como se ve en el formulario; vacío = se puede crear. */
export function faltantesCrearDrop(d: DatosCrearDrop): string[] {
  const f: string[] = [];
  if (!d.nombre.trim()) f.push("Nombre");
  if (!d.descripcion.trim()) f.push("Descripción");
  if (!d.categoria.trim()) f.push("Categoría");
  if (d.precio === null || !Number.isFinite(d.precio) || d.precio <= 0) f.push("Precio de venta");
  if (d.imagenes < MIN_IMAGENES) f.push(`Imágenes (de ${MIN_IMAGENES} a ${MAX_IMAGENES})`);
  else if (d.imagenes > MAX_IMAGENES) f.push(`Imágenes (máximo ${MAX_IMAGENES})`);
  if (d.enlaceCreativos.trim() && !enlaceValido(d.enlaceCreativos)) f.push("Enlace de creativos (debe empezar con https://)");
  return f;
}
