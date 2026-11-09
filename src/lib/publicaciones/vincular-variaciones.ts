// Gestión de IDs Dropi › a qué variante nuestra corresponde cada variación de Dropi (9 nov 2026, pedido de Hernán). La publicación se vincula al producto principal;
// sus variaciones («Natural», «Negro / M», «+1.50», «2/5») se emparejan con las variantes del principal (`skus_maestros.opciones`). Solo se empareja si hay una sola
// variante que calce: si dos podrían, o ninguna (Dropi tiene una talla que nosotros no), queda sin vincular para elegirla a mano. Sin base ni React, con prueba.

export interface VarianteNuestra {
  id: string;
  codigo: string;
  /** Sus valores: {"Color": "Negro", "Talla": "M"}. */
  opciones: Record<string, unknown> | null;
}

const normal = (t: unknown) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Una talla escrita de varias formas: «2XL» y «XXL» son la misma, igual que «3XL» y «XXXL». */
const talla = (p: string) => p.replace(/^([2-5])xl$/, (_, n: string) => `${"x".repeat(Number(n))}l`);

/** Las palabras de una etiqueta o de unos valores, sin orden: «Negro / M» → {negro, m}. */
function palabras(texto: string): Set<string> {
  return new Set(
    normal(texto)
      .split(/[^a-z0-9.+]+/)
      .filter(Boolean)
      .map(talla),
  );
}

/** El número de una graduación o medida: «+1.50», «1,50», «2/5» (así escribe Dropi el 2.5 en algunos productos), «+1.50/35 a 40 años». */
function numero(texto: string): number | null {
  const m = /^[^0-9+-]*([+-]?\d+)(?:[.,:/](\d+))?/.exec(normal(texto));
  if (!m) return null;
  const n = Number(`${m[1]}.${m[2] ?? "0"}`);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

const iguales = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** La variante nuestra de una variación de Dropi, o `null` si no hay una sola que calce. */
export function emparejarVariacion(variacion: { etiqueta: string; sku: string | null }, variantes: VarianteNuestra[]): string | null {
  const unica = (lista: VarianteNuestra[]) => (lista.length === 1 ? lista[0].id : null);
  // 1. El mismo SKU.
  if (variacion.sku) {
    const porSku = unica(variantes.filter((v) => normal(v.codigo) === normal(variacion.sku)));
    if (porSku) return porSku;
  }
  const valores = (v: VarianteNuestra) => Object.values(v.opciones ?? {}).map((x) => String(x ?? "")).filter(Boolean);
  // 2. Los mismos valores, en cualquier orden: «NATURAL BLACK» = «Black Natural», «Negro / M» = {Color: Negro, Talla: M}.
  const etiqueta = palabras(variacion.etiqueta);
  const porValores = unica(variantes.filter((v) => valores(v).length > 0 && iguales(palabras(valores(v).join(" ")), etiqueta)));
  if (porValores) return porValores;
  // 3. El mismo número, para las graduaciones: «2/5» = «+2.50», «+1.50/35 a 40 años» = «+1.50». Solo si la variante tiene un solo valor y es un número.
  const n = numero(variacion.etiqueta);
  if (n === null) return null;
  return unica(variantes.filter((v) => valores(v).length === 1 && numero(valores(v)[0]) === n && /^[+-]?\d/.test(normal(valores(v)[0]))));
}

/** La clave de una variación en un producto de Dropi. */
export const claveVariacion = (dropiId: number | string, firma: string) => `${dropiId}|${firma}`;
