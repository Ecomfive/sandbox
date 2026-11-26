// Costos de producto: la hoja única de costos de Panamá (pedido de María José, Oceans, 26 nov 2026; migración 0992).
// Una fila por compra y producto, agrupada por el código único del producto (#0088). La fila entra sola cuando la compra
// de Panamá pasa a «En Bodega» o «08 - Completado»; Francis y María José llenan los costos asociados (totales de esa
// compra, en USD) y el sistema calcula el % variable por financiamiento y el costo total unitario.
//
// Regla del costo de venta (decidida por Alex): cada línea vendida toma el costo total unitario de la última compra del
// producto que llegó en o antes de la fecha del pedido; un pedido anterior a la primera compra cargada toma la primera.
// Así una compra nueva no cambia el costo de lo ya vendido. La misma regla vive en SQL (`fin_costo_hoja_en`, 0992) para la
// reportería de pedidos y el Estado de resultados; esta copia la usan Pedidos Dropi, Inventario y Producto.
// Lógica pura, con prueba en `hoja-costos.test.ts`.

import type { CostoPuesto } from "./compras-costos";
import type { FinanciamientoOrden } from "./financiamiento-orden";

/** Las etapas de Compras con las que una compra entra a la hoja. */
export const ETAPAS_HOJA = new Set(["en_bodega", "completado"]);

/** Los costos asociados que se llenan a mano, como total de la compra en USD (columna de `fin_costos_lotes`). */
export const COSTOS_ASOCIADOS = [
  { id: "asoc_comision_banco_1", etiqueta: "Comisión banco (pago 1)", corta: "Banco 1", ayuda: "Lo que cobró el banco por el primer pago al proveedor (anticipo)." },
  { id: "asoc_comision_banco_2", etiqueta: "Comisión banco (pago 2)", corta: "Banco 2", ayuda: "Lo que cobró el banco por el segundo pago (saldo)." },
  { id: "asoc_comision_cambio", etiqueta: "Comisión de cambio", corta: "Cambio", ayuda: "Diferencia o comisión por cambiar la moneda del pago." },
  { id: "asoc_impuesto", etiqueta: "Impuestos y aduana", corta: "Impuestos", ayuda: "Aranceles, ITBMS de importación y trámites de aduana." },
  { id: "asoc_envio", etiqueta: "Envío y desaduanaje", corta: "Envío", ayuda: "Flete internacional, agente de carga y entrega a la bodega." },
  { id: "asoc_otros", etiqueta: "Otros", corta: "Otros", ayuda: "Cualquier otro costo de esa compra (deja una nota de qué es)." },
] as const;

export type CampoAsociado = (typeof COSTOS_ASOCIADOS)[number]["id"];

export const esCampoAsociado = (v: unknown): v is CampoAsociado => COSTOS_ASOCIADOS.some((c) => c.id === v);

export const MAX_ASOCIADO = 1_000_000;

const r6 = (v: number) => Math.round((v + Number.EPSILON) * 1_000_000) / 1_000_000;
const r4 = (v: number) => Math.round((v + Number.EPSILON) * 10_000) / 10_000;

/** Una fila de la hoja como la guarda la base. */
export interface FilaHoja {
  id: string;
  skuId: string;
  numero: number | null;
  sku: string;
  producto: string;
  compraId: string | null;
  codigoCompra: string;
  llegada: string | null;
  cantidad: number;
  costoUnitario: number;
  asociados: Record<CampoAsociado, number>;
  nota: string | null;
  /** Financiamiento por unidad (lo calcula el sistema desde Préstamos del grupo). */
  financiamiento: number;
  costoFinalManual: number | null;
  /** El costo final vino del Excel de la carga inicial (falta desglosarlo en costos asociados). */
  costoFinalExcel?: boolean;
  /** Unidades pedidas, cuando lo recibido fue distinto (el costo se divide por lo recibido). */
  cantidadPedida?: number | null;
  /** De dónde sale el financiamiento: cobrado por el financista, estimado (congelado al llegar) o sin préstamo registrado. */
  financiamientoTipo?: TipoFinanciamiento | null;
  origen: string;
  editadoPor: string | null;
  editadoEn: string | null;
}

export type TipoFinanciamiento = "real" | "estimado" | "ninguno";
export const ETIQUETA_FINANCIAMIENTO: Record<TipoFinanciamiento, string> = {
  real: "Cobrado por el financista",
  estimado: "Estimado (congelado al llegar)",
  ninguno: "Sin préstamo registrado",
};

/** Una fila con el costo final del Excel y sin ningún costo asociado: falta desglosarla. */
export const pendienteDesglosar = (f: Pick<FilaHoja, "costoFinalManual" | "costoFinalExcel" | "asociados">): boolean =>
  !!f.costoFinalExcel && !!f.costoFinalManual && COSTOS_ASOCIADOS.every((c) => !(f.asociados[c.id] > 0));

/** Una fila de una compra sin préstamo registrado en Préstamos del grupo (su % por financiamiento sale en 0). */
export const sinFinanciamiento = (f: Pick<FilaHoja, "origen" | "financiamientoTipo">): boolean => f.origen === ORIGEN_HOJA_COMPRAS && f.financiamientoTipo === "ninguno";

/** El último día del mes de un período «AAAA-MM-01». */
const finDeMes = (periodo: string) => {
  const [a, m] = periodo.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

/**
 * Una fila que llegó en o antes del último mes cerrado ya costeó pedidos de un mes cerrado: cambiarla no mueve ese mes (el
 * costo de ventas cerrado no se recalcula), pero deja la hoja distinta de lo contabilizado. Solo un administrador la cambia.
 */
export function cerradaPorCierre(llegada: string | null, ultimoCerrado: string | null): boolean {
  if (!ultimoCerrado) return false;
  if (!llegada) return true;
  return llegada <= finDeMes(ultimoCerrado);
}

/** Reparte `total` entre partes con estos pesos, con los centavos exactos (la última se lleva el redondeo). */
export function repartirPorPeso(total: number, pesos: number[]): number[] {
  if (!pesos.length) return [];
  const usar = pesos.every((p) => p > 0) ? pesos : pesos.map(() => 1);
  const suma = usar.reduce((a, b) => a + b, 0);
  const cent = Math.round(total * 100);
  let acum = 0;
  let previo = 0;
  return usar.map((p, i) => {
    acum += p;
    const hasta = i === usar.length - 1 ? cent : Math.round((cent * acum) / suma);
    const v = (hasta - previo) / 100;
    previo = hasta;
    return v;
  });
}

/** El peso de cada fila de una compra al repartir un costo de toda la compra: su costo de compra (FOB). */
export const pesoDeFila = (f: Pick<FilaHoja, "cantidad" | "costoUnitario" | "cantidadPedida">) => (f.cantidadPedida ?? f.cantidad) * f.costoUnitario;

/** Código de compra para comparar (sin espacios ni mayúsculas). */
export const codigoComparable = (v: string | null | undefined) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");

/**
 * Las filas de la carga inicial que no encontraron su compra y que ahora tienen una fila de Compras para el mismo producto y
 * el mismo código de compra: se unen (la de Compras se queda con lo que María José ya cargó) para no contarla dos veces.
 */
export function paresCargaInicial<C extends { id: string; skuId: string; codigo: string }, P extends { clave: string; skuId: string; codigo: string }>(
  carga: C[],
  compras: P[],
): { carga: C; compra: P }[] {
  const por = new Map<string, P>();
  for (const p of compras) {
    const k = `${p.skuId}|${codigoComparable(p.codigo)}`;
    if (codigoComparable(p.codigo) && !por.has(k)) por.set(k, p);
  }
  const salida: { carga: C; compra: P }[] = [];
  for (const c of carga) {
    const p = por.get(`${c.skuId}|${codigoComparable(c.codigo)}`);
    if (p) salida.push({ carga: c, compra: p });
  }
  return salida;
}

export interface CalculoFila {
  /** Asociados por unidad (todos juntos). */
  asociadosUnidad: number;
  /** Financiamiento ÷ costo unitario de compra, en % (null sin costo de compra). */
  pctFinanciamiento: number | null;
  /** Costo de compra + asociados por unidad + financiamiento por unidad. */
  costoCalculado: number;
  /** El que vale: el manual si lo tiene, si no el calculado. */
  costoTotal: number;
}

/** Lo mismo que el disparador `fin_costos_hoja_calcular` (0992). */
export function calcularFila(f: Pick<FilaHoja, "cantidad" | "costoUnitario" | "asociados" | "financiamiento" | "costoFinalManual">): CalculoFila {
  const suma = COSTOS_ASOCIADOS.reduce((a, c) => a + (f.asociados[c.id] ?? 0), 0);
  const asociadosUnidad = f.cantidad > 0 ? r6(suma / f.cantidad) : 0;
  const costoCalculado = r6(f.costoUnitario + asociadosUnidad + f.financiamiento);
  return {
    asociadosUnidad,
    pctFinanciamiento: f.costoUnitario > 0 ? r4((f.financiamiento / f.costoUnitario) * 100) : null,
    costoCalculado,
    costoTotal: f.costoFinalManual && f.costoFinalManual > 0 ? f.costoFinalManual : costoCalculado,
  };
}

/** Lee lo que escribe una persona en una celda de costo: vacío = 0; negativo, letras o demasiado = error. Un costo por unidad va con 6 decimales. */
export function leerMontoAsociado(v: unknown, decimales = 2): { valor: number } | { error: string } {
  const texto = typeof v === "number" ? String(v) : String(v ?? "").trim().replace(/\s/g, "").replace(/^\$/, "");
  if (texto === "") return { valor: 0 };
  // «1.234,56» o «1,234.56»: el último separador es el decimal.
  const normal = /,\d{1,2}$/.test(texto) && !/\.\d{1,2}$/.test(texto) ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  const n = Number(normal);
  if (!Number.isFinite(n)) return { error: "Escribe un monto en dólares (por ejemplo 125.50)." };
  if (n < 0) return { error: "Un costo no puede ser negativo." };
  if (n > MAX_ASOCIADO) return { error: "El monto es demasiado grande." };
  const f = 10 ** decimales;
  return { valor: Math.round(n * f) / f };
}

// ---------------------------------------------------------------------------------------------
// Costo de un producto en una fecha
// ---------------------------------------------------------------------------------------------

export interface CompraCosto {
  llegada: string | null;
  costo: number;
  creado?: string;
}

/** La compra que vale en `fecha`: la última llegada en o antes de esa fecha; si ninguna, la primera. */
export function compraVigente<T extends CompraCosto>(compras: T[], fecha: string): T | null {
  const validas = compras.filter((c) => c.costo > 0);
  if (!validas.length) return null;
  const antes = validas.filter((c) => c.llegada !== null && c.llegada <= fecha);
  const orden = (a: T, b: T) => (a.llegada ?? "").localeCompare(b.llegada ?? "") || (a.creado ?? "").localeCompare(b.creado ?? "");
  if (antes.length) return [...antes].sort(orden).at(-1)!;
  const conFecha = validas.filter((c) => c.llegada !== null).sort(orden);
  return conFecha[0] ?? [...validas].sort(orden).at(-1)!;
}

export interface CatalogoCostos {
  /** Las filas de la hoja por producto. */
  compras: Map<string, CompraCosto[]>;
  /** Los componentes de un pack o combo. */
  componentes: Map<string, { componente: string; cantidad: number }[]>;
  /** El producto principal de una variante. */
  padre: Map<string, string>;
}

/** El costo unitario de un producto en una fecha, con packs y variantes (lo mismo que `fin_costo_hoja_en`). */
export function costoEn(cat: CatalogoCostos, skuId: string | null, fecha: string, nivel = 0): number | null {
  if (!skuId || nivel > 2) return null;
  const propia = compraVigente(cat.compras.get(skuId) ?? [], fecha);
  if (propia) return propia.costo;
  const comps = cat.componentes.get(skuId);
  if (comps?.length) {
    let total = 0;
    for (const c of comps) {
      const v = costoEn(cat, c.componente, fecha, nivel + 1);
      if (v === null) return null;
      total += v * c.cantidad;
    }
    return r6(total);
  }
  const p = cat.padre.get(skuId);
  return p ? costoEn(cat, p, fecha, nivel + 1) : null;
}

// ---------------------------------------------------------------------------------------------
// Resumen por producto y alertas
// ---------------------------------------------------------------------------------------------

export interface ResumenProducto {
  skuId: string;
  compras: number;
  unidades: number;
  /** El costo de la compra más reciente. */
  vigente: number | null;
  llegada: string | null;
  /** Promedio ponderado por unidades de todas sus compras en la hoja (de control). */
  promedio: number | null;
  /** Cuánto se aparta el vigente del promedio, en %. */
  variacion: number | null;
  /** Hay filas sin costo asociado cargado (ni manual). */
  porCompletar: number;
}

/** Diferencia (en %) entre la última compra y el promedio desde la que se avisa. */
export const VARIACION_AVISO = 10;

export function resumirProductos(filas: (FilaHoja & { costoTotal: number })[]): Map<string, ResumenProducto> {
  const por = new Map<string, (FilaHoja & { costoTotal: number })[]>();
  for (const f of filas) por.set(f.skuId, [...(por.get(f.skuId) ?? []), f]);
  const salida = new Map<string, ResumenProducto>();
  for (const [skuId, fs] of por) {
    const hoy = "9999-12-31";
    const ultima = compraVigente(fs.map((f) => ({ llegada: f.llegada, costo: f.costoTotal, creado: f.editadoEn ?? "" })), hoy);
    const conCant = fs.filter((f) => f.cantidad > 0 && f.costoTotal > 0);
    const unidades = conCant.reduce((a, f) => a + f.cantidad, 0);
    const promedio = unidades > 0 ? r6(conCant.reduce((a, f) => a + f.cantidad * f.costoTotal, 0) / unidades) : null;
    const vigente = ultima?.costo ?? null;
    salida.set(skuId, {
      skuId,
      compras: fs.length,
      unidades,
      vigente,
      llegada: ultima?.llegada ?? null,
      promedio,
      variacion: vigente !== null && promedio ? r4(((vigente - promedio) / promedio) * 100) : null,
      porCompletar: fs.filter((f) => !f.costoFinalManual && COSTOS_ASOCIADOS.every((c) => !(f.asociados[c.id] > 0))).length,
    });
  }
  return salida;
}

/** Los productos con stock en Panamá (o de la lista «sin compra vinculada») que no tienen ninguna fila con costo. */
export function productosSinCosto(conStock: Set<string>, conCosto: Set<string>, sinCompra: Set<string>): string[] {
  return [...new Set([...conStock, ...sinCompra])].filter((s) => !conCosto.has(s));
}

// ---------------------------------------------------------------------------------------------
// De Compras a la hoja
// ---------------------------------------------------------------------------------------------

export const ORIGEN_HOJA_COMPRAS = "compras";

export interface FilaDesdeCompra {
  origen_clave: string;
  hoja: string;
  fila: number;
  linea: string;
  fecha_llegada: string | null;
  proveedor: string | null;
  producto: string;
  producto_clave: string;
  codigo: string | null;
  sku_maestro_id: string;
  cantidad: number;
  cantidad_pedida: number | null;
  costo_unitario: number;
  financiamiento: number;
  financiamiento_tipo: TipoFinanciamiento;
  costo_total: number;
  estatus: string;
  compra_id: string;
  en_hoja_costos: true;
}

/**
 * Las filas de la hoja de las compras En Bodega o Completado. El costo unitario es el FOB de la línea ÷ sus unidades (sin
 * los gastos de importación: esos son los costos asociados que se llenan en la hoja) y se divide por lo recibido si
 * Recepción lo anotó. El financiamiento de la OC se reparte
 * entre sus productos como su FOB. `fechaEtapa` da la fecha en que entró a la etapa, para las compras sin fecha de llegada.
 */
export function filasDesdeCompras(
  costos: (CostoPuesto & { financiamiento?: Pick<FinanciamientoOrden, "total" | "real"> | null })[],
  fechaEtapa: Map<string, string>,
  claveDe: (skuId: string, producto: string) => string,
): FilaDesdeCompra[] {
  const salida: FilaDesdeCompra[] = [];
  for (const c of costos) {
    if (!ETAPAS_HOJA.has(c.etapa)) continue;
    const finTotal = c.financiamiento?.total ?? 0;
    const tipo: TipoFinanciamiento = (c.financiamiento?.real ?? 0) > 0 ? "real" : finTotal > 0 ? "estimado" : "ninguno";
    for (const l of c.lineas) {
      if (!l.skuId || l.cantidad <= 0 || l.fob <= 0) continue;
      const finLinea = finTotal > 0 && c.fob > 0 ? (finTotal * l.fob) / c.fob : 0;
      // El costo por unidad se divide por lo que llegó (Recepción); si no se anotó, por lo pedido.
      const unidades = l.recibida && l.recibida > 0 ? l.recibida : l.cantidad;
      const costoUnitario = r6(l.fob / unidades);
      const financiamiento = r6(finLinea / unidades);
      salida.push({
        origen_clave: `compra:${c.compraId}:${l.skuId}`,
        hoja: "Costos de producto",
        fila: 0,
        linea: c.codigo || c.nombre,
        fecha_llegada: c.fechaLlegada ?? fechaEtapa.get(c.compraId) ?? null,
        proveedor: c.proveedor,
        producto: l.producto || c.nombre,
        producto_clave: claveDe(l.skuId, l.producto || c.nombre),
        codigo: l.codigo || null,
        sku_maestro_id: l.skuId,
        cantidad: unidades,
        cantidad_pedida: unidades !== l.cantidad ? l.cantidad : null,
        costo_unitario: costoUnitario,
        financiamiento,
        financiamiento_tipo: tipo,
        // El disparador lo vuelve a calcular con los costos asociados que ya tenga la fila.
        costo_total: r6(costoUnitario + financiamiento),
        estatus: c.etapa === "en_bodega" ? "En bodega" : "Completado",
        compra_id: c.compraId,
        en_hoja_costos: true,
      });
    }
  }
  return salida;
}
