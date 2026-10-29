// «Cambiar stock en Dropi» (pedido de Alcides, 28 oct 2026; migración 0173): el stock de una bodega de ECOMFIVE se edita en el sistema, como el
// precio, y queda en la cola de «Aplicar en Dropi» (`tipo = 'stock'`). Lo que se pide es **cuántas unidades deben quedar** en esa bodega: el
// favorito lee el stock de Dropi en ese momento y hace la entrada o la salida que falte (así un reintento no mueve dos veces). La B280 es de
// Dropi y no se toca. Aquí van las piezas puras (sin base ni red), con prueba que también compara la versión en JavaScript del favorito.

import { BODEGA_DROPI } from "./automatico";
import { armarMovimientoStock, stockPorBodega } from "./republicar-dropi";

type Obj = Record<string, unknown>;

/** El concepto del movimiento en Dropi si la persona no escribe otro. */
export const CONCEPTO_STOCK = "Ajuste desde el sistema";
export const MAX_CONCEPTO_STOCK = 60;
export const MAX_UNIDADES_STOCK = 100_000;

/** Lo que lleva un cambio de stock (`datos` de la cola). */
export interface DatosStock {
  /** El ID de la bodega en Dropi (B81 = 81). */
  bodega: number;
  nombreBodega: string;
  /** Las unidades que deben quedar en esa bodega. */
  unidades: number;
  /** Lo que mostraba la última lectura de Dropi al pedirlo (null si no se sabía): para decir «de … a …». */
  antes: number | null;
  concepto: string;
}

const entero = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/** Lo que llega del navegador o de la base, ya limpio (todo lo que no sirve queda vacío). */
export function normalizarDatosStock(crudo: unknown): DatosStock {
  const o = typeof crudo === "object" && crudo !== null ? (crudo as Obj) : {};
  const concepto = String(o.concepto ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONCEPTO_STOCK);
  return {
    bodega: entero(o.bodega) ?? 0,
    nombreBodega: String(o.nombreBodega ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80),
    unidades: entero(o.unidades) ?? -1,
    antes: o.antes === null || o.antes === undefined ? null : entero(o.antes),
    concepto: concepto || CONCEPTO_STOCK,
  };
}

/** Lo que impide pedir el cambio (vacío = se puede). `bodegas` son las de ECOMFIVE del país. */
export function faltantesStock(d: DatosStock, bodegas: { id: number }[]): string[] {
  const faltan: string[] = [];
  if (d.bodega === BODEGA_DROPI) faltan.push("El stock de la bodega de Dropi (B280) no se mueve desde aquí.");
  else if (!bodegas.some((b) => b.id === d.bodega)) faltan.push("Elige una bodega de ECOMFIVE.");
  if (!(d.unidades >= 0) || d.unidades > MAX_UNIDADES_STOCK)
    faltan.push(`Escribe las unidades que deben quedar (de 0 a ${MAX_UNIDADES_STOCK.toLocaleString("es-PA")}).`);
  else if (d.antes !== null && d.unidades === d.antes) faltan.push("Es el mismo stock que tiene: no hay nada que cambiar.");
  return faltan;
}

/**
 * El guardado que deja la bodega con `d.unidades`: una entrada o una salida por la diferencia con lo que Dropi tiene ahora. `cuerpo` es null si ya
 * tiene esas unidades. Error si tiene variaciones, si la bodega no es del proveedor o si quedarían menos unidades que las reservadas a privados.
 */
export function armarAjusteStock(producto: Obj, bodegasProveedor: Obj[], d: DatosStock): { cuerpo: Obj | null; antes: number } | { error: string } {
  if (d.bodega === BODEGA_DROPI || !bodegasProveedor.some((b) => Number(b.id) === d.bodega))
    return { error: "Esa bodega no es de ECOMFIVE en Dropi: el stock no se mueve desde aquí." };
  if (!(d.unidades >= 0)) return { error: "El cambio no trae las unidades." };
  const stock = stockPorBodega(producto);
  const antes = stock[String(d.bodega)] ?? 0;
  if (antes === d.unidades) return { cuerpo: null, antes };
  let total = d.unidades;
  for (const [b, n] of Object.entries(stock)) if (b !== String(d.bodega)) total += n;
  const reservado = (Array.isArray(producto.private_product_inventories) ? (producto.private_product_inventories as Obj[]) : [])
    .filter((p) => !p.deleted_at)
    .reduce((t, p) => t + (Number(p.stock) || 0), 0);
  if (reservado > total) return { error: `Tiene ${reservado} unidades reservadas a privados: el stock total no puede quedar en ${total}.` };
  const r = armarMovimientoStock(producto, bodegasProveedor, { [String(d.bodega)]: d.unidades - antes }, d.concepto || CONCEPTO_STOCK);
  if ("error" in r) return r;
  return { cuerpo: r.cuerpo, antes };
}

/** Lo mismo en JavaScript simple para el favorito (va después de `REPUBLICAR_JS`, que define `mover` y `stockDe`). La prueba compara los dos. */
export const STOCK_JS = [
  "function ajuste(o,bp,d){",
  "var b=Number(d.bodega),u=Number(d.unidades);",
  `if(b===${BODEGA_DROPI}||!bp.some(function(p){return Number(p.id)===b}))return{error:'Esa bodega no es de ECOMFIVE en Dropi: el stock no se mueve desde aquí.'};`,
  "if(!(u>=0))return{error:'El cambio no trae las unidades.'};",
  "var st=stockDe(o),an=st[String(b)]||0,k;if(an===u)return{cuerpo:null,antes:an};",
  "var tt=u;for(k in st)if(k!==String(b))tt+=st[k];",
  "var rs=(Array.isArray(o.private_product_inventories)?o.private_product_inventories:[]).filter(function(p){return!p.deleted_at}).reduce(function(t,p){return t+(Number(p.stock)||0)},0);",
  "if(rs>tt)return{error:'Tiene '+rs+' unidades reservadas a privados: el stock total no puede quedar en '+tt+'.'};",
  "var mv={};mv[String(b)]=u-an;",
  `var r=mover(o,bp,mv,d.concepto||${JSON.stringify(CONCEPTO_STOCK)});if(r.error)return r;`,
  "return{cuerpo:r.cuerpo,antes:an}}",
].join("");
