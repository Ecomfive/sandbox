/**
 * Recepción de compras y reglas de Costa Rica (6 nov 2026, pedido de Hernán, flujograma de Proveeduría Costa Rica). Lógica pura, con prueba.
 */

/** Los países donde se reciben compras desde Inventario. Por ahora Costa Rica: los demás siguen como estaban. */
export const PAISES_CON_RECEPCION = ["CR"];

/** Los países donde toda salida va con remisión: la salida a mano queda para un administrador, con motivo. */
export const PAISES_SALIDA_CON_REMISION = ["CR"];

export const SOLO_ADMIN_MOVIMIENTO = "En este país, una salida a mano solo la hace un administrador. Para sacar mercancía usa una remisión.";

/**
 * Si esa persona puede hacer ese movimiento a mano en ese país. Donde toda salida va con remisión, la salida a mano es de un administrador; corregir un valor (ajuste, siempre con
 * nota) lo hace cualquiera que edite el inventario, en todos los países (7 nov 2026, pedido de Hernán).
 */
export const puedeMoverAMano = (tipo: string, codigoPais: string | null | undefined, esAdmin: boolean) => esAdmin || tipo !== "salida" || !PAISES_SALIDA_CON_REMISION.includes(codigoPais ?? "");

/** Si ese movimiento a mano necesita motivo en ese país: un ajuste siempre, y una salida donde va con remisión. */
export const pideMotivo = (tipo: string, codigoPais: string | null | undefined) => tipo === "ajuste" || (tipo === "salida" && PAISES_SALIDA_CON_REMISION.includes(codigoPais ?? ""));

/** Las etapas en que una compra se puede recibir: en camino o ya llegó. Las completadas quedaron dentro del levantamiento y recibirlas las contaría dos veces. */
export const ETAPAS_POR_RECIBIR = ["tracking", "arribo_mercancia"];

export interface LineaRecepcion {
  item: string;
  cantidad: number;
  nota?: string | null;
  ubicacion?: string | null;
  lote_codigo?: string | null;
  vencimiento?: string | null;
}

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CANTIDAD = 1_000_000;

/** Por qué una línea no se puede recibir, o `null` si se puede. */
export function bloqueoDeLinea(s: { tipo: string; clase: string; conVariantes: boolean }): string | null {
  if (s.tipo === "combo") return "Es un compuesto: no guarda stock.";
  if (s.clase === "test") return "Está en Test: pásalo a Activo para recibirlo.";
  if (s.conVariantes) return "Tiene variantes: en la compra elige la variante.";
  return null;
}

/** Lo que llegó menos lo pedido: negativo si faltó. */
export const diferenciaRecepcion = (pedida: number, llego: number) => llego - pedida;

/** Revisa y limpia lo que manda la pantalla. La base vuelve a comprobarlo contra la compra. */
export function revisarRecepcion(items: unknown): { items: LineaRecepcion[] } | { error: string } {
  if (!Array.isArray(items) || items.length === 0) return { error: "Escribe cuánto llegó de al menos un producto." };
  if (items.length > 500) return { error: "Son demasiados productos a la vez." };
  const vistos = new Set<string>();
  const limpios: LineaRecepcion[] = [];
  for (const it of items) {
    const o = (it ?? {}) as Record<string, unknown>;
    const item = typeof o.item === "string" ? o.item : "";
    if (!ES_ID.test(item) || vistos.has(item)) return { error: "Un producto de la recepción no es válido." };
    vistos.add(item);
    const cantidad = Number(o.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > MAX_CANTIDAD) return { error: "Una cantidad no es válida." };
    const ubicacion = typeof o.ubicacion === "string" && o.ubicacion ? o.ubicacion : null;
    if (ubicacion && !ES_ID.test(ubicacion)) return { error: "Una ubicación no es válida." };
    const vencimiento = typeof o.vencimiento === "string" && o.vencimiento ? o.vencimiento : null;
    if (vencimiento && (!FECHA.test(vencimiento) || Number.isNaN(Date.parse(vencimiento)))) return { error: "Una fecha de vencimiento no es válida." };
    const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
    limpios.push({ item, cantidad, nota: texto(o.nota, 300) || null, ubicacion, lote_codigo: texto(o.lote_codigo, 80) || null, vencimiento });
  }
  return { items: limpios };
}
