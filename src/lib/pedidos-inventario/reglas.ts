// Pedir a inventario (16 nov 2026, migración 0304): despacho le pide a inventario lo que se le agotó. Reglas puras, con prueba.

import type { Tone } from "@/components/ui/badge";

export const MAX_TEXTO = 300;
export const MAX_CANTIDAD = 1_000_000;
export const MAX_LINEAS = 50;

export type EstadoPedido = "solicitud" | "en_proceso" | "enviado" | "recibido" | "cancelado";

/** Los estados, en el orden del Excel que reemplaza, con su nombre y el color de insignia del sistema. */
export const ESTADOS: { clave: EstadoPedido; etiqueta: string; tono: Tone; explica: string }[] = [
  { clave: "solicitud", etiqueta: "Solicitud", tono: "neutral", explica: "Pedido registrado: inventario todavía no lo toma." },
  { clave: "en_proceso", etiqueta: "En proceso", tono: "warning", explica: "Inventario está preparando el pedido." },
  { clave: "enviado", etiqueta: "Enviado", tono: "azul", explica: "Va en camino a despacho (el traslado ya está hecho)." },
  { clave: "recibido", etiqueta: "Recibido", tono: "success", explica: "Despacho lo recibió: el pedido queda cerrado." },
  { clave: "cancelado", etiqueta: "Cancelado", tono: "destructive", explica: "Despacho lo canceló antes de que inventario lo tomara." },
];

export const estadoDe = (clave: string) => ESTADOS.find((e) => e.clave === clave) ?? ESTADOS[0];
export const esEstado = (v: unknown): v is EstadoPedido => typeof v === "string" && ESTADOS.some((e) => e.clave === v);

/** «PED-0012»: el número de un pedido. */
export const numeroPedido = (n: number) => `PED-${String(n).padStart(4, "0")}`;

export interface ItemPedido {
  id: string;
  skuId: string;
  producto: string;
  codigo: string | null;
  cantidadPedida: number;
  nota: string | null;
  cantidadEntregada: number | null;
  observacion: string | null;
}

export interface PedidoInventario {
  id: string;
  numero: number;
  estado: EstadoPedido;
  pedidoPor: string;
  pedidoPorNombre: string | null;
  creadoEn: string;
  responsableNombre: string | null;
  enviadoEn: string | null;
  recibidoPorNombre: string | null;
  recibidoEn: string | null;
  origen: string | null;
  traslado: string | null;
  items: ItemPedido[];
}

/** Un texto corto limpio (espacios de más fuera, hasta 300); vacío es `null`. */
export function limpiarTexto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, MAX_TEXTO);
  return t || null;
}

/** Una cantidad entera de `min` en adelante; si no lo es, `null`. */
export function leerCantidad(v: unknown, min = 0): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= min && n <= MAX_CANTIDAD ? n : null;
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Revisa las líneas de un pedido nuevo: producto elegido de la lista, cantidad desde 1, sin repetir. */
export function revisarLineas(lineas: unknown): { lineas: { skuId: string; cantidad: number; nota: string | null }[] } | { error: string } {
  if (!Array.isArray(lineas) || lineas.length === 0) return { error: "Agrega al menos un producto." };
  if (lineas.length > MAX_LINEAS) return { error: `Son demasiados productos en un pedido (máximo ${MAX_LINEAS}).` };
  const vistos = new Set<string>();
  const limpias: { skuId: string; cantidad: number; nota: string | null }[] = [];
  for (const l of lineas) {
    const o = (l ?? {}) as Record<string, unknown>;
    if (typeof o.skuId !== "string" || !ES_UUID.test(o.skuId)) return { error: "Elige cada producto de la lista." };
    if (vistos.has(o.skuId)) return { error: "Un producto está dos veces en el pedido." };
    vistos.add(o.skuId);
    const cantidad = leerCantidad(o.cantidad, 1);
    if (cantidad === null) return { error: "Cada producto necesita una cantidad entera mayor que cero." };
    limpias.push({ skuId: o.skuId, cantidad, nota: limpiarTexto(o.nota) });
  }
  return { lineas: limpias };
}

/** Revisa lo que inventario envía de cada producto: una cantidad de 0 en adelante por línea del pedido, y algo más que cero en total. */
export function revisarEntregas(
  itemsDelPedido: { id: string }[],
  entregas: unknown,
): { entregas: { id: string; cantidad: number; observacion: string | null }[] } | { error: string } {
  if (!Array.isArray(entregas)) return { error: "Escribe cuánto envías de cada producto." };
  const porId = new Map<string, Record<string, unknown>>();
  for (const e of entregas) {
    const o = (e ?? {}) as Record<string, unknown>;
    if (typeof o.id === "string") porId.set(o.id, o);
  }
  const limpias: { id: string; cantidad: number; observacion: string | null }[] = [];
  for (const it of itemsDelPedido) {
    const o = porId.get(it.id);
    const cantidad = leerCantidad(o?.cantidad, 0);
    if (cantidad === null) return { error: "Escribe cuánto envías de cada producto (0 si no hay)." };
    limpias.push({ id: it.id, cantidad, observacion: limpiarTexto(o?.observacion) });
  }
  if (!limpias.some((l) => l.cantidad > 0)) return { error: "No hay nada que enviar: todas las cantidades están en 0." };
  return { entregas: limpias };
}

/** Qué puede hacer cada lado con un pedido en su estado. */
export const puedeCancelar = (estado: EstadoPedido) => estado === "solicitud";
export const puedeEnProceso = (estado: EstadoPedido) => estado === "solicitud";
export const puedeEnviar = (estado: EstadoPedido) => estado === "solicitud" || estado === "en_proceso";
export const puedeRecibir = (estado: EstadoPedido) => estado === "enviado";

/** Cuántos pedidos hay en cada estado (los contadores de arriba). */
export function contarPorEstado(pedidos: { estado: EstadoPedido }[]): Record<EstadoPedido, number> {
  const c: Record<EstadoPedido, number> = { solicitud: 0, en_proceso: 0, enviado: 0, recibido: 0, cancelado: 0 };
  for (const p of pedidos) c[p.estado]++;
  return c;
}

/** La fecha como en el Excel: «16/11/2026», en hora de Panamá. */
export function fechaCorta(iso: string): string {
  const [a, m, d] = new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Panama" }).split("-");
  return `${d}/${m}/${a}`;
}

/** Los avisos «Para ti» de cada paso. */
export function avisoPedido(p: { numero: number; items: number }, quien: string, paso: "nuevo" | "en_proceso" | "enviado" | "recibido" | "cancelado", extra?: string): { titulo: string; texto: string } {
  const n = numeroPedido(p.numero);
  const prods = `${p.items} ${p.items === 1 ? "producto" : "productos"}`;
  const t = {
    nuevo: [`Despacho pide a inventario: ${n}`, `${quien} pide ${prods}.`],
    en_proceso: [`${n} está en proceso`, `${quien} está preparando tu pedido.`],
    enviado: [`${n} fue enviado`, `${quien} lo envió${extra ? ` (${extra})` : ""}. Márcalo «Recibido» cuando llegue.`],
    recibido: [`${n} fue recibido`, `${quien} lo recibió en despacho.`],
    cancelado: [`${n} fue cancelado`, `${quien} canceló el pedido.`],
  }[paso];
  return { titulo: t[0].slice(0, 300), texto: t[1].slice(0, 600) };
}
