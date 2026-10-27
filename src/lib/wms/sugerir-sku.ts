// La sugerencia de SKU (regla elegida por Hernán, 8 oct 2026): las palabras del nombre en mayúsculas, sin acentos y unidas con
// barra («BALSAMO/PURPURA/MELAXIN»). Se saltan las palabras de relleno («de», «para», «con»…), los títulos («Dr.») y las medidas o números («9g», «50ml»,
// «2x1»), y se toman las 3 primeras que quedan. Después va **lo que distingue** a ese producto de otro igual (21 oct 2026): la cantidad de
// cápsulas, tabletas o gomitas, el color y la talla que diga el nombre («ACEITE/OREGANO/CAPSULAS/300/VERDE», «BOLSO/NAYLA/GRAN/PURPURA»), para
// que no haga falta un /2 y /3 que no dicen nada. Una variante agrega sus valores («/ROJO/M»). Es solo una sugerencia: la persona puede
// borrarla y escribir otro; el sistema no deja repetir un SKU. **Un producto compuesto (pack o combo) siempre empieza por COMBO**
// (27 oct 2026, pedido de Jhokser): «COMBO/OXIDO/NITRICO/SHILAJIT»; las palabras «combo» y «pack» del nombre no se repiten.

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

/** La palabra con que empieza el SKU de todo producto compuesto (pack o combo). */
export const PREFIJO_COMPUESTO = "COMBO";

/** El SKU sugerido para un nombre de producto (vacío si el nombre no tiene palabras útiles). Con `compuesto`, empieza por COMBO. */
export function sugerirSku(nombre: string, maxPalabras = 3, opciones: { compuesto?: boolean } = {}): string {
  const compuesto = opciones.compuesto === true;
  // Sin nombre no hay nada que sugerir (ni siquiera «COMBO»).
  if (!String(nombre ?? "").trim()) return "";
  const palabras = separar(nombre)
    .filter((p) => !RELLENO.has(palabraSku(p).toLowerCase()))
    // Medidas, cantidades y números («9g», «50ML», «2x1», «1000»): no identifican el producto.
    .filter((p) => !/^\d/.test(p))
    .map(palabraSku)
    .filter((p) => p.length >= 2)
    // En un compuesto, «combo», «pack» y «x2» ya los dice el prefijo.
    .filter((p) => !compuesto || (p !== PREFIJO_COMPUESTO && p !== "PACK" && !/^X\d{1,2}$/.test(p)));
  const base = palabras.slice(0, maxPalabras);
  if (compuesto) base.unshift(PREFIJO_COMPUESTO);
  if (base.length === 0) return "";
  // Lo que distingue al producto va después de su nombre, salvo que el nombre ya lo diga.
  const codigo = [...base, ...distintivosDeNombre(nombre).filter((d) => !base.includes(d))].join("/");
  if (codigo.length <= 60) return codigo;
  // Muy largo: se corta en una barra, nunca a media palabra.
  return codigo.slice(0, 60).replace(/\/[^/]*$/, "") || codigo.slice(0, 60);
}

/** El SKU de una variante: el del producto más los valores de sus opciones («BALSAMO/PURPURA/MELAXIN/ROJO/M»). */
export function sugerirSkuVariante(base: string, valores: string[]): string {
  const partes = valores.map(palabraSku).filter(Boolean);
  return [base || "SKU", ...partes].join("/").slice(0, 60);
}

/** El primero libre: el sugerido o, si ya existe, con /2, /3… */
export function primeroLibre(sugerido: string, existe: (codigo: string) => boolean): string {
  if (!existe(sugerido)) return sugerido;
  for (let n = 2; n < 1000; n++) {
    const c = `${sugerido}/${n}`;
    if (!existe(c)) return c;
  }
  return sugerido;
}
