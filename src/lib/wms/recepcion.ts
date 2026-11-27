/**
 * Recepción de compras (Costa Rica desde el 6 nov 2026, Panamá desde el 26 nov 2026) y reglas de Costa Rica (flujograma de Proveeduría Costa Rica). Lógica pura, con prueba.
 */
import { ETAPAS_LLEGADA_PUERTO } from "@/lib/compras/etapas-puerto";
import { codigoLote } from "./vencimiento";

/** Los países con las pantallas de plataformas de Inventario (Cuadro y Novedades). Por ahora Costa Rica. */
export const PAISES_CON_RECEPCION = ["CR"];

/** Los países donde se reciben compras desde Inventario (pestaña Recepción). */
export const PAISES_QUE_RECIBEN_COMPRAS = ["CR", "PA"];

export interface ReglaRecepcion {
  /** Las etapas de compra que salen por recibir. */
  etapas: string[];
  /** Además, las compras completadas desde este día (AAAA-MM-DD), o `null`: las de antes ya están contadas. */
  completadasDesde: string | null;
  /** La casilla «Llegaron» viene escrita con lo pedido y se corrige si llegó otra cosa. */
  vieneEscrita: boolean;
  /** Deja marcar una línea como recibida sin sumarla, porque ya se había contado a mano. */
  admiteYaContadas: boolean;
}

/** Los países donde toda salida va con remisión: la salida a mano queda para un administrador o quien tenga el permiso «Salida a mano» (`autorizadaParaSalidaManual`), con motivo. */
export const PAISES_SALIDA_CON_REMISION = ["CR"];

export const SOLO_ADMIN_MOVIMIENTO = "En este país, una salida a mano solo la hace un administrador o quien tenga el permiso «Salida a mano». Para sacar mercancía usa una remisión.";

/**
 * Si esa persona puede hacer ese movimiento a mano en ese país. Donde toda salida va con remisión, la salida a mano es de una persona autorizada (administrador o con el módulo `salida-manual`); corregir un valor (ajuste, siempre con
 * nota) lo hace cualquiera que edite el inventario, en todos los países (7 nov 2026, pedido de Hernán).
 */
export const puedeMoverAMano = (tipo: string, codigoPais: string | null | undefined, autorizada: boolean) => autorizada || tipo !== "salida" || !PAISES_SALIDA_CON_REMISION.includes(codigoPais ?? "");

/** Si ese movimiento a mano necesita motivo en ese país: un ajuste siempre, y una salida donde va con remisión. */
export const pideMotivo = (tipo: string, codigoPais: string | null | undefined) => tipo === "ajuste" || (tipo === "salida" && PAISES_SALIDA_CON_REMISION.includes(codigoPais ?? ""));

/** Las etapas en que una compra se puede recibir: en camino o ya llegó. Las completadas quedaron dentro del levantamiento y recibirlas las contaría dos veces. */
export const ETAPAS_POR_RECIBIR = ["tracking", ...ETAPAS_LLEGADA_PUERTO, "en_bodega"];

/** Desde cuándo una compra completada de Panamá sin recibir todavía sale en Recepción (el día en que empezó allí). */
export const COMPLETADAS_DE_PANAMA_DESDE = "2026-11-24";

/**
 * Cómo se recibe en cada país, o `null` si no se recibe desde Inventario. En Panamá (26 nov 2026, pedido de Dinora) sale lo que ya llegó a puerto o a bodega, con lo pedido ya escrito;
 * en Costa Rica sigue como estaba.
 */
export function reglaDeRecepcion(codigoPais: string | null | undefined): ReglaRecepcion | null {
  if (codigoPais === "CR") return { etapas: ETAPAS_POR_RECIBIR, completadasDesde: null, vieneEscrita: false, admiteYaContadas: false };
  if (codigoPais === "PA") return { etapas: [...ETAPAS_LLEGADA_PUERTO, "en_bodega"], completadasDesde: COMPLETADAS_DE_PANAMA_DESDE, vieneEscrita: true, admiteYaContadas: true };
  return null;
}

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
    limpios.push({ item, cantidad, nota: texto(o.nota, 300) || null, ubicacion, lote_codigo: codigoLote(texto(o.lote_codigo, 80), vencimiento) || null, vencimiento });
  }
  return { items: limpios };
}
