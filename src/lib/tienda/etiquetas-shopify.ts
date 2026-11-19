// Etiquetas del pedido escritas desde el sistema (19 nov 2026, pedido de Hernán: «literal lo que ya hacemos con Dropi: al cambiar una etiqueta aquí en el
// sistema se debe cambiar en Shopify y gestionar desde el sistema»). Atención al cliente valida pedidos y cambia etiquetas («Confirmada», «Pendiente»,
// «ANULADO/VERIFICADO»…): el estado del pedido en el sistema sale de esas etiquetas (`estadoDesdeFinanzas`). Reglas puras, sin base ni Shopify; con prueba.

/** La etiqueta con que la tienda da un pedido por confirmado (la misma que lee `estadoDesdeFinanzas`). */
export const ETIQUETA_CONFIRMADA = "Confirmada";

/** Shopify no acepta etiquetas de más de 40 caracteres. */
export const MAX_ETIQUETA = 40;

/** Las que ponen las apps de la tienda (formularios de pago contra entrega, el bot, carritos): no se sugieren, aunque se pueden quitar. */
const DE_APPS = /(_cod_form$|^abandoned_checkout|^chatbot$|^carrito-recuperado$)/i;

const clave = (t: string) => t.toLocaleLowerCase("es").replace(/\s+/g, " ").trim();

/** Una etiqueta escrita por una persona, lista para Shopify (sin comas ni espacios de más), o null si no sirve (vacía o muy larga). */
export function limpiarEtiqueta(t: unknown): string | null {
  const s = String(t ?? "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || s.length > MAX_ETIQUETA) return null;
  return s;
}

/** ¿El pedido ya está confirmado? («Confirmada» o «Confirmado», sin importar mayúsculas). */
export function esConfirmada(etiquetas: string[]): boolean {
  return etiquetas.some((e) => /^confirmad[ao]$/i.test(e.trim()));
}

/**
 * Lo que de verdad cambia: se agrega solo lo que el pedido no tiene y se quita solo lo que tiene (Shopify no distingue mayúsculas en las etiquetas).
 * `final` es cómo queda, en el orden de antes y lo nuevo al final.
 */
export function planCambio(actuales: string[], agregar: string[], quitar: string[]): { agregar: string[]; quitar: string[]; final: string[] } {
  const tiene = new Set(actuales.map(clave));
  const fuera = new Set(quitar.map(clave));
  const q = actuales.filter((e) => fuera.has(clave(e)));
  const vistas = new Set<string>();
  const a = agregar.filter((e) => {
    const k = clave(e);
    if (tiene.has(k) || fuera.has(k) || vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  return { agregar: a, quitar: q, final: [...actuales.filter((e) => !fuera.has(clave(e))), ...a] };
}

/** El cambio en palabras, para el historial del pedido: «Agregó «Confirmada» y quitó «Pendiente»». */
export function textoCambio(agregar: string[], quitar: string[]): string {
  const lista = (xs: string[]) => xs.map((x) => `«${x}»`).join(", ");
  const partes = [agregar.length ? `agregó ${lista(agregar)}` : "", quitar.length ? `quitó ${lista(quitar)}` : ""].filter(Boolean);
  const t = partes.join(" y ");
  return t ? `Etiquetas en Shopify: ${t}` : "Etiquetas en Shopify: sin cambios";
}

/** Las etiquetas para sugerir al agregar: las que más usa la tienda, sin las de las apps ni las que el pedido ya tiene. */
export function etiquetasSugeridas(usadas: string[][], actuales: string[], max = 12): string[] {
  const ya = new Set(actuales.map(clave));
  const cuenta = new Map<string, { texto: string; n: number }>();
  for (const lista of usadas)
    for (const e of lista) {
      const t = e.trim();
      if (!t || DE_APPS.test(t) || ya.has(clave(t))) continue;
      const k = clave(t);
      const c = cuenta.get(k);
      if (c) c.n++;
      else cuenta.set(k, { texto: t, n: 1 });
    }
  return [...cuenta.values()]
    .sort((a, b) => b.n - a.n || a.texto.localeCompare(b.texto, "es"))
    .slice(0, max)
    .map((c) => c.texto);
}
