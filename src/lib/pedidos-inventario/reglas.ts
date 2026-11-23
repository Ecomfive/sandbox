// Pedir a inventario (16 nov 2026, migración 0305): despacho le pide a inventario lo que se le agotó. Reglas puras, con prueba.

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
  { clave: "recibido", etiqueta: "Entregado", tono: "success", explica: "Llegó a despacho (lo marca despacho con «Recibido» o inventario con «Marcar entregado»): el pedido queda cerrado." },
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
  /** Cuándo se archivó (23 nov 2026, migración 0354); null = a la vista. */
  archivadoEn?: string | null;
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

/**
 * Lo que no alcanza en una bodega (20 nov 2026, pedido de Hernán: saber de dónde sale la mercancía): cada línea que pide más de lo disponible allí, con
 * cuánto falta. `stock[bodega][sku]` = disponible (sin entrada = 0). Las líneas en 0 no cuentan.
 */
export function faltantesEn(lineas: { skuId: string; cantidad: number }[], bodegaId: string, stock: Record<string, Record<string, number>>): { skuId: string; falta: number }[] {
  return lineas.filter((l) => l.cantidad > 0).flatMap((l) => {
    const hay = stock[bodegaId]?.[l.skuId] ?? 0;
    return l.cantidad > hay ? [{ skuId: l.skuId, falta: l.cantidad - hay }] : [];
  });
}

/**
 * De qué bodega conviene que salga un pedido entero (un pedido sale de una sola: es un traslado): la primera, en el orden de las bodegas, donde alcanza
 * para todo; si ninguna, la que deja menos productos sin cubrir y, empatadas, la que más unidades cubre. null sin bodegas.
 */
export function mejorOrigen(lineas: { skuId: string; cantidad: number }[], origenes: string[], stock: Record<string, Record<string, number>>): string | null {
  let mejor: { id: string; faltan: number; cubre: number } | null = null;
  for (const id of origenes) {
    const faltan = faltantesEn(lineas, id, stock).length;
    if (faltan === 0) return id;
    const cubre = lineas.reduce((s, l) => s + Math.min(l.cantidad, stock[id]?.[l.skuId] ?? 0), 0);
    if (!mejor || faltan < mejor.faltan || (faltan === mejor.faltan && cubre > mejor.cubre)) mejor = { id, faltan, cubre };
  }
  return mejor?.id ?? null;
}

/** Lo que hay en inventario de un producto (19 nov 2026): lo disponible en las bodegas de donde inventario envía (todas las de Panamá menos la de despacho). */
export interface StockInventario {
  total: number;
  bodegas: { nombre: string; disponible: number }[];
}

/**
 * No se pide lo que inventario no tiene (19 nov 2026, pedido de Hernán): un producto sin nada disponible no se puede pedir, y no se piden más unidades de las
 * que hay. `stock` dice lo disponible de cada producto (sin entrada = 0) y `nombres`, cómo se llama, para el aviso.
 */
export function revisarStockPedido(lineas: { skuId: string; cantidad: number }[], stock: Record<string, StockInventario | undefined>, nombres: Record<string, string>): string | null {
  for (const l of lineas) {
    const hay = stock[l.skuId]?.total ?? 0;
    const nombre = nombres[l.skuId] ?? "Un producto";
    if (hay <= 0) return `«${nombre}» no tiene stock en inventario: no se puede pedir.`;
    if (l.cantidad > hay) return `De «${nombre}» solo hay ${hay} en inventario: pide ${hay} o menos.`;
  }
  return null;
}

/** Una línea de un pedido en edición: `id` es la línea que ya existía (sin `id` = producto nuevo). */
export interface LineaEditada {
  id: string | null;
  skuId: string;
  cantidad: number;
  nota: string | null;
}

/**
 * Revisa las líneas de un pedido que se edita (20 nov 2026, pedido de Jhokser: despacho quita o cambia productos de su pedido): lo mismo que un pedido nuevo (al menos un producto, cantidad entera desde 1, sin repetir) y,
 * de cada línea, a cuál de las que ya tenía corresponde. Una línea que dice ser de otra línea del pedido, o de otro producto, se trata como producto nuevo.
 */
export function revisarEdicion(lineas: unknown, existentes: { id: string; skuId: string }[]): { lineas: LineaEditada[] } | { error: string } {
  const r = revisarLineas(lineas);
  if ("error" in r) return r.error === "Agrega al menos un producto." ? { error: "El pedido necesita al menos un producto: para quitarlo todo, cancela el pedido." } : r;
  const propias = new Map(existentes.map((e) => [e.id, e.skuId]));
  const usados = new Set<string>();
  const entrada = lineas as Record<string, unknown>[];
  return {
    lineas: r.lineas.map((l, i) => {
      const id = entrada[i]?.id;
      const valido = typeof id === "string" && propias.get(id) === l.skuId && !usados.has(id);
      if (valido) usados.add(id);
      return { id: valido ? (id as string) : null, skuId: l.skuId, cantidad: l.cantidad, nota: l.nota };
    }),
  };
}

/**
 * Qué cambió entre lo que tenía el pedido y lo que quedó: las líneas que se quitan (las que existían y ya no están), las que se cambian (otra cantidad u otra nota) y las nuevas. Los productos que se quitan se identifican
 * por la línea, no por el producto, para que dos líneas del mismo producto no se confundan.
 */
export function cambiosDeEdicion(
  antes: { id: string; skuId: string; producto: string; cantidad: number; nota: string | null }[],
  despues: LineaEditada[],
  nombres: Record<string, string>,
): { quitar: string[]; cambiar: LineaEditada[]; agregar: LineaEditada[]; resumen: string[] } {
  const quedan = new Set(despues.map((l) => l.id).filter((id): id is string => !!id));
  const previas = new Map(antes.map((a) => [a.id, a]));
  const quitar = antes.filter((a) => !quedan.has(a.id));
  const cambiar = despues.filter((l) => {
    const a = l.id ? previas.get(l.id) : undefined;
    return !!a && (a.cantidad !== l.cantidad || (a.nota ?? null) !== (l.nota ?? null));
  });
  const agregar = despues.filter((l) => !l.id);
  const resumen = [
    ...quitar.map((a) => `quitó ${a.producto}`),
    ...cambiar.map((l) => {
      const a = previas.get(l.id!)!;
      return a.cantidad !== l.cantidad ? `${a.producto}: ${a.cantidad} → ${l.cantidad}` : `${a.producto}: cambió la nota`;
    }),
    ...agregar.map((l) => `agregó ${nombres[l.skuId] ?? "un producto"} (${l.cantidad})`),
  ];
  return { quitar: quitar.map((a) => a.id), cambiar, agregar, resumen };
}

/** El aviso a inventario cuando despacho edita un pedido que ya tenía delante. */
export function avisoEdicion(numero: number, quien: string, resumen: string[]): { titulo: string; texto: string } {
  return { titulo: `${numeroPedido(numero)} fue editado`.slice(0, 300), texto: `${quien} editó el pedido: ${resumen.join("; ") || "sin cambios"}.`.slice(0, 600) };
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
/** Despacho edita un pedido (quitar productos, cambiar cantidades o notas, agregar) mientras inventario no lo haya enviado (20 nov 2026, pedido de Jhokser). */
export const puedeEditar = (estado: EstadoPedido) => estado === "solicitud" || estado === "en_proceso";
export const puedeEnviar = (estado: EstadoPedido) => estado === "solicitud" || estado === "en_proceso";
export const puedeRecibir = (estado: EstadoPedido) => estado === "enviado";
/** Un pedido cerrado («Entregado») se puede devolver a «Enviado» si se marcó por error (23 nov 2026): el traslado ya estaba hecho al enviarlo, así que no mueve inventario. */
export const puedeDeshacerEntrega = (estado: EstadoPedido) => estado === "recibido";

/** Un pedido ya realizado (entregado) o cancelado se puede archivar para sacarlo de la lista (23 nov 2026, pedido de Jhokser). */
export const puedeArchivar = (estado: EstadoPedido) => estado === "recibido" || estado === "cancelado";

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
export function avisoPedido(p: { numero: number; items: number }, quien: string, paso: "nuevo" | "en_proceso" | "enviado" | "recibido" | "entregado" | "cancelado" | "entrega_deshecha", extra?: string): { titulo: string; texto: string } {
  const n = numeroPedido(p.numero);
  const prods = `${p.items} ${p.items === 1 ? "producto" : "productos"}`;
  const t = {
    nuevo: [`Despacho pide a inventario: ${n}`, `${quien} pide ${prods}.`],
    en_proceso: [`${n} está en proceso`, `${quien} está preparando tu pedido.`],
    enviado: [`${n} fue enviado`, `${quien} lo envió${extra ? ` (${extra})` : ""}. Márcalo «Recibido» cuando llegue.`],
    recibido: [`${n} fue recibido`, `${quien} lo recibió en despacho.`],
    entregado: [`${n} fue entregado`, `${quien} lo marcó entregado en despacho: el pedido quedó cerrado.`],
    cancelado: [`${n} fue cancelado`, `${quien} canceló el pedido.`],
    entrega_deshecha: [`${n} volvió a «Enviado»`, `${quien} deshizo la entrega (se había marcado por error). Márcalo «Recibido» cuando llegue.`],
  }[paso];
  return { titulo: t[0].slice(0, 300), texto: t[1].slice(0, 600) };
}
