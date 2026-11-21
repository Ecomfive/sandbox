// Anuncios Meta › Cuentas › CPA tope por producto: buscar un producto de una lista larga. Lógica pura, con prueba.

const limpio = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Los productos cuyo nombre trae todas las palabras escritas (sin importar mayúsculas, acentos ni el orden); sin texto, todos. */
export function filtrarProductos<T extends { producto: string }>(filas: T[], texto: string): T[] {
  const palabras = limpio(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return filas;
  return filas.filter((f) => {
    const nombre = limpio(f.producto);
    return palabras.every((p) => nombre.includes(p));
  });
}
