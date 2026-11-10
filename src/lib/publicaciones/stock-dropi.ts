// «Cambiar stock en Dropi» (pedido de Alcides, 28 oct 2026; migración 0173): el stock de una bodega de ECOMFIVE se edita en el sistema, como el
// precio, y queda en la cola de «Aplicar en Dropi» (`tipo = 'stock'`). Lo que se pide es **cuántas unidades deben quedar** en esa bodega: el
// favorito lee el stock de Dropi en ese momento y hace la entrada o la salida que falte (así un reintento no mueve dos veces). La B280 es de
// Dropi y no se toca. Aquí van las piezas puras (sin base ni red), con prueba que también compara la versión en JavaScript del favorito.
//
// Un producto con variaciones guarda el stock por variación y bodega (5 nov 2026, pedido de Hernán): cada cambio va a una variación (`firma`). El cuerpo es el que manda
// la pantalla de Dropi (atrapado sin enviarlo con la Rodillera 8559): en `warehouselected` lo de esa variación EN SU POSICIÓN de `variations`, con `null` en las anteriores, y
// si la variación aún no tiene esa bodega, la fila va sin `stock`. `variations` no cambia: Dropi suma o resta lo que dice el movimiento.

import { filasDeVariacion, firmaVariacion } from "./apagar-dropi";
import { BODEGA_DROPI, esBodegaDropi } from "./automatico";
import { armarGuardadoProducto } from "./dropi-guardado";
import { armarMovimientoStock, stockPorBodega } from "./republicar-dropi";

type Obj = Record<string, unknown>;

/** El concepto del movimiento en Dropi si la persona no escribe otro. */
export const CONCEPTO_STOCK = "Ajuste desde el sistema";
export const MAX_CONCEPTO_STOCK = 60;
export const MAX_UNIDADES_STOCK = 100_000;

/** Lo que lleva un cambio de stock (`datos` de la cola). */
export interface DatosStock {
  /** El ID de Dropi al que se le cambia el stock (31 oct 2026): una publicación puede tener dos («6667-8295»). null = el primero, como antes. */
  producto: number | null;
  /** El ID de la bodega en Dropi (B81 = 81). */
  bodega: number;
  nombreBodega: string;
  /** Las unidades que deben quedar en esa bodega. */
  unidades: number;
  /** Lo que mostraba la última lectura de Dropi al pedirlo (null si no se sabía): para decir «de … a …». */
  antes: number | null;
  concepto: string;
  /** Con variaciones (5 nov 2026): cuál (`firmaVariacion`, no cambia aunque Dropi cambie su ID). Sin esto es un producto simple. */
  firma?: string | null;
  /** Cómo se muestra esa variación («+1:50», «Negro / M»). */
  etiqueta?: string | null;
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
  const producto = entero(o.producto);
  const firma = String(o.firma ?? "").trim();
  return {
    producto: producto !== null && producto > 0 ? producto : null,
    bodega: entero(o.bodega) ?? 0,
    nombreBodega: String(o.nombreBodega ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80),
    unidades: entero(o.unidades) ?? -1,
    antes: o.antes === null || o.antes === undefined ? null : entero(o.antes),
    concepto: concepto || CONCEPTO_STOCK,
    ...(firma ? { firma, etiqueta: String(o.etiqueta ?? "").trim().slice(0, 80) || null } : {}),
  };
}

/** Lo que va después de la bodega al mostrar un cambio de una variación (« · +1:50»); vacío en un producto simple. */
export const textoVariacion = (d: Pick<DatosStock, "firma" | "etiqueta">) => (d.firma ? ` · ${d.etiqueta || d.firma}` : "");

/**
 * A qué ID de Dropi va el cambio: el elegido si es de la publicación; sin elegir, el primero (lo de antes). Con dos IDs el primero no siempre es el
 * que muestra la ficha (31 oct 2026, Nicol: pidió dejar 50 en el 8295 y la entrada cayó en el 6667, que tenía 0).
 */
export function productoDelCambio(ids: number[], elegido: number | null): number | { error: string } {
  if (!ids.length) return { error: "La publicación no tiene ID de Dropi." };
  if (elegido === null) return ids[0];
  return ids.includes(elegido) ? elegido : { error: `El ID ${elegido} no es de esta publicación.` };
}

/** Lo que impide pedir el cambio (vacío = se puede). `bodegas` son las de ECOMFIVE del país. */
export function faltantesStock(d: DatosStock, bodegas: { id: number }[]): string[] {
  const faltan: string[] = [];
  if (esBodegaDropi(d.bodega)) faltan.push("El stock de la bodega de Dropi no se mueve desde aquí.");
  else if (!bodegas.some((b) => b.id === d.bodega)) faltan.push("Elige una bodega de ECOMFIVE.");
  if (!(d.unidades >= 0) || d.unidades > MAX_UNIDADES_STOCK)
    faltan.push(`Escribe las unidades que deben quedar (de 0 a ${MAX_UNIDADES_STOCK.toLocaleString("es-PA")}).`);
  // No se compara con `d.antes`: es lo que mostraba la última lectura, que puede tener días (10 nov 2026, Lymphatic Drainage: el sistema mostraba 0 y Dropi tenía 100,
  // y «dejarlo en 0» se rechazaba por «es el mismo stock»). El favorito lee el stock del momento y, si ya está en el objetivo, no guarda nada (`armarAjusteStock`).
  return faltan;
}

/**
 * El guardado que deja la bodega con `d.unidades`: una entrada o una salida por la diferencia con lo que Dropi tiene ahora. `cuerpo` es null si ya
 * tiene esas unidades. Error si tiene variaciones, si la bodega no es del proveedor o si quedarían menos unidades que las reservadas a privados.
 */
export function armarAjusteStock(producto: Obj, bodegasProveedor: Obj[], d: DatosStock): { cuerpo: Obj | null; antes: number } | { error: string } {
  if (esBodegaDropi(d.bodega) || !bodegasProveedor.some((b) => Number(b.id) === d.bodega))
    return { error: "Esa bodega no es de ECOMFIVE en Dropi: el stock no se mueve desde aquí." };
  if (!(d.unidades >= 0)) return { error: "El cambio no trae las unidades." };
  const stock = stockPorBodega(producto);
  // Lo que tiene ahora esa bodega, aunque sea negativo (2 nov 2026: el 8822 quedó en -96; con `stockPorBodega`, que solo cuenta lo positivo, se leía 0 y no se movía nada).
  const fila = (Array.isArray(producto.warehouse_product) ? (producto.warehouse_product as Obj[]) : []).find((w) => String(w.warehouse_id) === String(d.bodega));
  const antes = fila && Number.isFinite(Number(fila.stock)) ? Number(fila.stock) : 0;
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

/**
 * El guardado que deja una variación con `d.unidades` en esa bodega, por la diferencia con lo que Dropi tiene ahora. `entradas` = lo que devuelve `get_warehouses_stock` de esa
 * variación. `cuerpo` es null si ya tiene esas unidades. Error si la bodega no es del proveedor, si Dropi ya no tiene la variación o si quedarían menos que lo reservado a privados.
 */
export function armarAjusteStockVariable(producto: Obj, bodegasProveedor: Obj[], d: DatosStock, entradas: Obj[]): { cuerpo: Obj | null; antes: number } | { error: string } {
  if (esBodegaDropi(d.bodega) || !bodegasProveedor.some((b) => Number(b.id) === d.bodega))
    return { error: "Esa bodega no es de ECOMFIVE en Dropi: el stock no se mueve desde aquí." };
  if (!(d.unidades >= 0)) return { error: "El cambio no trae las unidades." };
  // Se busca en todas (no solo en las vivas): la posición es la de `variations` en el cuerpo.
  const todas = Array.isArray(producto.variations) ? (producto.variations as Obj[]) : [];
  const i = todas.findIndex((v) => !v.deleted_at && firmaVariacion(v) === d.firma);
  if (i < 0) return { error: `Dropi ya no tiene la variación ${d.etiqueta || d.firma}.` };
  const fila = entradas.find((e) => Number(e.warehouse_id) === d.bodega);
  const antes = fila && Number.isFinite(Number(fila.stock)) ? Number(fila.stock) : 0;
  if (antes === d.unidades) return { cuerpo: null, antes };
  // Lo reservado a privados es por variación (`variation_id`) y Dropi no deja bajar de eso.
  const reservado = (Array.isArray(producto.private_product_inventories) ? (producto.private_product_inventories as Obj[]) : [])
    .filter((p) => !p.deleted_at && Number(p.variation_id) === Number(todas[i].id))
    .reduce((t, p) => t + (Number(p.stock) || 0), 0);
  const total = entradas.reduce((t, e) => (Number(e.warehouse_id) !== d.bodega && Number(e.stock) > 0 ? t + Number(e.stock) : t), d.unidades);
  if (reservado > total) return { error: `${d.etiqueta || d.firma} tiene ${reservado} unidades reservadas a privados: el stock no puede quedar en ${total}.` };
  const r = armarGuardadoProducto(producto, bodegasProveedor, { nombre: null, nombreGuia: null }, { variable: true });
  if ("error" in r) return r;
  const q = d.unidades - antes;
  const movimiento = { quantity: String(Math.abs(q)), type_movement: q > 0 ? "ENTRADA" : "SALIDA", concept: d.concepto || CONCEPTO_STOCK };
  const lista = filasDeVariacion(entradas, bodegasProveedor, todas[i].id, { [d.bodega]: movimiento });
  const bodegas: (Obj[] | null)[] = Array.from({ length: i + 1 }, (_, j) => (j === i ? lista : null));
  return { cuerpo: { ...r.cuerpo, warehouselected: bodegas }, antes };
}

/** Lo mismo en JavaScript simple para el favorito (va después de `REPUBLICAR_JS`, que define `mover` y `stockDe`; `firmaV` y `filasV` vienen de `APAGAR_JS`). La prueba compara los dos. */
export const STOCK_JS = [
  "function ajuste(o,bp,d){",
  "var b=Number(d.bodega),u=Number(d.unidades);",
  `if(b===${BODEGA_DROPI}||!bp.some(function(p){return Number(p.id)===b}))return{error:'Esa bodega no es de ECOMFIVE en Dropi: el stock no se mueve desde aquí.'};`,
  "if(!(u>=0))return{error:'El cambio no trae las unidades.'};",
  "var st=stockDe(o),wf=(Array.isArray(o.warehouse_product)?o.warehouse_product:[]).filter(function(w){return String(w.warehouse_id)===String(b)})[0],an=wf&&isFinite(Number(wf.stock))?Number(wf.stock):0,k;if(an===u)return{cuerpo:null,antes:an};",
  "var tt=u;for(k in st)if(k!==String(b))tt+=st[k];",
  "var rs=(Array.isArray(o.private_product_inventories)?o.private_product_inventories:[]).filter(function(p){return!p.deleted_at}).reduce(function(t,p){return t+(Number(p.stock)||0)},0);",
  "if(rs>tt)return{error:'Tiene '+rs+' unidades reservadas a privados: el stock total no puede quedar en '+tt+'.'};",
  "var mv={};mv[String(b)]=u-an;",
  `var r=mover(o,bp,mv,d.concepto||${JSON.stringify(CONCEPTO_STOCK)});if(r.error)return r;`,
  "return{cuerpo:r.cuerpo,antes:an}}",
  "function ajusteV(o,bp,d,en){",
  "var b=Number(d.bodega),u=Number(d.unidades);",
  `if(b===${BODEGA_DROPI}||!bp.some(function(p){return Number(p.id)===b}))return{error:'Esa bodega no es de ECOMFIVE en Dropi: el stock no se mueve desde aquí.'};`,
  "if(!(u>=0))return{error:'El cambio no trae las unidades.'};",
  "var td=Array.isArray(o.variations)?o.variations:[],i=-1;td.forEach(function(v,j){if(i<0&&!v.deleted_at&&firmaV(v)===d.firma)i=j});",
  "var nv=d.etiqueta||d.firma;if(i<0)return{error:'Dropi ya no tiene la variación '+nv+'.'};",
  "var fi=en.filter(function(e){return Number(e.warehouse_id)===b})[0],an=fi&&isFinite(Number(fi.stock))?Number(fi.stock):0;if(an===u)return{cuerpo:null,antes:an};",
  "var rs=(Array.isArray(o.private_product_inventories)?o.private_product_inventories:[]).filter(function(p){return!p.deleted_at&&Number(p.variation_id)===Number(td[i].id)}).reduce(function(t,p){return t+(Number(p.stock)||0)},0);",
  "var tt=en.reduce(function(t,e){return Number(e.warehouse_id)!==b&&Number(e.stock)>0?t+Number(e.stock):t},u);",
  "if(rs>tt)return{error:nv+' tiene '+rs+' unidades reservadas a privados: el stock no puede quedar en '+tt+'.'};",
  "var r=armar(o,bp,{nombre:null,nombreGuia:null,variable:true});if(r.error)return r;",
  `var q=u-an,mv={quantity:String(Math.abs(q)),type_movement:q>0?'ENTRADA':'SALIDA',concept:d.concepto||${JSON.stringify(CONCEPTO_STOCK)}};`,
  "var mm={};mm[String(b)]=mv;var li=filasV(en,bp,td[i].id,mm);",
  "var wh=[];for(var j=0;j<=i;j++)wh.push(j===i?li:null);",
  "return{cuerpo:Object.assign({},r.cuerpo,{warehouselected:wh}),antes:an}}",
].join("");
