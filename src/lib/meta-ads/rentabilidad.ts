// Anuncios Meta › ¿sigue siendo rentable? (27 nov 2026, pedido de Hernán). A la calculadora de costos (CPA real, envíos, operativo) se le suma lo que paga el cliente y lo que cuesta el producto, para saber cuánto deja
// cada venta entregada y hasta qué CPA de Meta se puede pagar sin perder. Por ahora **solo informa**: no cambia el CPA tope ni lo que el sistema recomienda apagar.
//
//   Venta    = lo que se cobra por pedido (el total de los pedidos entregados de un solo producto, en promedio).
//   Producto = costo por unidad × unidades del pedido. Un 2x1 o un «PACK 2» cuenta como 2 unidades. El costo es el promedio de Compras (primero el del país); si no hay, el de la Matriz. Sin flete ni IVA.
//   Queda para anuncios por venta entregada = venta − producto − envíos − operativo.
//   CPA de Meta para no perder = eso × % de envío × % de entrega (el CPA real es el de Meta ÷ envío ÷ entrega).
//   Ganancia por venta entregada = venta − producto − costo por venta entregada (CPA real + envíos + operativo).
// Lógica pura, con prueba.

import type { CostoDeVenta, CostosOperacion } from "./costos-operacion";

export type FuenteCosto = "compras_pais" | "compras_todos" | "matriz";

export const NOMBRE_FUENTE: Record<FuenteCosto, string> = {
  compras_pais: "costo promedio de Compras del país",
  compras_todos: "costo promedio de Compras (todos los países)",
  matriz: "costo de la Matriz (puede estar desactualizado)",
};

/** Lo que se sabe de la venta y el costo de un producto de las campañas, por pedido, con los pedidos de la tienda. */
export interface EconomiaProducto {
  clave: string;
  /** Pedidos entregados de un solo producto con los que se calcula. */
  pedidos: number;
  /** Lo que paga el cliente por pedido, en promedio. */
  venta: number | null;
  /** Unidades por pedido, en promedio (un 2x1 cuenta 2). */
  unidades: number | null;
  /** Costo por unidad del producto (el más usado en sus pedidos). */
  costoUnitario: number | null;
  /** Costo del producto por pedido, en promedio (solo de los pedidos que se pudieron costear). */
  costoProducto: number | null;
  /** De cuántos de esos pedidos se sabe el costo. */
  costeados: number;
  fuente: FuenteCosto | null;
}

/**
 * Cuántas unidades del producto suelto trae una línea por su nombre: 2 en un 2x1 («2x1», «2 x 1», «Compra 1 y lleva 1», «lleva 2»), N en un «PACK N», «pack de N» o «x N»; si no, 1. Hernán (27 nov 2026): un 2x1 siempre
 * cuenta como 2, aunque diga «lleva 2».
 */
export function unidadesPorNombre(nombre: string): number {
  const t = String(nombre ?? "").toLowerCase();
  if (/\b2\s*x\s*1\b|compra\s*1\s*y\s*lleva|lleva\s*1\s*gratis/.test(t)) return 2;
  const pack = /\bpack\s*(?:de\s*)?-?\s*(\d{1,2})\b/.exec(t) ?? /\bx\s*(\d{1,2})\b(?!\s*\d)/.exec(t);
  const n = pack ? Number(pack[1]) : 1;
  return n >= 2 && n <= 12 ? n : 1;
}

/** Un pedido de un solo producto, ya con sus unidades contadas y su costo (null si no se sabe). */
export interface PedidoEconomia {
  venta: number;
  unidades: number;
  costo: number | null;
  fuente: FuenteCosto | null;
  costoUnitario: number | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** El promedio de los pedidos de un producto. La fuente es la que más pedidos costeó. */
export function economiaDe(clave: string, pedidos: readonly PedidoEconomia[]): EconomiaProducto {
  const validos = pedidos.filter((p) => p.venta > 0 && p.unidades > 0);
  const n = validos.length;
  const conCosto = validos.filter((p) => p.costo !== null && p.costo > 0);
  const fuentes = new Map<FuenteCosto, number>();
  const unitarios = new Map<number, number>();
  for (const p of conCosto) {
    if (p.fuente) fuentes.set(p.fuente, (fuentes.get(p.fuente) ?? 0) + 1);
    if (p.costoUnitario !== null) unitarios.set(p.costoUnitario, (unitarios.get(p.costoUnitario) ?? 0) + 1);
  }
  const masUsado = <K>(m: Map<K, number>): K | null => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    clave,
    pedidos: n,
    venta: n ? redondear(validos.reduce((t, p) => t + p.venta, 0) / n) : null,
    unidades: n ? Math.round((validos.reduce((t, p) => t + p.unidades, 0) / n) * 100) / 100 : null,
    costoUnitario: masUsado(unitarios),
    costoProducto: conCosto.length ? redondear(conCosto.reduce((t, p) => t + (p.costo ?? 0), 0) / conCosto.length) : null,
    costeados: conCosto.length,
    fuente: masUsado(fuentes),
  };
}

/** Con menos pedidos que estos, la venta y el costo de un producto no son de fiar y no se muestran. */
export const MIN_PEDIDOS_RENTABILIDAD = 5;

export interface Rentabilidad {
  venta: number;
  producto: number;
  /** Lo que queda para pagar anuncios por cada venta entregada (venta − producto − envíos − operativo). */
  paraAnuncios: number;
  /** El CPA de Meta más alto con el que no se pierde (0 si se pierde aunque el anuncio fuera gratis). */
  cpaParaNoPerder: number;
  /** Lo que queda por venta entregada con el CPA de ahora (negativo = se pierde); null sin CPA. */
  ganancia: number | null;
  /** El CPA de ahora pasa del límite para no perder. */
  pierde: boolean;
}

/** Cuánto deja cada venta entregada y hasta qué CPA de Meta no se pierde. Null si faltan la venta, el costo, el % de envío o el de entrega, o si hay muy pocos pedidos. */
export function rentabilidadDe(e: EconomiaProducto | null | undefined, envio: number | null, entrega: number | null, c: CostosOperacion, costoVenta: CostoDeVenta | null): Rentabilidad | null {
  if (!e || e.pedidos < MIN_PEDIDOS_RENTABILIDAD || e.venta === null || e.costoProducto === null) return null;
  if (envio === null || entrega === null || envio <= 0 || entrega <= 0) return null;
  const envios = c.envio + c.cod * entrega + (1 - entrega) * c.envio;
  const paraAnuncios = e.venta - e.costoProducto - envios - c.operativo;
  const cpaParaNoPerder = Math.max(0, paraAnuncios * envio * entrega);
  const ganancia = costoVenta ? e.venta - e.costoProducto - costoVenta.total : null;
  return {
    venta: e.venta,
    producto: e.costoProducto,
    paraAnuncios: redondear(paraAnuncios),
    cpaParaNoPerder: redondear(cpaParaNoPerder),
    ganancia: ganancia === null ? null : redondear(ganancia),
    pierde: ganancia !== null && ganancia < 0,
  };
}

// ───────────────────────── La rentabilidad en las recomendaciones (27 nov 2026, pedido de Hernán) ─────────────────────────
// Con la venta, el costo del producto, los envíos y la entrega de cada producto, las sugerencias, «Por qué empeora» y las fichas avisan cuándo hay que tener más cuidado. Solo informa: el tope y lo que se recomienda
// apagar no cambian.

/** Lo que hace falta de un producto para saber cuánto deja una venta con cualquier CPA. */
export interface LimiteProducto {
  venta: number;
  producto: number;
  /** Lo que queda para anuncios por venta entregada (venta − producto − envíos − operativo). */
  paraAnuncios: number;
  envio: number;
  entrega: number;
  cpaParaNoPerder: number;
  fuente: FuenteCosto | null;
  /** Unidades por pedido (un 2x1 cuenta 2). */
  unidades: number | null;
}

/** Desde esta parte del límite para no perder, el margen es fino. */
export const MARGEN_FINO = 0.85;

/** El límite de cada producto (por la llave de su nombre), con sus porcentajes o, si tiene pocos pedidos, los de la tienda. Solo los que tienen venta, costo y porcentajes. */
export function limitesDeProductos(
  economia: readonly EconomiaProducto[],
  tasasDe: (clave: string) => { envio: number | null; entrega: number | null },
  c: CostosOperacion,
): Map<string, LimiteProducto> {
  const salida = new Map<string, LimiteProducto>();
  for (const e of economia) {
    const t = tasasDe(e.clave);
    const r = rentabilidadDe(e, t.envio, t.entrega, c, null);
    if (!r || t.envio === null || t.entrega === null) continue;
    salida.set(e.clave, { venta: r.venta, producto: r.producto, paraAnuncios: r.paraAnuncios, envio: t.envio, entrega: t.entrega, cpaParaNoPerder: r.cpaParaNoPerder, fuente: e.fuente, unidades: e.unidades });
  }
  return salida;
}

/** Cuánto deja (o pierde, si es negativo) cada venta entregada con ese CPA de Meta. */
export const dejaCon = (l: LimiteProducto, cpaMeta: number) => redondear(l.paraAnuncios - cpaMeta / (l.envio * l.entrega));

export type EstadoRentable = "pierde" | "margen_fino" | "sobre_tope_rentable" | "bien";

export const NOMBRE_ESTADO_RENTABLE: Record<EstadoRentable, string> = { pierde: "Pierde", margen_fino: "Margen fino", sobre_tope_rentable: "Sobre el tope, rentable", bien: "Bien" };

/** Cómo va un CPA frente al límite para no perder y al tope. */
export function estadoRentable(cpaMeta: number, tope: number, l: LimiteProducto): EstadoRentable {
  if (cpaMeta > l.cpaParaNoPerder) return "pierde";
  if (cpaMeta > tope) return "sobre_tope_rentable";
  if (l.cpaParaNoPerder > 0 && cpaMeta >= l.cpaParaNoPerder * MARGEN_FINO) return "margen_fino";
  return "bien";
}

export interface AvisoRentabilidad {
  estado: EstadoRentable;
  /** «alerta» si pierde; «info» lo demás. */
  tono: "alerta" | "info";
  titulo: string;
  texto: string;
}

const usd = (n: number) => `$${Math.abs(n).toFixed(2)}`;
const pct = (n: number) => `${Math.round(n * 100)} %`;

/** El aviso de rentabilidad de algo con ese CPA de Meta (`periodo`: «7 días», «14 días»…). */
export function avisoRentabilidad(cpaMeta: number, tope: number, l: LimiteProducto, periodo = "7 días"): AvisoRentabilidad {
  const estado = estadoRentable(cpaMeta, tope, l);
  const deja = dejaCon(l, cpaMeta);
  const base = `venta ${usd(l.venta)} · producto ${usd(l.producto)}${l.fuente === "matriz" ? " (Matriz)" : ""} · envía ${pct(l.envio)} · entrega ${pct(l.entrega)}`;
  if (estado === "pierde")
    return { estado, tono: "alerta", titulo: "Pierde:", texto: `con el CPA de ${periodo} (${usd(cpaMeta)}) cada venta entregada pierde ${usd(deja)}. El límite para no perder es ${usd(l.cpaParaNoPerder)}${l.cpaParaNoPerder < tope ? ", más bajo que el tope" : ""} (${base}).` };
  if (estado === "sobre_tope_rentable")
    return { estado, tono: "info", titulo: "Ojo con la rentabilidad:", texto: `aunque pasa del tope, cada venta entregada todavía deja ${usd(deja)} (no pierde hasta un CPA de ${usd(l.cpaParaNoPerder)}; ${base}). La regla del tope sigue; antes de cortar, mira si conviene rescatar lo que vende.` };
  if (estado === "margen_fino")
    return { estado, tono: "info", titulo: "Margen fino:", texto: `cada venta entregada deja solo ${usd(deja)}: ya va en el ${pct(cpaMeta / l.cpaParaNoPerder)} del límite para no perder (${usd(l.cpaParaNoPerder)}; ${base}).` };
  return { estado, tono: "info", titulo: "Rentabilidad:", texto: `con el CPA de ${periodo} cada venta entregada deja ${usd(deja)}. No pierde hasta un CPA de ${usd(l.cpaParaNoPerder)} (${base}).` };
}
