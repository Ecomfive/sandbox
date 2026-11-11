// Inventario valorizado (Rentabilidad › Inventario, migración 0921). Lógica pura, sin Supabase: junta las filas de
// `fin_inventario_valorizado` (stock físico × costo, por producto, bodega y lote), lo vendido en los últimos 90 días
// (`fin_inventario_vendido`) y los lotes por vencer (`wms_vigilancia_vencimientos`), y lee el Excel de un conteo físico.
// Prueba en `inventario-valorizado.test.ts`.

import type { Celda } from "./libro-excel";

/** Días de la ventana de ventas para la rotación y el DIO por producto. */
export const DIAS_VENTAS = 90;
/** Costo anual de mantener inventario (capital inmovilizado, almacenaje, merma, seguro) sobre su valor. */
export const TASA_MANTENER_PREDETERMINADA = 0.2;
/** Tramos de lento movimiento: días sin salidas. */
export const TRAMOS_LENTO = [60, 90, 180] as const;
export type TramoLento = "60" | "90" | "180" | "sin_salidas";

export const ETIQUETA_TRAMO: Record<TramoLento, string> = {
  "60": "60 a 89 días",
  "90": "90 a 179 días",
  "180": "180 días o más",
  sin_salidas: "Sin salidas registradas",
};

export interface FilaValorizada {
  bodegaId: string;
  bodega: string;
  bodegaTipo: string;
  skuId: string;
  codigo: string;
  producto: string;
  loteId: string | null;
  lote: string | null;
  vencimiento: string | null;
  unidades: number;
  costoUnitario: number | null;
  costoFuente: "lote" | "vigente" | null;
  valor: number;
  sinCosto: boolean;
  ultimaSalida: string | null;
}

export interface Vendido {
  unidades: number;
  costo: number;
}

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** El tramo de lento movimiento por la última salida (null: se movió hace menos de 60 días). */
export function tramoLento(ultimaSalida: string | null, hoy: string): TramoLento | null {
  if (!ultimaSalida) return "sin_salidas";
  const d = diasEntre(ultimaSalida, hoy);
  if (d >= 180) return "180";
  if (d >= 90) return "90";
  if (d >= 60) return "60";
  return null;
}

/** Rotación anual (costo de lo vendido anualizado ÷ valor del inventario) y días de inventario (valor ÷ costo diario). */
export function rotacionYDio(valor: number, costoVendido: number, dias = DIAS_VENTAS): { rotacion: number | null; dio: number | null } {
  if (valor <= 0) return { rotacion: null, dio: null };
  if (costoVendido <= 0) return { rotacion: 0, dio: null };
  const diario = costoVendido / dias;
  return { rotacion: r2((diario * 365) / valor), dio: Math.round(valor / diario) };
}

export interface ProductoInventario {
  skuId: string;
  codigo: string;
  producto: string;
  unidades: number;
  valor: number;
  /** Costo unitario promedio de lo que hay (ponderado por unidades); null sin costo. */
  costoUnitario: number | null;
  sinCosto: boolean;
  bodegas: number;
  ultimaSalida: string | null;
  diasSinSalida: number | null;
  tramo: TramoLento | null;
  vendidas: number;
  costoVendido: number;
  rotacion: number | null;
  dio: number | null;
}

export interface BodegaInventario {
  bodegaId: string;
  bodega: string;
  tipo: string;
  unidades: number;
  valor: number;
  productos: number;
  sinCosto: number;
}

export interface ResumenInventario {
  valor: number;
  unidades: number;
  productos: number;
  sinCosto: { productos: number; unidades: number };
  /** Unidades en negativo (salidas antes de su entrada): no se valorizan. */
  negativos: number;
  porBodega: BodegaInventario[];
  porProducto: ProductoInventario[];
  lento: Record<TramoLento, { productos: number; valor: number }>;
  costoVendido: number;
  rotacion: number | null;
  dio: number | null;
  tasaMantener: number;
  costoMantenerAnual: number;
  costoMantenerMensual: number;
}

export function resumirInventario(filas: FilaValorizada[], vendido: Map<string, Vendido>, hoy: string, tasaMantener = TASA_MANTENER_PREDETERMINADA): ResumenInventario {
  const productos = new Map<string, ProductoInventario & { conCosto: number; bodegasSet: Set<string> }>();
  const bodegas = new Map<string, BodegaInventario & { sinCostoSet: Set<string>; productosSet: Set<string> }>();
  let negativos = 0;
  for (const f of filas) {
    if (f.unidades < 0) negativos += -f.unidades;
    const u = Math.max(f.unidades, 0);
    if (u === 0) continue;
    const p =
      productos.get(f.skuId) ??
      productos
        .set(f.skuId, {
          skuId: f.skuId,
          codigo: f.codigo,
          producto: f.producto,
          unidades: 0,
          valor: 0,
          costoUnitario: null,
          sinCosto: false,
          bodegas: 0,
          ultimaSalida: null,
          diasSinSalida: null,
          tramo: null,
          vendidas: 0,
          costoVendido: 0,
          rotacion: null,
          dio: null,
          conCosto: 0,
          bodegasSet: new Set(),
        })
        .get(f.skuId)!;
    p.unidades += u;
    p.valor = r2(p.valor + f.valor);
    if (f.sinCosto) p.sinCosto = true;
    else p.conCosto += u;
    p.bodegasSet.add(f.bodegaId);
    if (f.ultimaSalida && (!p.ultimaSalida || f.ultimaSalida > p.ultimaSalida)) p.ultimaSalida = f.ultimaSalida;
    const b =
      bodegas.get(f.bodegaId) ??
      bodegas
        .set(f.bodegaId, { bodegaId: f.bodegaId, bodega: f.bodega, tipo: f.bodegaTipo, unidades: 0, valor: 0, productos: 0, sinCosto: 0, sinCostoSet: new Set(), productosSet: new Set() })
        .get(f.bodegaId)!;
    b.unidades += u;
    b.valor = r2(b.valor + f.valor);
    b.productosSet.add(f.skuId);
    if (f.sinCosto) b.sinCostoSet.add(f.skuId);
  }
  const lento: Record<TramoLento, { productos: number; valor: number }> = {
    "60": { productos: 0, valor: 0 },
    "90": { productos: 0, valor: 0 },
    "180": { productos: 0, valor: 0 },
    sin_salidas: { productos: 0, valor: 0 },
  };
  const porProducto: ProductoInventario[] = [];
  let costoVendido = 0;
  for (const p of productos.values()) {
    const v = vendido.get(p.skuId);
    const tramo = tramoLento(p.ultimaSalida, hoy);
    if (tramo) {
      lento[tramo].productos++;
      lento[tramo].valor = r2(lento[tramo].valor + p.valor);
    }
    const rd = rotacionYDio(p.valor, v?.costo ?? 0);
    const { conCosto, bodegasSet, ...resto } = p;
    porProducto.push({
      ...resto,
      bodegas: bodegasSet.size,
      costoUnitario: conCosto > 0 ? r2(p.valor / conCosto) : null,
      diasSinSalida: p.ultimaSalida ? diasEntre(p.ultimaSalida, hoy) : null,
      tramo,
      vendidas: v?.unidades ?? 0,
      costoVendido: r2(v?.costo ?? 0),
      ...rd,
    });
  }
  // El costo de lo vendido cuenta todo lo vendido (aunque hoy no quede stock): es la base del DIO total.
  for (const v of vendido.values()) costoVendido += v.costo;
  porProducto.sort((a, b) => b.valor - a.valor || a.codigo.localeCompare(b.codigo));
  const valor = r2(porProducto.reduce((a, p) => a + p.valor, 0));
  const total = rotacionYDio(valor, costoVendido);
  const sinCosto = porProducto.filter((p) => p.sinCosto);
  return {
    valor,
    unidades: porProducto.reduce((a, p) => a + p.unidades, 0),
    productos: porProducto.length,
    sinCosto: { productos: sinCosto.length, unidades: sinCosto.reduce((a, p) => a + p.unidades, 0) },
    negativos,
    porBodega: [...bodegas.values()]
      .map(({ sinCostoSet, productosSet, ...b }) => ({ ...b, productos: productosSet.size, sinCosto: sinCostoSet.size }))
      .sort((a, b) => b.valor - a.valor),
    porProducto,
    lento,
    costoVendido: r2(costoVendido),
    ...total,
    tasaMantener,
    costoMantenerAnual: r2(valor * tasaMantener),
    costoMantenerMensual: r2((valor * tasaMantener) / 12),
  };
}

/** La tasa de `fin_config` (jsonb): un número entre 0 y 1; si no, la predeterminada. */
export function leerTasa(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : TASA_MANTENER_PREDETERMINADA;
}

// ---------------------------------------------------------------------------------------------
// Vencimientos valorizados
// ---------------------------------------------------------------------------------------------

export interface LoteVigilado {
  skuId: string;
  codigo: string;
  producto: string;
  loteId: string;
  lote: string;
  vencimiento: string;
  diasRestantes: number;
  cantidad: number;
  estado: "vencido" | "por_vencer" | "vigente";
}

export interface LoteValorizado extends LoteVigilado {
  costoUnitario: number | null;
  valor: number;
}

/** Los lotes vencidos y por vencer con su valor: el costo del lote (o el vigente) de la vista, si no el del producto. */
export function vencimientosValorizados(lotes: LoteVigilado[], filas: FilaValorizada[]): { lotes: LoteValorizado[]; vencido: number; porVencer: number } {
  const porLote = new Map<string, number>();
  const porSku = new Map<string, number>();
  for (const f of filas) {
    if (f.costoUnitario === null) continue;
    if (f.loteId) porLote.set(f.loteId, f.costoUnitario);
    if (!porSku.has(f.skuId)) porSku.set(f.skuId, f.costoUnitario);
  }
  const salida = lotes
    .filter((l) => l.estado !== "vigente" && l.cantidad > 0)
    .map((l) => {
      const c = porLote.get(l.loteId) ?? porSku.get(l.skuId) ?? null;
      return { ...l, costoUnitario: c, valor: c === null ? 0 : r2(c * l.cantidad) };
    });
  return {
    lotes: salida,
    vencido: r2(salida.filter((l) => l.estado === "vencido").reduce((a, l) => a + l.valor, 0)),
    porVencer: r2(salida.filter((l) => l.estado === "por_vencer").reduce((a, l) => a + l.valor, 0)),
  };
}

// ---------------------------------------------------------------------------------------------
// Conteo físico desde Excel
// ---------------------------------------------------------------------------------------------

export interface FilaConteo {
  fila: number;
  producto: string;
  bodega: string;
  unidades: number;
  lote: string | null;
}

const sinAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

const COLUMNAS: Record<keyof Omit<FilaConteo, "fila">, RegExp> = {
  producto: /^(SKU|CODIGO|COD\.?|PRODUCTO|CODIGO DE PRODUCTO|REFERENCIA|ITEM)$/,
  bodega: /^(BODEGA|ALMACEN|DEPOSITO|UBICACION BODEGA)$/,
  unidades: /^(UNIDADES|CANTIDAD|CONTEO|STOCK|EXISTENCIA|FISICO|UNIDADES CONTADAS)$/,
  lote: /^(LOTE|N(RO|O|º)?\.? ?LOTE)$/,
};

/**
 * Lee la hoja de un conteo: una fila de títulos con producto (o código/SKU), bodega y unidades (lote, si hay) y debajo
 * una fila por producto y bodega. Las filas sin producto, sin bodega o con unidades que no son un entero ≥ 0 se
 * descartan y se cuentan. Si el mismo producto, bodega y lote se repite, se suman (un conteo por estantes).
 */
export function leerConteo(filas: Celda[][]): { filas: FilaConteo[]; descartadas: number } | { error: string } {
  const iT = filas.findIndex((f) => {
    const t = (f ?? []).map((c) => sinAcentos(String(c ?? "")));
    return t.some((x) => COLUMNAS.producto.test(x)) && t.some((x) => COLUMNAS.bodega.test(x)) && t.some((x) => COLUMNAS.unidades.test(x));
  });
  if (iT < 0) return { error: "No encontré los títulos: hacen falta las columnas producto (o código), bodega y unidades." };
  const titulos = (filas[iT] ?? []).map((c) => sinAcentos(String(c ?? "")));
  const col = (k: keyof typeof COLUMNAS) => titulos.findIndex((x) => COLUMNAS[k].test(x));
  const cP = col("producto");
  const cB = col("bodega");
  const cU = col("unidades");
  const cL = col("lote");
  const juntas = new Map<string, FilaConteo>();
  let descartadas = 0;
  for (let i = iT + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    const producto = String(f[cP] ?? "").trim();
    const bodega = String(f[cB] ?? "").trim();
    const crudo = f[cU];
    if (!producto && !bodega && (crudo === null || crudo === undefined || crudo === "")) continue;
    const n = typeof crudo === "number" ? crudo : Number(String(crudo ?? "").replace(/[\s,]/g, ""));
    if (!producto || !bodega || !Number.isInteger(n) || n < 0 || n > 1_000_000) {
      descartadas++;
      continue;
    }
    const lote = cL >= 0 ? String(f[cL] ?? "").trim() || null : null;
    const k = `${sinAcentos(producto)}|${sinAcentos(bodega)}|${lote ? sinAcentos(lote) : ""}`;
    const previo = juntas.get(k);
    if (previo) previo.unidades += n;
    else juntas.set(k, { fila: i + 1, producto: producto.slice(0, 120), bodega: bodega.slice(0, 80), unidades: n, lote: lote ? lote.slice(0, 80) : null });
  }
  return { filas: [...juntas.values()], descartadas };
}

/** Una fila del conteo que llega del navegador: se valida otra vez en el servidor. */
export function validarFilaConteo(v: unknown): FilaConteo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const producto = typeof o.producto === "string" ? o.producto.trim().slice(0, 120) : "";
  const bodega = typeof o.bodega === "string" ? o.bodega.trim().slice(0, 80) : "";
  const unidades = typeof o.unidades === "number" ? o.unidades : NaN;
  const lote = typeof o.lote === "string" && o.lote.trim() ? o.lote.trim().slice(0, 80) : null;
  const fila = typeof o.fila === "number" && Number.isInteger(o.fila) ? o.fila : 0;
  if (!producto || !bodega || !Number.isInteger(unidades) || unidades < 0 || unidades > 1_000_000) return null;
  return { fila, producto, bodega, unidades, lote };
}

/** La clave para buscar un producto o una bodega por lo que escribió la persona (sin acentos ni mayúsculas). */
export const claveBusqueda = (s: string) => sinAcentos(s);

/** El ajuste que deja el stock en lo contado (contado − actual); 0 = no hace falta movimiento. */
export const ajusteConteo = (contado: number, actual: number) => contado - actual;
