// Crear un producto en Drop (3 nov 2026, según Nicole; ver DROP-REFERENCIA.md). Drop pide mucho menos que Dropi: el nombre (que también es el SKU), una descripción corta (la misma del
// nombre), la categoría, el precio de venta y de 1 a 5 imágenes. **No hay** precio sugerido (Drop lo calcula solo y lo ve el dropshipper), peso ni medidas, público o privado (se privatiza
// después, desde el mismo ID), simple o variable, nombre distinto para la guía, videos ni garantías. Opcionales: el enlace de los creativos y el aviso por correo de poco stock. Sin base
// ni React, con prueba (crear.test.ts).

export const MIN_IMAGENES = 1;
export const MAX_IMAGENES = 5;
/** La descripción corta de Drop pide **al menos 10 caracteres** (confirmado por Nicole, 3 nov 2026). */
export const MIN_DESCRIPCION = 10;

/** Las categorías de Drop (las que ofrece su formulario, según Nicole, 3 nov 2026): se elige una de la lista. */
export const CATEGORIAS_DROP = [
  "Tecnología",
  "Decoración para el hogar",
  "Productos ecológicos",
  "Cuidado personal",
  "Ropa y accesorios",
  "Artículos de oficina",
  "Accesorios de viaje",
  "Hogar y cocina",
  "Deportes y Gimnasio",
  "Suministros para mascotas",
  "Juguetes y juegos",
  "Salud y bienestar",
] as const;
export const categoriaValida = (c: string): boolean => (CATEGORIAS_DROP as readonly string[]).includes(c);

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

/**
 * Qué se escribe en Drop cuando el producto ya existe en nuestro sistema (3 nov 2026, pedido de Hernán): en Drop el nombre **es** el SKU y no se puede cambiar después, así que al crear
 * un producto que todavía no está en Drop se usa lo nuestro, **y se procura que el SKU de Drop sea el mismo que el de nuestro producto** (`"sku"`, lo que se propone); si se prefiere, el
 * nombre de nuestro producto (`"nombre"`). Un producto que ya está creado en Drop conserva su SKU y se **vincula** con el nuestro: quedan los dos SKU, conectados.
 */
export type BaseDeDrop = "sku" | "nombre";

export const textoParaDrop = (producto: { codigo: string; nombre: string }, base: BaseDeDrop): string => (base === "sku" ? producto.codigo : producto.nombre).trim();

const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Los productos nuestros que se parecen a lo que se escribe como nombre del producto de Drop: `exacto` si el nombre o el SKU de uno es igual (sin mayúsculas, tildes ni signos; el sistema
 * lo vincula solo) y `parecidos` (hasta `max`) si todas las palabras escritas están en su SKU o su nombre (se ofrecen, una persona elige).
 */
export function sugerirProductos<T extends { id: string; codigo: string; nombre: string }>(texto: string, productos: readonly T[], max = 3): { exacto: T | null; parecidos: T[] } {
  const q = norm(texto);
  if (q.replace(/ /g, "").length < 4) return { exacto: null, parecidos: [] };
  const exacto = productos.find((p) => norm(p.codigo) === q || norm(p.nombre) === q) ?? null;
  const palabras = q.split(" ").filter((w) => w.length >= 2);
  const parecidos = productos
    .filter((p) => p !== exacto)
    .map((p) => ({ p, todo: norm(`${p.codigo} ${p.nombre}`) }))
    .filter((x) => palabras.every((w) => x.todo.includes(w)))
    .sort((a, b) => a.todo.length - b.todo.length)
    .slice(0, max)
    .map((x) => x.p);
  return { exacto, parecidos };
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
  else if (d.descripcion.trim().length < MIN_DESCRIPCION) f.push(`Descripción (mínimo ${MIN_DESCRIPCION} caracteres)`);
  if (!d.categoria.trim()) f.push("Categoría");
  else if (!categoriaValida(d.categoria)) f.push("Categoría (elige una de la lista)");
  if (d.precio === null || !Number.isFinite(d.precio) || d.precio <= 0) f.push("Precio de venta");
  if (d.imagenes < MIN_IMAGENES) f.push(`Imágenes (de ${MIN_IMAGENES} a ${MAX_IMAGENES})`);
  else if (d.imagenes > MAX_IMAGENES) f.push(`Imágenes (máximo ${MAX_IMAGENES})`);
  if (d.enlaceCreativos.trim() && !enlaceValido(d.enlaceCreativos)) f.push("Enlace de creativos (debe empezar con https://)");
  return f;
}
