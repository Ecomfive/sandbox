// La sugerencia de SKU (regla elegida por Hernán, 8 oct 2026): las palabras del nombre en mayúsculas, sin acentos y unidas con
// barra («BALSAMO/PURPURA/MELAXIN»). Se saltan las palabras de relleno («de», «para», «con»…), los títulos («Dr.») y las medidas o números («9g», «50ml»,
// «2x1»), y se toman las 3 primeras que quedan. Después va **lo que distingue** a ese producto de otro igual (21 oct 2026): la cantidad de
// cápsulas, tabletas o gomitas, el color y la talla que diga el nombre («ACEITE/OREGANO/CAPSULAS/300/VERDE», «BOLSO/NAYLA/GRAN/PURPURA»), para
// que no haga falta un /2 y /3 que no dicen nada. Una variante agrega sus valores («/ROJO/M»). Es solo una sugerencia: la persona puede
// borrarla y escribir otro; el sistema no deja repetir un SKU. **Un producto compuesto empieza por PACK, PACKS o COMBO** (23 nov 2026, pedido
// de Jhokser; antes todo empezaba por COMBO): la **primera** promoción por cantidad de un producto = «PACK/…»; una **segunda** promoción de otra cantidad del
// mismo producto = «PACKS/…» (no importa si son 2, 3 o más unidades); dos o más productos DISTINTOS = «COMBO/…» con el SKU de cada uno unido por «+»
// («COMBO/TRULY/GLAZED+ESPUMA/EELHOE»). Las palabras «combo», «pack» y «packs» del nombre no se repiten.
// **Un pack del mismo producto por cantidad (2x1, pack de 2, x3…) NO lleva la cantidad en el SKU** (11 nov 2026, pedido de Jhokser):
// «PACK/ACEITE/NATURAL/VEGANIC», nunca «…/X2», «…/PACK/2» ni «…/2»; el SKU del compuesto es el del producto con PACK (o PACKS) delante. Dos
// packs de productos distintos se separan por lo que de verdad los distingue (el color: «PACK/BASE/MAQUILLAJE/ZEPHOCO/DARK»), no por
// un número. Lo único numérico que se queda es la cuenta de cápsulas, tabletas o gomitas del envase («…/TOPLUX/60»), que es del producto
// y no de la cantidad de unidades.

const RELLENO = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "para", "con", "sin", "en", "por", "a", "al", "un", "una", "x", "dr", "dra", "mr", "mrs"]);

/** Colores que distinguen a un producto (en las dos formas de género y en inglés). Sin «crema», «oro» ni «plata»: son también de productos. */
const COLORES = new Set(
  (
    "ROJO ROJA AZUL VERDE NEGRO NEGRA BLANCO BLANCA AMARILLO AMARILLA NARANJA MORADO MORADA PURPURA ROSA ROSADO ROSADA GRIS CAFE MARRON BEIGE " +
    "DORADO DORADA PLATEADO PLATEADA TURQUESA CELESTE FUCSIA LILA VIOLETA VINO NUDE KAKI " +
    "RED BLUE GREEN BLACK WHITE YELLOW ORANGE PURPLE PINK GRAY GREY BROWN GOLD SILVER"
  ).split(" "),
);

/** Tallas que se reconocen solas; S, M y L solo si el nombre dice «talla» o «size» antes. */
const TALLAS = new Set(["XS", "XL", "XXL", "XXXL", "2XL", "3XL", "4XL"]);
const TALLAS_CORTAS = new Set(["S", "M", "L"]);

/** Lo que se cuenta por unidades dentro de un envase: «300 capsulas» distingue un producto de otro («180 capsulas»). */
const CONTEO = new Set(["CAPSULAS", "CAPSULA", "CAPS", "CAP", "SOFTGELS", "TABLETAS", "TABLETA", "TABS", "GOMITAS", "CAPSULES"]);

const separar = (nombre: string) =>
  nombre
    .split(/[\s/.,;:()\-–_"«»+&]+/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Lo que distingue al producto según su nombre, en orden de aparición: cantidad de cápsulas, colores y talla («300», «VERDE»). */
export function distintivosDeNombre(nombre: string): string[] {
  const partes = separar(nombre).map(palabraSku);
  const salida: string[] = [];
  const agregar = (x: string) => {
    if (!salida.includes(x)) salida.push(x);
  };
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    if (!p) continue;
    const pegado = /^(\d{2,4})([A-Z]+)$/.exec(p);
    if (pegado && CONTEO.has(pegado[2])) agregar(pegado[1]);
    else if (/^\d{2,4}$/.test(p) && CONTEO.has(partes[i + 1] ?? "")) agregar(p);
    else if (COLORES.has(p)) agregar(p);
    else if (TALLAS.has(p)) agregar(p);
    else if (TALLAS_CORTAS.has(p) && ["TALLA", "SIZE"].includes(partes[i - 1] ?? "")) agregar(p);
  }
  return salida;
}

/** Una palabra en mayúsculas, sin acentos ni signos («Púrpura» → «PURPURA»). */
export const palabraSku = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** La palabra con que empieza el SKU de un combo de productos distintos. */
export const PREFIJO_COMPUESTO = "COMBO";
/** La primera promoción por cantidad de un producto: «PACK». La segunda, de otra cantidad del mismo producto: «PACKS». */
export const PREFIJO_PACK = "PACK";
export const PREFIJO_PACKS = "PACKS";

/** El SKU sugerido para un nombre de producto (vacío si el nombre no tiene palabras útiles). Con `compuesto`, empieza por COMBO o por el `prefijo` que se dé (PACK, PACKS). */
export function sugerirSku(nombre: string, maxPalabras = 3, opciones: { compuesto?: boolean; prefijo?: string } = {}): string {
  const compuesto = opciones.compuesto === true;
  // Sin nombre no hay nada que sugerir (ni siquiera «COMBO»).
  if (!String(nombre ?? "").trim()) return "";
  const palabras = separar(nombre)
    .filter((p) => !RELLENO.has(palabraSku(p).toLowerCase()))
    // Medidas, cantidades y números («9g», «50ML», «2x1», «1000»): no identifican el producto.
    .filter((p) => !/^\d/.test(p))
    .map(palabraSku)
    .filter((p) => p.length >= 2)
    // En un compuesto, «combo», «pack», «packs» y «x2» ya los dice el prefijo.
    .filter((p) => !compuesto || (p !== PREFIJO_COMPUESTO && p !== PREFIJO_PACK && p !== PREFIJO_PACKS && !/^X\d{1,2}$/.test(p)));
  const base = palabras.slice(0, maxPalabras);
  if (compuesto) base.unshift(opciones.prefijo ?? PREFIJO_COMPUESTO);
  if (base.length === 0) return "";
  // Lo que distingue al producto va después de su nombre, salvo que el nombre ya lo diga.
  const codigo = [...base, ...distintivosDeNombre(nombre).filter((d) => !base.includes(d))].join("/");
  if (codigo.length <= 60) return codigo;
  // Muy largo: se corta en una barra, nunca a media palabra.
  return codigo.slice(0, 60).replace(/\/[^/]*$/, "") || codigo.slice(0, 60);
}

/** Lo más largo que se deja un SKU sugerido de un combo de varios productos (los dos SKU unidos por «+»). */
const MAX_COMBO = 80;

/** Los dos o tres primeros tramos de un SKU («OXIDO/NITRICO/SHILAJIT» → «OXIDO/NITRICO»), para acortar un combo muy largo. */
const tramos = (codigo: string, n: number) => codigo.split("/").slice(0, n).join("/");

/**
 * El SKU sugerido de un compuesto (23 nov 2026, pedido de Jhokser), según lo que lleva:
 * - **Un solo producto, varias unidades** (un pack): «PACK/» y el SKU de ese producto («PACK/CREMA/NIDA»); si ese SKU ya es de otra promoción del mismo producto
 *   (otra cantidad), `primeroLibre` lo pasa a «PACKS/».
 * - **Dos o más productos distintos** (un combo): «COMBO/» y el SKU de cada producto unido por «+» («COMBO/TRULY/GLAZED+ESPUMA/EELHOE»). Si pasa de
 *   80 letras se acorta cada SKU a sus primeros tramos.
 * - **Sin productos elegidos todavía**: sale del nombre; si el nombre dice una cantidad («Pack 3», «2x1») empieza por PACK y si no dice nada, por COMBO.
 */
export function sugerirSkuCompuesto(d: { nombre: string; componentes?: { codigo: string; cantidad: number }[] }): string {
  const comps = (d.componentes ?? []).map((c) => ({ codigo: String(c.codigo ?? "").trim().toUpperCase(), cantidad: c.cantidad })).filter((c) => c.codigo);
  if (comps.length >= 2) {
    const completo = `${PREFIJO_COMPUESTO}/${comps.map((c) => c.codigo).join("+")}`;
    if (completo.length <= MAX_COMBO) return completo;
    for (const n of [3, 2, 1]) {
      const corto = `${PREFIJO_COMPUESTO}/${comps.map((c) => tramos(c.codigo, n)).join("+")}`;
      if (corto.length <= MAX_COMBO) return corto;
    }
    return `${PREFIJO_COMPUESTO}/${comps.map((c) => tramos(c.codigo, 1)).join("+")}`.slice(0, MAX_COMBO);
  }
  if (comps.length === 1) return `${comps[0].cantidad >= 2 ? PREFIJO_PACK : PREFIJO_COMPUESTO}/${comps[0].codigo}`;
  return sugerirSku(d.nombre, 3, { compuesto: true, prefijo: cantidadEnNombre(d.nombre) ? PREFIJO_PACK : PREFIJO_COMPUESTO });
}

/** El SKU de una variante: el del producto más los valores de sus opciones («BALSAMO/PURPURA/MELAXIN/ROJO/M»). */
export function sugerirSkuVariante(base: string, valores: string[]): string {
  const partes = valores.map(palabraSku).filter(Boolean);
  return [base || "SKU", ...partes].join("/").slice(0, 60);
}

/** La palabra (no el número) con que se distingue un pack de más unidades cuando el SKU sin sufijo ya es de otro pack del mismo producto. */
const PALABRA_DE_CANTIDAD: Record<number, string> = { 2: "DUO", 3: "TRIO", 4: "CUARTETO", 5: "QUINTETO", 6: "SEXTETO" };

/** Cuántas unidades dice un nombre de pack («Pack 3», «x3», «Pack de 3», «3x1»); null si no dice. */
export function cantidadEnNombre(nombre: string): number | null {
  const t = String(nombre ?? "");
  const m = /(?:\bx|\bpack(?:\s+de)?|\bcombo(?:\s+de)?)[\s-]*(\d{1,2})\b/i.exec(t) ?? /\b(\d{1,2})\s*x\s*1\b/i.exec(t);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 2 ? n : null;
}

/**
 * El primero libre: el sugerido o, si ya existe, el siguiente. Una **segunda promoción** del mismo producto (23 nov 2026, pedido de Jhokser) pasa de «PACK/…» a
 * «PACKS/…»; una tercera lleva además la palabra de su cantidad («PACKS/CREMA/NIDA/CUARTETO», 11 nov 2026), nunca un número; solo si esa palabra tampoco
 * está libre o no se sabe la cantidad, va /2, /3…
 */
export function primeroLibre(sugerido: string, existe: (codigo: string) => boolean, cantidad?: number | null): string {
  if (!existe(sugerido)) return sugerido;
  // La segunda promoción por cantidad del mismo producto: PACK → PACKS.
  if (sugerido.startsWith(`${PREFIJO_PACK}/`)) {
    const plural = `${PREFIJO_PACKS}/${sugerido.slice(PREFIJO_PACK.length + 1)}`;
    if (!existe(plural)) return plural;
    sugerido = plural;
  }
  const palabra = cantidad ? PALABRA_DE_CANTIDAD[cantidad] : undefined;
  if (palabra && !existe(`${sugerido}/${palabra}`)) return `${sugerido}/${palabra}`;
  for (let n = 2; n < 1000; n++) {
    const c = `${sugerido}/${n}`;
    if (!existe(c)) return c;
  }
  return sugerido;
}
