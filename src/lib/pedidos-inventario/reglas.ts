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
  { clave: "enviado", etiqueta: "Enviado", tono: "azul", explica: "Va en camino a despacho. El inventario se mueve cuando despacho confirma lo que llegó." },
  { clave: "recibido", etiqueta: "Entregado", tono: "success", explica: "Despacho confirmó lo que llegó y se hizo el traslado: el pedido queda cerrado." },
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
  /** Ya se está preparando (27 nov 2026, migración 0371): cuándo y quién lo marcó; null = pendiente. */
  enProcesoEn?: string | null;
  enProcesoPorNombre?: string | null;
}

/** Lo que inventario manda de un producto desde una bodega y lo que despacho confirma que llegó (migración 0368). */
export interface EnvioPedido {
  id: string;
  itemId: string;
  bodegaId: string;
  bodega: string;
  cantidadEnviada: number;
  /** Lo confirmado por despacho; null = sin confirmar. */
  cantidadRecibida: number | null;
  nota: string | null;
  confirmadoPorNombre: string | null;
  /** El traslado que se hizo al recibir («TRA-0012»). */
  traslado: string | null;
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
  /** Cuándo pasó a «En proceso»; si es el mismo instante del envío, el pedido se envió directo desde «Solicitud». */
  enProcesoEn?: string | null;
  origen: string | null;
  traslado: string | null;
  /** Cuándo se archivó (23 nov 2026, migración 0354); null = a la vista. */
  archivadoEn?: string | null;
  items: ItemPedido[];
  /** De qué bodega sale cada producto (migración 0368). Vacío en los pedidos enviados antes, cuyo traslado ya estaba hecho. */
  envios?: EnvioPedido[];
  /** La bodega que le tocó al pedirlo (migración 0368). */
  bodegaAsignada?: { id: string; nombre: string } | null;
  /** Lo que une los pedidos que salieron de una misma lista. */
  grupo?: string | null;
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

/** `stock[bodega][sku]` = disponible (sin entrada = 0). */
export type StockPorBodegas = Record<string, Record<string, number>>;

/** Una parte de lo que sale de un producto: de qué bodega y cuántas. */
export interface Parte {
  bodegaId: string;
  cantidad: number;
}

/**
 * De qué bodega conviene sacar cada producto (26 nov 2026): primero la `preferida` (la del pedido) y después las bodegas que cubren más productos completos (menos viajes). Cada producto sale entero de la primera donde alcance;
 * si en ninguna alcanza, se reparte empezando por la que más tiene, y lo que no hay queda sin asignar. Sin nada en ninguna, una parte en 0 en la primera bodega (para elegirla a mano).
 */
export function repartirSugerido(items: { id: string; skuId: string; cantidad: number }[], bodegas: string[], stock: StockPorBodegas, preferida: string | null = null): Record<string, Parte[]> {
  const hay = (b: string, sku: string) => Math.max(0, stock[b]?.[sku] ?? 0);
  const completos = new Map(bodegas.map((b) => [b, items.filter((it) => hay(b, it.skuId) >= it.cantidad).length]));
  const orden = [...bodegas].sort((x, y) => Number(y === preferida) - Number(x === preferida) || completos.get(y)! - completos.get(x)!);
  const fuera: Record<string, Parte[]> = {};
  for (const it of items) {
    const entera = orden.find((b) => hay(b, it.skuId) >= it.cantidad);
    if (entera) {
      fuera[it.id] = [{ bodegaId: entera, cantidad: it.cantidad }];
      continue;
    }
    let falta = it.cantidad;
    const partes: Parte[] = [];
    for (const b of [...orden].sort((x, y) => hay(y, it.skuId) - hay(x, it.skuId))) {
      const toma = Math.min(falta, hay(b, it.skuId));
      if (toma <= 0) break;
      partes.push({ bodegaId: b, cantidad: toma });
      falta -= toma;
    }
    fuera[it.id] = partes.length ? partes : orden.length ? [{ bodegaId: orden[0], cantidad: 0 }] : [];
  }
  return fuera;
}

/** Un pedido de los que salen de una lista: su bodega y sus productos. */
export interface ParteDeLista<L> {
  bodegaId: string;
  lineas: L[];
}

/**
 * Separa la lista de despacho en un pedido por bodega, según dónde haya (26 nov 2026, pedido de Dinora): ella pide una sola vez y a inventario le llega fraccionado. Un producto que no cabe
 * en una sola bodega queda repartido entre dos pedidos. El orden de los pedidos es el de las bodegas.
 */
export function partirPorBodega<L extends { skuId: string; cantidad: number }>(lineas: L[], bodegas: string[], stock: StockPorBodegas): ParteDeLista<L>[] {
  const reparto = repartirSugerido(lineas.map((l) => ({ id: l.skuId, skuId: l.skuId, cantidad: l.cantidad })), bodegas, stock);
  return bodegas.flatMap((bodegaId) => {
    const suyas = lineas.flatMap((l) => (reparto[l.skuId] ?? []).filter((p) => p.bodegaId === bodegaId && p.cantidad > 0).map((p) => ({ ...l, cantidad: p.cantidad })));
    return suyas.length ? [{ bodegaId, lineas: suyas }] : [];
  });
}

export interface LineaEnvio {
  itemId: string;
  bodegaId: string;
  cantidad: number;
}

/**
 * Revisa lo que inventario envía: de cada producto del pedido, una o varias partes (bodega y cantidad desde 0, sin repetir bodega), sin pasar de lo disponible en cada bodega, y algo
 * más que cero en total. Las partes en 0 no se guardan.
 */
export function revisarEnvio(
  items: { id: string; skuId: string; producto: string }[],
  entrada: unknown,
  bodegas: { id: string; nombre: string }[],
  stock: StockPorBodegas,
): { envios: LineaEnvio[]; observaciones: Record<string, string | null> } | { error: string } {
  if (!Array.isArray(entrada)) return { error: "Escribe cuánto envías de cada producto." };
  const porId = new Map<string, Record<string, unknown>>();
  for (const e of entrada) {
    const o = (e ?? {}) as Record<string, unknown>;
    if (typeof o.id === "string") porId.set(o.id, o);
  }
  const nombre = new Map(bodegas.map((b) => [b.id, b.nombre]));
  const envios: LineaEnvio[] = [];
  const observaciones: Record<string, string | null> = {};
  for (const it of items) {
    const o = porId.get(it.id);
    const partes = o?.partes;
    if (!Array.isArray(partes) || partes.length > bodegas.length) return { error: `Revisa de dónde sale «${it.producto}».` };
    const vistas = new Set<string>();
    for (const x of partes) {
      const parte = (x ?? {}) as Record<string, unknown>;
      const bodegaId = typeof parte.bodegaId === "string" ? parte.bodegaId : "";
      const cantidad = leerCantidad(parte.cantidad, 0);
      if (cantidad === null) return { error: `Escribe cuánto envías de «${it.producto}» (0 si no hay).` };
      if (cantidad === 0) continue;
      if (!nombre.has(bodegaId)) return { error: `Elige de qué bodega sale «${it.producto}».` };
      if (vistas.has(bodegaId)) return { error: `«${it.producto}» está dos veces en ${nombre.get(bodegaId)}.` };
      vistas.add(bodegaId);
      const hay = Math.max(0, stock[bodegaId]?.[it.skuId] ?? 0);
      if (cantidad > hay) return { error: `En ${nombre.get(bodegaId)} solo hay ${hay.toLocaleString("es-PA")} de «${it.producto}».` };
      envios.push({ itemId: it.id, bodegaId, cantidad });
    }
    observaciones[it.id] = limpiarTexto(o?.observacion);
  }
  if (!envios.length) return { error: "No hay nada que enviar: todas las cantidades están en 0." };
  return { envios, observaciones };
}

/**
 * Enviar solo una parte del pedido (26 nov 2026, pedido de Hernán: «envié una parte de una bodega y la otra está por enviarse»): los productos que inventario deja sin marcar
 * quedan pendientes y pasan a un pedido nuevo, en el estado que tenía. Revisa que sean productos del pedido y que al menos uno se envíe ahora.
 */
export function revisarQuedan(items: { id: string }[], entrada: unknown): { quedan: string[] } | { error: string } {
  if (entrada === undefined || entrada === null) return { quedan: [] };
  if (!Array.isArray(entrada)) return { error: "Revisa qué productos envías ahora." };
  const ids = new Set(items.map((it) => it.id));
  const quedan = [...new Set(entrada)];
  if (quedan.some((x) => typeof x !== "string" || !ids.has(x))) return { error: "Un producto ya no está en el pedido: recarga la página." };
  if (quedan.length >= items.length) return { error: "Marca al menos un producto para enviar ahora." };
  return { quedan: quedan as string[] };
}

/** Lo que hay que buscar en cada bodega: sus productos y cantidades, en el orden de las bodegas. */
export interface GrupoBodega {
  bodegaId: string;
  bodega: string;
  unidades: number;
  /** `itemId`: el producto del pedido (para marcar qué se envía ahora). */
  lineas: { producto: string; codigo: string | null; cantidad: number; itemId?: string }[];
}

export function agruparPorBodega(items: { id: string; producto: string; codigo: string | null }[], partes: { itemId: string; bodegaId: string; cantidad: number }[], bodegas: { id: string; nombre: string }[]): GrupoBodega[] {
  const porId = new Map(items.map((it) => [it.id, it]));
  return bodegas.flatMap((b) => {
    const lineas = items.flatMap((it) =>
      partes.filter((p) => p.itemId === it.id && p.bodegaId === b.id && p.cantidad > 0).map((p) => ({ producto: porId.get(it.id)!.producto, codigo: porId.get(it.id)!.codigo, cantidad: p.cantidad, itemId: it.id })),
    );
    return lineas.length ? [{ bodegaId: b.id, bodega: b.nombre, unidades: lineas.reduce((t, l) => t + l.cantidad, 0), lineas }] : [];
  });
}

/** Revisa lo que despacho confirma de un producto: una cantidad de 0 en adelante; si no es la enviada, hay que decir por qué. */
export function revisarConfirmacion(enviada: number, recibida: unknown, nota: unknown): { recibida: number; nota: string | null } | { error: string } {
  const n = leerCantidad(recibida, 0);
  if (n === null) return { error: "Escribe cuántas unidades llegaron (0 si no llegó)." };
  const texto = limpiarTexto(nota);
  if (n !== enviada && !texto) return { error: `Inventario envió ${enviada.toLocaleString("es-PA")}: anota qué pasó.` };
  return { recibida: n, nota: texto };
}

/** Las diferencias entre lo enviado y lo confirmado, en palabras, para el aviso a inventario y el historial. */
export function diferenciasDeEnvio(items: { id: string; producto: string }[], envios: Pick<EnvioPedido, "itemId" | "bodega" | "cantidadEnviada" | "cantidadRecibida" | "nota">[]): string[] {
  const nombre = new Map(items.map((it) => [it.id, it.producto]));
  return envios
    .filter((e) => e.cantidadRecibida !== null && e.cantidadRecibida !== e.cantidadEnviada)
    .map((e) => `${nombre.get(e.itemId) ?? "un producto"} (${e.bodega}): enviaron ${e.cantidadEnviada}, llegaron ${e.cantidadRecibida}${e.nota ? ` — ${e.nota}` : ""}`);
}

/**
 * Lo que ya está comprometido en pedidos enviados que despacho todavía no recibe se descuenta de lo disponible: sigue en la bodega, pero no se puede prometer dos veces.
 */
export function restarComprometido(stock: StockPorBodegas, comprometido: StockPorBodegas): StockPorBodegas {
  const fuera: StockPorBodegas = {};
  for (const [bodega, porSku] of Object.entries(stock)) {
    fuera[bodega] = {};
    for (const [sku, n] of Object.entries(porSku)) fuera[bodega][sku] = Math.max(0, n - (comprometido[bodega]?.[sku] ?? 0));
  }
  return fuera;
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

/** Qué puede hacer cada lado con un pedido en su estado. */
export const puedeCancelar = (estado: EstadoPedido) => estado === "solicitud";
export const puedeEnProceso = (estado: EstadoPedido) => estado === "solicitud";
/** Despacho edita un pedido (quitar productos, cambiar cantidades o notas, agregar) mientras inventario no lo haya enviado (20 nov 2026, pedido de Jhokser). */
export const puedeEditar = (estado: EstadoPedido) => estado === "solicitud" || estado === "en_proceso";
export const puedeEnviar = (estado: EstadoPedido) => estado === "solicitud" || estado === "en_proceso";
export const puedeRecibir = (estado: EstadoPedido) => estado === "enviado";
/** Un pedido cerrado («Entregado») se puede devolver a «Enviado» si se marcó por error (23 nov 2026). Desde el 26 nov 2026 eso devuelve el inventario con traslados de reversa. */
export const puedeDeshacerEntrega = (estado: EstadoPedido) => estado === "recibido";

/** Inventario puede deshacer un envío hecho por error (23 nov 2026, pedido de Jhokser: Dinora envió un pedido sin querer): el pedido vuelve a como estaba. Los enviados antes del 26 nov 2026 ya tenían traslado y se devuelve con uno de reversa. */
export const puedeDeshacerEnvio = (estado: EstadoPedido) => estado === "enviado";

/**
 * A qué estado vuelve un pedido cuando se deshace su envío (23 nov 2026, pedido de Jhokser: «que regrese a la acción anterior»): «Enviar» guarda `en_proceso_en` = el envío cuando el pedido venía de
 * «Solicitud» (no lo había puesto en proceso), así que si los dos instantes son iguales vuelve a «Solicitud»; si no, a «En proceso».
 */
export function estadoAntesDeEnviar(enProcesoEn: string | null | undefined, enviadoEn: string | null | undefined): "solicitud" | "en_proceso" {
  if (!enProcesoEn || !enviadoEn) return "solicitud";
  return new Date(enProcesoEn).getTime() === new Date(enviadoEn).getTime() ? "solicitud" : "en_proceso";
}
/** Inventario devuelve a «Solicitud» un pedido que puso en proceso por error; despacho reabre uno que canceló por error. */
export const puedeVolverASolicitud = (estado: EstadoPedido) => estado === "en_proceso";
export const puedeReabrir = (estado: EstadoPedido) => estado === "cancelado";

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
export function avisoPedido(p: { numero: number; items: number }, quien: string, paso: "nuevo" | "en_proceso" | "enviado" | "recibido" | "cancelado" | "entrega_deshecha" | "envio_deshecho" | "reabierto", extra?: string): { titulo: string; texto: string } {
  const n = numeroPedido(p.numero);
  const prods = `${p.items} ${p.items === 1 ? "producto" : "productos"}`;
  const t = {
    nuevo: [`Despacho pide a inventario: ${n}`, `${quien} pide ${prods}${extra ? ` (${extra})` : ""}.`],
    en_proceso: [`${n} está en proceso`, `${quien} está preparando tu pedido.`],
    enviado: [`${n} fue enviado`, `${quien} lo envió${extra ? ` (${extra})` : ""}. Cuando llegue, confirma producto por producto lo que recibiste.`],
    recibido: [extra ? `${n} fue recibido con diferencias` : `${n} fue recibido`, extra ? `${quien} lo recibió. ${extra}` : `${quien} confirmó que llegó todo: el traslado quedó hecho.`],
    cancelado: [`${n} fue cancelado`, `${quien} canceló el pedido.`],
    envio_deshecho: [`${n} volvió a «${extra ?? "En proceso"}»`, `${quien} deshizo el envío (se había enviado por error). Te avisará cuando lo envíe de nuevo.`],
    reabierto: [`${n} fue reabierto`, `${quien} reabrió el pedido que estaba cancelado: vuelve a estar en «Solicitud».`],
    entrega_deshecha: [`${n} volvió a «Enviado»`, `${quien} deshizo la recepción (se había marcado por error). Revisa las cantidades y vuelve a recibirlo.`],
  }[paso];
  return { titulo: t[0].slice(0, 300), texto: t[1].slice(0, 600) };
}
