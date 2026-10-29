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
 * una sola palabra, si esa palabra sale y es larga (5 letras o más; con `conSueltas` en false, no). Es una sugerencia: la persona decide si lo
 * deja en la ficha.
 */
export function productosMencionados<T extends ProductoParaCruzar>(texto: string, productos: T[], maximo = 5, conSueltas = true): T[] {
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
      const nombrado = lista.length === 1 ? conSueltas && lista[0].length >= 5 && sueltas.has(lista[0]) : lista.slice(1).some((w, i) => pares.has(`${lista[i]} ${w}`));
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

// Palabras de la conversación que salen en algún nombre de producto pero no dicen cuál («prueba», «ayudar», «precio»…): nunca bastan solas.
const PALABRAS_DE_CHARLA = new Set([
  "hola", "buenas", "buenos", "gracias", "favor", "ayudar", "ayuda", "prueba", "pruebas", "precio", "precios", "pedido", "pedidos", "envio", "envios",
  "stock", "tienen", "tiene", "cuando", "llega", "llegan", "producto", "productos", "nuevo", "nueva", "nuevos", "original", "natural", "naturales",
  "premium", "viral", "mujer", "mujeres", "hombre", "hombres", "grande", "pequeno", "color", "colores", "negro", "blanco", "rosado", "morado",
  "cliente", "clientes", "tienda", "unidad", "cantidad", "semana", "manana", "ahora", "todavia", "quiero", "queria", "necesito", "puedes", "pueden",
]);

/** Singular y plural cuentan igual («creatinas» = «creatina»). */
const raiz = (w: string) => (w.length >= 6 && w.endsWith("s") ? w.slice(0, -1) : w);

/** Las palabras de un producto (nombre y código), ya en raíz. */
const palabrasDelProducto = (p: ProductoParaCruzar) => new Set([...palabrasDe(p.nombre), ...palabrasDe((p.codigo ?? "").replace(/\//g, " "))].map(raiz));

/**
 * Los productos que el texto nombra con una sola palabra que dice cuál es («para la creatina»): la palabra, de 5 letras o más y que no sea de
 * la charla, tiene que salir en el nombre o el código de 1 a `maximo` de los productos que se le pasan (los que se venden en el país del chat).
 * Si sale en más, no dice cuál y no cuenta.
 */
export function productosPorPalabra<T extends ProductoParaCruzar>(texto: string, productos: T[], maximo = 3): T[] {
  const indice = new Map<string, T[]>();
  for (const p of productos) for (const w of palabrasDelProducto(p)) indice.set(w, [...(indice.get(w) ?? []), p]);
  const hallados = new Map<string, T>();
  for (const w of new Set(palabrasDe(texto).map(raiz))) {
    if (w.length < 5 || PALABRAS_DE_CHARLA.has(w)) continue;
    const suyos = indice.get(w) ?? [];
    if (suyos.length >= 1 && suyos.length <= maximo) for (const p of suyos) hallados.set(p.id, p);
  }
  return [...hallados.values()].slice(0, maximo);
}

/**
 * Los ID de Dropi que se nombran en un mensaje: un número de 4 a 6 cifras justo después de «ID» («el ID es 51188», «id: 62783», «ID51188»), o
 * el mensaje entero si es solo ese número. Así no se confunden con precios, guías ni teléfonos.
 */
export function idsDropiEnTexto(texto: string | null | undefined): string[] {
  const t = String(texto ?? "");
  const ids = new Set<string>();
  for (const m of t.matchAll(/\bid\b\D{0,12}?(\d{4,6})(?!\d)/gi)) ids.add(m[1]);
  for (const m of t.matchAll(/\bid(\d{4,6})(?!\d)/gi)) ids.add(m[1]);
  const solo = t.trim().match(/^#?(\d{4,6})$/);
  if (solo) ids.add(solo[1]);
  return [...ids];
}

/** Cómo se supo que el chat habla de un producto, para decirlo en la ficha. */
export interface MencionEnChat {
  /** «analisis»: lo encontró «Analizar con IA» de la Actividad del cliente (lo agrega la acción, no esta función). */
  como: "nombre" | "palabra" | "id" | "analisis";
  /** Lo que se escribió (recortado): la frase del dropshipper o el ID. */
  cita: string;
  momento: string;
  direccion: "entrante" | "saliente";
  /** Cuántos mensajes del chat lo nombran. */
  veces: number;
}

const recortar = (t: string, n = 70) => {
  const limpio = t.replace(/\s+/g, " ").trim();
  return limpio.length > n ? `${limpio.slice(0, n - 1)}…` : limpio;
};

/**
 * Los productos de los que se habla en un chat, recordando toda la conversación (pedido de Hernán, 29 oct 2026: «que cada que pidan algo lo vayas
 * identificando»), el más reciente primero. De cada mensaje del dropshipper: los que nombra (`productosMencionados`) y se venden en su país
 * (`vendidos`) y los que nombra con dos palabras seguidas aunque no se vendan allá («cutting mix»), sin repetir versiones de lo mismo; si no
 * nombra ninguno, los que dice con una sola palabra entre los vendidos (`productosPorPalabra`: «la creatina»); si tampoco, lo que nombra con
 * una palabra en todo el catálogo.
 * De cualquier mensaje, también del equipo, los ID de Dropi que se nombran (`porIdDropi`). De cada producto, su mención más reciente y cuántas
 * veces salió.
 */
export function productosDeLaConversacion<T extends ProductoParaCruzar>(
  mensajes: readonly { texto: string | null; momento: string; direccion: string }[],
  catalogo: T[],
  vendidos: T[],
  porIdDropi: ReadonlyMap<string, T>,
  maximo = 6,
): { p: T; mencion: MencionEnChat }[] {
  const hallados = new Map<string, { p: T; mencion: MencionEnChat }>();
  const idsVendidos = new Set(vendidos.map((p) => p.id));
  const anotar = (p: T, como: MencionEnChat["como"], cita: string, m: { momento: string; direccion: string }) => {
    const antes = hallados.get(p.id);
    if (antes) antes.mencion.veces++;
    else hallados.set(p.id, { p, mencion: { como, cita: recortar(cita), momento: m.momento, direccion: m.direccion === "saliente" ? "saliente" : "entrante", veces: 1 } });
  };
  const ordenados = [...mensajes].filter((m) => m.texto?.trim() && (m.direccion === "entrante" || m.direccion === "saliente")).sort((a, b) => (a.momento < b.momento ? 1 : a.momento > b.momento ? -1 : 0));
  for (const m of ordenados) {
    const texto = m.texto as string;
    const enEste = new Set<string>();
    for (const id of idsDropiEnTexto(texto)) {
      const p = porIdDropi.get(id);
      if (p && !enEste.has(p.id)) {
        enEste.add(p.id);
        anotar(p, "id", `ID ${id}`, m);
      }
    }
    if (m.direccion !== "entrante") continue;
    // Lo que se vende en su país manda: «la creatina» es la creatina que se vende allá, no las del catálogo de otro país. Si lo que nombra no
    // se vende allá (pregunta por algo que todavía no llega), vale lo que nombra en todo el catálogo.
    const nombrados = productosMencionados(texto, catalogo, 5);
    const enPais = idsVendidos.size ? nombrados.filter((p) => idsVendidos.has(p.id)) : nombrados;
    // Lo nombrado con dos palabras seguidas que no se vende en su país también cuenta («cutting mix»), salvo que sea otra versión de algo
    // que sí se vende y ya salió (la «semilla de calabaza» de Vivonu cuando allá se vende la otra): sus palabras del texto ya están cubiertas.
    const delTexto = new Set(palabrasDe(texto).map(raiz));
    const tocadas = (p: T) => [...palabrasDelProducto(p)].filter((w) => delTexto.has(w));
    const cubierto = (p: T) => enPais.some((v) => p.id === v.id || tocadas(p).every((w) => palabrasDelProducto(v).has(w)));
    const conDosPalabras = productosMencionados(texto, catalogo, 5, false).filter((p) => !cubierto(p));
    let lista: { p: T; como: MencionEnChat["como"] }[] = [...enPais, ...conDosPalabras].slice(0, 3).map((p) => ({ p, como: "nombre" }));
    if (!lista.length) lista = productosPorPalabra(texto, vendidos.length ? vendidos : catalogo).map((p) => ({ p, como: "palabra" }));
    if (!lista.length) lista = nombrados.slice(0, 3).map((p) => ({ p, como: "nombre" }));
    for (const { p, como } of lista) {
      if (enEste.has(p.id)) continue;
      enEste.add(p.id);
      anotar(p, como, texto, m);
    }
  }
  return [...hallados.values()].slice(0, maximo);
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
