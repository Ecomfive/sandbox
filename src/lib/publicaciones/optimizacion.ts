// Gestión de IDs Dropi › Optimización de la publicación (22 oct 2026): lo que le falta a cada publicación en Dropi para venderse
// mejor (título en español, con la cantidad y para qué sirve; fotos, video, descripción y precio sugerido). Cada punto que falta se
// vuelve una recomendación (y, al aceptarla, una tarea que el sistema da por hecha cuando Dropi ya muestra el cambio). Los datos de
// Dropi salen de la lectura del catálogo (Análisis de competencia); fotos, video y descripción, desde la migración 0129 y la lectura
// siguiente: sin ellos, el punto queda «Sin datos». Sin base ni React, con prueba.

import { medidaEnNombre } from "@/lib/competencia/analisis";
import type { Reglas } from "./reglas";

export type ClaveRevision = "titulo_espanol" | "titulo_largo" | "titulo_cantidad" | "titulo_angulo" | "titulo_formato" | "fotos" | "video" | "descripcion" | "precio_sugerido";

export type EstadoRevision = "ok" | "falta" | "revisar" | "sin_datos" | "no_aplica";

export interface Revision {
  clave: ClaveRevision;
  etiqueta: string;
  estado: EstadoRevision;
  /** Qué se vio («Palabras en inglés: hair, growth»). */
  detalle: string;
}

export interface EntradaRevision {
  /** El título como se ve en Dropi (si no se leyó, el de la publicación). */
  titulo: string;
  /** La categoría de Dropi, si se leyó. */
  categoria: string | null;
  precio: number | null;
  precioSugerido: number | null;
  /** null = todavía no se sabe (sin la lectura con fotos, video y descripción). */
  fotos: number | null;
  videos: number | null;
  descripcionLargo: number | null;
  /** Se leyó de Dropi en el catálogo (si no, precio sugerido y lo demás no se pueden revisar). */
  leidoEnDropi: boolean;
  /** El nombre del producto vinculado (Producto): sus palabras en inglés son su nombre comercial y no cuentan como inglés. */
  nombreProducto?: string | null;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Palabras en inglés que suelen quedar en los títulos (el nombre del proveedor o del fabricante): una sola basta para avisar.
 * Solo las que no se usan igual en español («kit», «pack», «mini», «spray» no cuentan).
 */
const INGLES = new Set(
  "cream oil hair growth blocker skin care face body wash cleanser brush massager massage mask eye eyes lash lashes nail nails light lamp wireless charger bottle cup bag belt support back pain relief sleep slim fat burner whitening teeth smart watch tea coffee serum pills powder gummies gummy capsules tablets women woman men man kids baby dog cat pet home kitchen car shoes shoe dress shirt pants hat glasses phone case cover holder stand cleaner remover removal hot cold ice heat heating cooling sticker stickers patch patches pad pads roller scrubber shaver trimmer clipper dryer curler straightener vacuum blender bands band fitness yoga gym resistance weight loss detox natural organic beauty anti aging wrinkle collagen booster extra strength max plus".split(" "),
);
// Las que también son españolas o casi siempre aparecen como marca: no cuentan.
for (const p of ["max", "plus", "extra", "natural", "detox", "anti", "yoga", "fitness", "gym", "collagen"]) INGLES.delete(p);

/**
 * Las palabras en inglés del título. Las que están en `nombreProducto` no cuentan: si el producto se llama en inglés («15 Days Cleanse»),
 * el título conserva ese nombre tal cual (pedido de Alcides, 23 oct 2026); lo que se le agrega va en español.
 */
export function palabrasEnIngles(titulo: string, nombreProducto?: string | null): string[] {
  const delNombre = new Set(sinTildes(nombreProducto ?? "").split(/[^a-z]+/));
  const vistas = new Set<string>();
  for (const w of sinTildes(titulo).split(/[^a-z]+/)) if (w.length >= 3 && INGLES.has(w) && !delNombre.has(w)) vistas.add(w);
  return [...vistas];
}

/** Un suplemento (por la categoría de Dropi o por el título): su título debe decir cuántas cápsulas, gomitas o tabletas trae. */
const SUPLEMENTO = /suplement|vitamin|capsul|gomita|gummi|tablet|softgel|colageno|magnesio|omega|biotina|ashwagandha|creatina|probiotic|melatonina|zinc|resveratrol|espirulina|moringa|maca|fenogreco|berberina|curcuma|cucurbita|saw palmetto|dht|keto|quemador/;

export function esSuplemento(titulo: string, categoria: string | null): boolean {
  return SUPLEMENTO.test(sinTildes(`${titulo} ${categoria ?? ""}`));
}

/** El título dice para qué es («para la ciática», «contra la caída», «anti…», «alivio», «reduce…»). */
const ANGULO = /\b(para|contra|anti|alivio|alivia|reduce|elimina|mejora|ayuda|ideal|quita|combate|previene|controla|fortalece|aumenta)\b/;
/**
 * O lo dice directo, sin «para» («15 Days Cleanse 30ca Limpieza Intestinal»): el uso o el beneficio como sustantivo. Sin tildes y en
 * minúsculas; se puede sumar uno nuevo aquí.
 */
const USO = /\b(limpieza|desintoxica\w*|depurativ\w*|salud|energia|sueno|descanso|relajacion|digesti\w*|intestin\w*|colon|cabello|crecimiento|caida|piel|unas|articulac\w*|huesos|inmun\w*|defensas|memoria|concentracion|estres|ansiedad|libido|rendimiento|muscul\w*|adelgaz\w*|quema\w*|metabolismo|hidratacion|manchas|arrugas|acne|dolor|circulacion|prostata|higado|rinones|vista|antioxidante|belleza|cuidado)\b/;

export function tieneAngulo(titulo: string): boolean {
  const t = sinTildes(titulo);
  return ANGULO.test(t) || USO.test(t);
}

/**
 * La cantidad abreviada, cuando el nombre completo no cabe en los 40 caracteres de Dropi (pedido de Alcides, 23 oct 2026): «30c» o
 * «30ca» cápsulas, «60sg» softgels, «30go» gomitas, «60t» tabletas (también «caps» y «tab»). Con o sin espacio entre número y letras.
 */
export const ABREVIATURAS_CANTIDAD = [
  { abrev: "c", nombre: "cápsulas" },
  { abrev: "sg", nombre: "softgels" },
  { abrev: "go", nombre: "gomitas" },
  { abrev: "t", nombre: "tabletas" },
] as const;
const CANTIDAD_ABREVIADA = /\b\d+\s?(c|ca|cap|caps|sg|go|t|tab|tabs)\b/;

/** Una cantidad en el título: contenido (cápsulas, ml, g) o unidades (x2, 2 pares, pack 3, 2 unidades). */
export function tieneCantidad(titulo: string): boolean {
  if (medidaEnNombre(titulo)) return true;
  if (CANTIDAD_ABREVIADA.test(sinTildes(titulo))) return true;
  return /\b(\d+\s*(?:x|unidades?|pares?|piezas?|pzs?|uds?)\b|x\s?\d+\b|pack\s*-?\s*\d+)/i.test(sinTildes(titulo));
}

export const ETIQUETA_REVISION: Record<ClaveRevision, string> = {
  titulo_espanol: "Título en español",
  titulo_largo: "Largo del título",
  titulo_cantidad: "Cantidad en el título",
  titulo_angulo: "Para qué sirve, en el título",
  titulo_formato: "Título claro",
  fotos: "Fotos",
  video: "Video",
  descripcion: "Descripción",
  precio_sugerido: "Precio sugerido",
};

/** La revisión completa de una publicación, en el orden en que se muestra. */
export function revisarPublicacion(p: EntradaRevision, reglas: Pick<Reglas, "min_titulo" | "max_titulo" | "min_fotos" | "min_descripcion">): Revision[] {
  const r = (clave: ClaveRevision, estado: EstadoRevision, detalle: string): Revision => ({ clave, etiqueta: ETIQUETA_REVISION[clave], estado, detalle });
  const t = p.titulo.trim();
  const ingles = palabrasEnIngles(t, p.nombreProducto);
  const palabras = t.split(/\s+/).filter(Boolean);
  const letras = t.replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ]/g, "");
  const mayusculas = letras.length >= 8 && letras === letras.toUpperCase();
  const suple = esSuplemento(t, p.categoria);
  const sinDatos = "Se sabrá con la próxima lectura de Dropi";

  return [
    r("titulo_espanol", ingles.length ? "falta" : "ok", ingles.length ? `Palabras en inglés: ${ingles.join(", ")}` : "En español"),
    // Dropi no deja títulos largos: más de `max_titulo` caracteres (40) no se admiten.
    // Lo ideal: entre `min_titulo` (35) y `max_titulo` (40) caracteres. Más largo, Dropi no lo admite; más corto, desaprovecha espacio.
    r(
      "titulo_largo",
      t.length > reglas.max_titulo || t.length < reglas.min_titulo ? "falta" : "ok",
      t.length > reglas.max_titulo
        ? `${t.length} caracteres: pasa del máximo de ${reglas.max_titulo}`
        : t.length < reglas.min_titulo
          ? `${t.length} caracteres: se pueden usar entre ${reglas.min_titulo} y ${reglas.max_titulo}`
          : `${t.length} caracteres (entre ${reglas.min_titulo} y ${reglas.max_titulo})`,
    ),
    suple
      ? r("titulo_cantidad", tieneCantidad(t) ? "ok" : "falta", tieneCantidad(t) ? "Dice la cantidad" : "Es un suplemento y no dice cuántas cápsulas, gomitas o tabletas trae")
      : r("titulo_cantidad", tieneCantidad(t) ? "ok" : "no_aplica", tieneCantidad(t) ? "Dice la cantidad" : "No es un suplemento"),
    // Para qué sirve no se puede confirmar con una regla: si no dice «para…», «contra…», «alivio…», queda para revisar.
    r("titulo_angulo", tieneAngulo(t) ? "ok" : "revisar", tieneAngulo(t) ? "Dice para qué sirve" : "No dice para qué sirve («para…», «contra…», «alivio de…»)"),
    r(
      "titulo_formato",
      palabras.length < 3 ? "falta" : mayusculas ? "falta" : "ok",
      palabras.length < 3 ? `Muy corto (${palabras.length} ${palabras.length === 1 ? "palabra" : "palabras"})` : mayusculas ? "Todo en mayúsculas" : "Claro",
    ),
    p.fotos === null
      ? r("fotos", "sin_datos", sinDatos)
      : r("fotos", p.fotos >= reglas.min_fotos ? "ok" : "falta", `${p.fotos} de ${reglas.min_fotos} fotos como mínimo`),
    p.videos === null ? r("video", "sin_datos", sinDatos) : r("video", p.videos > 0 ? "ok" : "falta", p.videos > 0 ? `${p.videos} ${p.videos === 1 ? "video" : "videos"}` : "Sin video"),
    p.descripcionLargo === null
      ? r("descripcion", "sin_datos", sinDatos)
      : r("descripcion", p.descripcionLargo >= reglas.min_descripcion ? "ok" : "falta", `${p.descripcionLargo} de ${reglas.min_descripcion} caracteres como mínimo`),
    !p.leidoEnDropi
      ? r("precio_sugerido", "sin_datos", "No se leyó en el catálogo de Dropi")
      : p.precioSugerido === null || p.precioSugerido <= 0
        ? r("precio_sugerido", "falta", "Sin precio sugerido en Dropi")
        : // El sugerido va IGUAL al precio (decisión de Alcides, 23 oct 2026): el dropshipper no lo usa de referencia y, si es más alto,
          // Dropi no le deja montar una orden por debajo de él.
          p.precio !== null && Math.abs(p.precioSugerido - p.precio) > 0.005
          ? r("precio_sugerido", "falta", `Sugerido $${p.precioSugerido.toFixed(2)}, nuestro precio $${p.precio.toFixed(2)}: debe ser igual al precio`)
          : r("precio_sugerido", "ok", `$${p.precioSugerido.toFixed(2)}, igual al precio`),
  ];
}

/** La nota de la publicación: cuántos puntos cumple de los que se pueden revisar (sin «sin datos» ni «no aplica»). */
export function notaOptimizacion(revs: Revision[]): { cumple: number; total: number } {
  const evaluables = revs.filter((r) => r.estado !== "sin_datos" && r.estado !== "no_aplica");
  return { cumple: evaluables.filter((r) => r.estado === "ok").length, total: evaluables.length };
}
