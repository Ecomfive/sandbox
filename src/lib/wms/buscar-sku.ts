// La búsqueda del selector de productos (`CampoSkuMaestro`): qué productos salen al escribir y en qué orden. Lógica pura, con prueba en `buscar-sku.test.ts`.

export interface OpcionBuscable {
  id: string;
  codigo: string;
  nombre: string;
  numero?: number | null;
  barras?: string | null;
  /** Si es una variante, el producto al que pertenece. */
  padreId?: string | null;
}

/** Una fila de la lista de sugerencias: un producto o, con sangría, una variante de él. */
export interface FilaSugerencia<T> {
  o: T;
  variante: boolean;
}

export const LIMITE_PRODUCTOS = 8;

export const normalizarBusqueda = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const numeroComoTexto = (n?: number | null) => (n === null || n === undefined ? "" : `#${String(n).padStart(4, "0")}`);

/** Los que coinciden con lo escrito, los mejores primero: SKU que empieza igual, nombre que empieza igual, y luego el resto. Sin texto, todos en su orden. */
export function coincidencias<T extends OpcionBuscable>(opciones: T[], texto: string): T[] {
  const q = normalizarBusqueda(texto);
  if (!q) return opciones;
  const palabras = q.split(/\s+/);
  return opciones
    .map((o) => {
      const codigo = normalizarBusqueda(o.codigo);
      const nombre = normalizarBusqueda(o.nombre);
      const numero = numeroComoTexto(o.numero).slice(1).replace(/^0+/, "");
      const barras = (o.barras ?? "").toLowerCase();
      const todo = `${codigo} ${nombre} ${numero} ${barras}`;
      if (!palabras.every((p) => todo.includes(p))) return null;
      const puntos = (codigo.startsWith(q) ? 4 : 0) + (nombre.startsWith(q) ? 3 : 0) + (numero === q || (barras !== "" && barras === q) ? 5 : 0) + (codigo.includes(q) ? 1 : 0);
      return { o, puntos };
    })
    .filter((x): x is { o: T; puntos: number } => x !== null)
    .sort((a, b) => b.puntos - a.puntos || a.o.nombre.localeCompare(b.o.nombre, "es"))
    .map((x) => x.o);
}

/**
 * Los que coinciden con lo escrito, con las variantes dentro de su producto (9 nov 2026, pedido de Hernán): una variante que coincide trae a su producto, y debajo, con sangría, van las variantes que coinciden (todas, si coincide el
 * producto). `limite` cuenta **productos**, no variantes: las variantes de un mismo producto cuentan como uno aunque su producto no esté entre las opciones (la remisión ofrece solo variantes: 20 nov 2026, «faja» dejaba fuera dos
 * tallas porque cada variante contaba como un producto y el límite era 8). Si el producto no está entre las opciones, sus variantes salen sin él y sin sangría.
 */
export function buscarProductos<T extends OpcionBuscable>(opciones: T[], texto: string, limite = LIMITE_PRODUCTOS): FilaSugerencia<T>[] {
  const porId = new Map(opciones.map((o) => [o.id, o]));
  const grupoDe = (o: T) => o.padreId ?? o.id;
  const hijasDe = new Map<string, T[]>();
  for (const o of opciones) if (grupoDe(o) !== o.id) hijasDe.set(grupoDe(o), [...(hijasDe.get(grupoDe(o)) ?? []), o]);
  const coinciden = coincidencias(opciones, texto);
  const vistas = new Set(coinciden.map((o) => o.id));
  const grupos = [...new Set(coinciden.map(grupoDe))].slice(0, limite);
  return grupos.flatMap((g) => {
    const padre = porId.get(g);
    const todas = !texto.trim() || vistas.has(g);
    const hijas = (hijasDe.get(g) ?? []).filter((h) => todas || vistas.has(h.id));
    return padre ? [{ o: padre, variante: false }, ...hijas.map((o) => ({ o, variante: true }))] : hijas.map((o) => ({ o, variante: false }));
  });
}
