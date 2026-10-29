/**
 * Los productos de los que habla un dropshipper en su chat de WhatsApp (pedido de Hernán, 29 oct 2026): la ficha del panel derecho de la
 * bandeja dice cuándo llega lo que pregunta («¿cuándo tendrán el cutting mix y la semilla de calabaza?»), como la columna «En camino» de
 * Gestión de IDs Dropi. Aquí solo el cruce del texto con los nombres del catálogo, sin servidor: se usa en la acción y en las pruebas.
 */

// Palabras que no distinguen un producto de otro: artículos, presentaciones y unidades.
const PALABRAS_COMUNES = new Set([
  "de", "del", "la", "el", "los", "las", "y", "e", "o", "en", "con", "para", "por", "sin", "un", "una", "al", "a", "x", "the", "of", "and", "for", "with",
  "ml", "mg", "g", "gr", "kg", "oz", "cap", "caps", "capsulas", "capsules", "softgel", "softgels", "sofgels", "tabletas", "gomitas", "gummies", "unidades", "pack",
]);

/** «Aceite de Semilla de Calabaza (180 Softgels)» → ["aceite", "semilla", "calabaza"]: sin tildes, sin números ni palabras comunes. */
export function palabrasDe(texto: string | null | undefined): string[] {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 1 && !/^\d+$/.test(p) && !PALABRAS_COMUNES.has(p));
}

export interface ProductoParaCruzar {
  id: string;
  nombre: string;
  codigo: string | null;
}

/**
 * Los productos que el texto nombra, del más claro al menos: uno cuenta si en el texto salen seguidas dos de sus palabras, también
 * seguidas en su nombre o su código («semilla de calabaza» → Aceite de Semilla de Calabaza; «cutting mix» → Cutting Mix); un producto de
 * una sola palabra, si esa palabra sale y es larga (5 letras o más). Es una sugerencia: la persona decide si lo deja en la ficha.
 */
export function productosMencionados<T extends ProductoParaCruzar>(texto: string, productos: T[], maximo = 5): T[] {
  const palabras = palabrasDe(texto);
  if (!palabras.length) return [];
  const sueltas = new Set(palabras);
  const pares = new Set(palabras.slice(1).map((p, i) => `${palabras[i]} ${p}`));
  const hallados: { p: T; puntaje: number; largo: number }[] = [];
  for (const p of productos) {
    let mejor = 0;
    let largo = 0;
    for (const fuente of [p.nombre, (p.codigo ?? "").replace(/\//g, " ")]) {
      const lista = palabrasDe(fuente);
      if (!lista.length) continue;
      const suyas = [...new Set(lista)];
      const nombrado = lista.length === 1 ? lista[0].length >= 5 && sueltas.has(lista[0]) : lista.slice(1).some((w, i) => pares.has(`${lista[i]} ${w}`));
      if (!nombrado) continue;
      const puntaje = suyas.filter((w) => sueltas.has(w)).length / suyas.length;
      if (puntaje > mejor) {
        mejor = puntaje;
        largo = suyas.length;
      }
    }
    if (mejor > 0) hallados.push({ p, puntaje: mejor, largo });
  }
  // Primero el que más se parece a lo escrito; a igual parecido, el de nombre más corto (el producto base antes que sus versiones).
  return hallados
    .sort((a, b) => b.puntaje - a.puntaje || a.largo - b.largo || a.p.nombre.localeCompare(b.p.nombre))
    .slice(0, maximo)
    .map((h) => h.p);
}

/** Cuántos días faltan para una fecha («2026-11-12») desde hoy; negativo si ya pasó. */
export function diasHasta(fecha: string, hoy: string): number {
  const dia = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((dia(fecha) - dia(hoy)) / 86_400_000);
}

/** «en 14 días», «mañana», «hoy» o, si la fecha ya pasó y no ha llegado, «atrasada 3 días». */
export function cuantoFalta(fecha: string, hoy: string): string {
  const d = diasHasta(fecha, hoy);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d > 1) return `en ${d} días`;
  return d === -1 ? "atrasada 1 día" : `atrasada ${-d} días`;
}
