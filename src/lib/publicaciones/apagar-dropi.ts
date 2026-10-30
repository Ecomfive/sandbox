// «Apagar en Dropi» (pedido de Hernán, 23 oct 2026; migración 0148): lo que hace Nicole a mano cuando despacho avisa que un producto se
// quedó sin stock, ahora como un cambio pendiente que lo aplica el favorito «Aplicar en Dropi» desde la pestaña de Dropi:
//  1. En el ID público: sacar todo el stock (salida, concepto «stock») y guardar.
//  2. En un ID privado (asignado a un correo): sacar el stock y quitar la privatización (en «Productos privados», borrar el correo) y guardar.
//  3. Volver a leerlo para comprobar que quedó en cero.
//  4. Archivarlo. Dropi no deja archivar un producto con órdenes pendientes de despacho: entonces queda «apagado, falta archivar» y el
//     siguiente «Aplicar en Dropi» solo repite el archivado (el stock ya está en cero).
// Aquí van las piezas puras (sin base ni red), con prueba que también compara la versión en JavaScript del favorito.

import { armarGuardadoProducto } from "./dropi-guardado";
import { reservasQuitadas } from "./privatizar-dropi";
import { armarMovimientoStock, stockPorBodega } from "./republicar-dropi";

type Obj = Record<string, unknown>;

/** El concepto con que se saca el stock en Dropi (lo que Nicole escribe a mano). */
export const CONCEPTO_APAGAR = "stock";

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** El nombre sin mayúsculas, acentos ni signos. */
const limpio = (t: string) => sinAcentos(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Un producto privado se llama «P-MA Aceite de semilla de calabaza»: «P-» y las iniciales de a quién se privatizó, y después el nombre del público. */
const PREFIJO_PRIVADO = /^\s*p-[a-z0-9]{1,6}\s+/i;
/** El nombre del producto público al que pertenece una publicación: el suyo, sin el «P-XX» de un privado. */
export const nombreDelPublico = (nombre: string): string => limpio(nombre.replace(PREFIJO_PRIVADO, ""));

export interface PublicacionParaApagar {
  id: string;
  nombre: string;
  tipo: "publico" | "privado" | null;
  dropiId: string;
  archivada: boolean;
}

/**
 * Las demás publicaciones del mismo producto (el público y sus privadas), para elegir cuáles se apagan juntas: de un público, sus privadas;
 * de una privada, el público y sus otras privadas. Todas tienen el mismo nombre sin el prefijo «P-XX».
 */
export function grupoDe(publicacion: PublicacionParaApagar, todas: PublicacionParaApagar[]): PublicacionParaApagar[] {
  const base = nombreDelPublico(publicacion.nombre);
  if (!base) return [];
  return todas.filter((x) => x.id !== publicacion.id && nombreDelPublico(x.nombre) === base && (publicacion.tipo === "privado" ? true : x.tipo === "privado"));
}

/**
 * Las publicaciones privadas de una pública (el «P-MA …» y el «P-SR …» del aceite de semilla de calabaza): las que tienen el mismo
 * nombre sin el prefijo «P-XX». Se apagan con ella (o no, según elija la persona). Una privada no tiene privadas.
 */
export function privadasDe(publica: PublicacionParaApagar, todas: PublicacionParaApagar[]): PublicacionParaApagar[] {
  if (publica.tipo === "privado") return [];
  const base = nombreDelPublico(publica.nombre);
  if (!base) return [];
  return todas.filter((x) => x.id !== publica.id && x.tipo === "privado" && nombreDelPublico(x.nombre) === base);
}

// ---------- Productos con variaciones (1 nov 2026) ----------
// Un producto «VARIABLE» de Dropi (colores, tallas…) guarda su stock por variación y bodega (`variations[].warehouse_product_variation`). Para sacarlo, la pantalla
// de Dropi pide el stock de cada variación (`POST products/get_warehouses_stock` con `type: "VARIABLE"` y su `variation_id`), le pone a cada bodega con unidades
// `quantity`, `type_movement` («SALIDA») y `concept`, y manda `warehouselected` como una lista con una lista de bodegas por variación (`warehousesPrevioSelectedVariations`).
// El favorito hace lo mismo con lo que Dropi le devuelve: no inventa la forma de las bodegas de cada variación.

/** Si es un producto con variaciones (colores, tallas…) de Dropi. */
export const esVariable = (o: Obj) => o.type === "VARIABLE";

/** Las variaciones que siguen vivas, en el orden en que Dropi las lista (el favorito pide el stock de cada una en ese orden). */
export const variacionesVivas = (o: Obj): Obj[] => (Array.isArray(o.variations) ? (o.variations as Obj[]) : []).filter((v) => !v.deleted_at);

/** Qué variación es, para emparejar la de un privado con la de su público: sus atributos («color=rojo,talla=m») o, si no tiene, su SKU. */
export function firmaVariacion(v: Obj): string {
  const atributos = (Array.isArray(v.attribute_values) ? (v.attribute_values as Obj[]) : [])
    .filter((a) => !a.deleted_at)
    .map((a) => `${limpio(String(a.attribute_name ?? ""))}=${limpio(String(a.value ?? ""))}`)
    .sort()
    .join(",");
  return atributos || limpio(String(v.sku ?? ""));
}

/** Las unidades de un producto con variaciones por bodega y variación, con la llave «<bodega>|<variación>» (`{ "81|color=rojo,talla=m": 5 }`); solo las que tienen unidades. */
export function unidadesDeVariable(o: Obj): Record<string, number> {
  const u: Record<string, number> = {};
  for (const v of variacionesVivas(o)) {
    const f = firmaVariacion(v);
    for (const w of Array.isArray(v.warehouse_product_variation) ? (v.warehouse_product_variation as Obj[]) : []) {
      const n = Number(w.stock);
      const b = Number(w.warehouse_id ?? (w.warehouse as Obj | undefined)?.id);
      if (n > 0 && b > 0) u[`${b}|${f}`] = (u[`${b}|${f}`] ?? 0) + n;
    }
  }
  return u;
}

/** Las unidades que tiene un producto en total, simple o con variaciones. */
export function unidadesTotales(o: Obj): number {
  const m = esVariable(o) ? unidadesDeVariable(o) : stockPorBodega(o);
  return Object.values(m).reduce((t, n) => t + n, 0);
}

/**
 * El guardado que apaga un producto CON VARIACIONES: saca todo el stock de cada variación (salida, concepto «stock») y, con `quitarPrivados`, deja sin reservas a
 * privados. `entradas` = por cada variación viva (en el orden de `variacionesVivas`), lo que Dropi devuelve de `get_warehouses_stock`. `cuerpo` es null si no hay nada que
 * guardar. Error si le faltan los atributos o hay stock en una bodega que no es del proveedor (la B280).
 */
export function armarApagadoVariable(producto: Obj, bodegasProveedor: Obj[], quitarPrivados: boolean, entradas: Obj[][], concepto: string = CONCEPTO_APAGAR): { cuerpo: Obj | null; unidades: number; privadas: number } | { error: string } {
  const propias = new Set(bodegasProveedor.map((b) => Number(b.id)));
  const r = armarGuardadoProducto(producto, bodegasProveedor, { nombre: null, nombreGuia: null }, { variable: true });
  if ("error" in r) return r;
  let unidades = 0;
  let fuera = false;
  const bodegas = entradas.map((a) =>
    a.map((e) => {
      const n = Number(e.stock);
      if (!(n > 0)) return e;
      if (!propias.has(Number(e.warehouse_id))) fuera = true;
      unidades += n;
      return { ...e, quantity: n, type_movement: "SALIDA", concept: concepto };
    }),
  );
  if (fuera) return { error: "Tiene stock en una bodega que no es de ECOMFIVE (la B280 de Dropi): no se puede apagar desde aquí." };
  const privadas = (Array.isArray(producto.private_product_inventories) ? (producto.private_product_inventories as Obj[]) : []).filter((p) => !p.deleted_at).length;
  const quitar = quitarPrivados && privadas > 0;
  if (!unidades && !quitar) return { cuerpo: null, unidades: 0, privadas };
  const cuerpo: Obj = { ...r.cuerpo, warehouselected: unidades ? bodegas : [] };
  if (quitar) cuerpo.private_product_inventories = reservasQuitadas(producto.private_product_inventories);
  return { cuerpo, unidades, privadas };
}

/**
 * El cuerpo del `POST api/products` que crea el producto nuevo al republicar uno CON VARIACIONES: lo mismo que el guardado del viejo pero sin ID (ni en el producto, ni en sus atributos,
 * valores y variaciones: como una creación de la pantalla de Dropi, donde lo nuevo va con `id: null`), solo con las variaciones y atributos vivos, sin reservas a privados y con el stock de
 * cada variación (`stock` de la variación y su lista de bodegas en `warehouselected`, una por variación en el mismo orden). Error si no se puede republicar: stock en una bodega que no es del
 * proveedor (B280), unidades privatizadas o porcentajes por dropshipper. El precio de cada variación se copia igual.
 */
export function armarProductoNuevoVariable(producto: Obj, bodegasProveedor: Obj[]): { cuerpo: Obj } | { error: string } {
  const r = armarGuardadoProducto(producto, bodegasProveedor, { nombre: null, nombreGuia: null }, { variable: true });
  if ("error" in r) return r;
  const propias = new Set(bodegasProveedor.map((b) => Number(b.id)));
  if (Object.keys(unidadesDeVariable(producto)).some((k) => !propias.has(Number(k.slice(0, k.indexOf("|")))))) return { error: "Tiene stock en una bodega que no es de ECOMFIVE (la B280 de Dropi): no se republica." };
  const privados = Array.isArray(producto.private_product_inventories) ? (producto.private_product_inventories as Obj[]) : [];
  if (privados.some((p) => !p.deleted_at && Number(p.stock) > 0)) return { error: "Tiene unidades privatizadas: quítalas en Dropi antes de republicar." };
  if (Array.isArray(producto.user_profit_percentage_product) && producto.user_profit_percentage_product.length) return { error: "Tiene porcentajes por dropshipper: republícala a mano en Dropi." };
  const vivas = variacionesVivas(producto);
  const bodegasDe = (v: Obj) => (Array.isArray(v.warehouse_product_variation) ? (v.warehouse_product_variation as Obj[]) : []);
  const atributos = (r.cuerpo.attribute as Obj[])
    .filter((a) => !a.deleted_at)
    .map((a) => ({ ...a, id: null, product_id: null, values: (a.values as Obj[]).filter((x) => !x.deleted_at).map((x) => ({ ...x, id: null, attribute_id: null })) }));
  const variaciones = (r.cuerpo.variations as Obj[])
    .filter((v) => !v.deleted_at)
    .map((v, i) => ({
      ...v,
      id: null,
      product_id: null,
      stock: bodegasDe(vivas[i]).reduce((t, w) => t + (Number(w.stock) > 0 ? Number(w.stock) : 0), 0),
      attribute_values: (v.attribute_values as Obj[]).filter((x) => !x.deleted_at).map((x) => ({ ...x, id: null, attribute_id: null })),
    }));
  const bodegas = vivas.map((v) =>
    bodegasDe(v)
      .filter((w) => Number(w.stock) > 0)
      .map((w) => {
        const x = (w.warehouse ?? {}) as Obj;
        return { warehouse_id: Number(w.warehouse_id ?? x.id), fullName: `${x.name ?? ""}(${x.address ?? ""})`, stock: Number(w.stock) };
      }),
  );
  return { cuerpo: { ...r.cuerpo, id: null, private_product_inventories: [], attribute: atributos, variations: variaciones, warehouselected: bodegas } };
}

/**
 * Las unidades de un privado con variaciones (`unidadesDeVariable`) puestas en las variaciones de su público: `{ [posición entre las vivas del público]: { [bodega]: unidades } }`.
 * Error —antes de tocar nada— si una variación con unidades no está en el público o si el público no tiene variaciones.
 */
export function emparejarDevolucion(publico: Obj, unidades: Record<string, number>): { porVariacion: Record<string, Record<string, number>> } | { error: string } {
  const pv = variacionesVivas(publico);
  const porVariacion: Record<string, Record<string, number>> = {};
  const sinPar: string[] = [];
  for (const [k, n] of Object.entries(unidades)) {
    const i0 = k.indexOf("|");
    if (i0 < 0) return { error: "El público tiene variaciones y este privado no: devuelve esas unidades a mano." };
    const bodega = k.slice(0, i0);
    const firma = k.slice(i0 + 1);
    const i = pv.findIndex((v) => firmaVariacion(v) === firma);
    if (i < 0) {
      if (!sinPar.includes(firma)) sinPar.push(firma);
      continue;
    }
    (porVariacion[i] ??= {})[bodega] = (porVariacion[i][bodega] ?? 0) + n;
  }
  if (sinPar.length) return { error: `El público no tiene la variación ${sinPar.map((x) => x || "(sin atributos)").join(", ")}: devuelve esas unidades a mano.` };
  return { porVariacion };
}

/** El guardado que le devuelve unidades a un público con variaciones: una entrada por variación y bodega (`porVariacion`, de `emparejarDevolucion`) sobre lo que Dropi devuelve de cada variación. */
export function armarEntradaVariable(publico: Obj, bodegasProveedor: Obj[], porVariacion: Record<string, Record<string, number>>, entradas: Obj[][], concepto: string): { cuerpo: Obj } | { error: string } {
  const r = armarGuardadoProducto(publico, bodegasProveedor, { nombre: null, nombreGuia: null }, { variable: true });
  if ("error" in r) return r;
  let movidas = 0;
  let esperadas = 0;
  for (const i of Object.keys(porVariacion)) esperadas += Object.keys(porVariacion[i]).length;
  const bodegas = entradas.map((a, i) =>
    a.map((e) => {
      const q = Number(porVariacion[String(i)]?.[String(e.warehouse_id)] ?? 0);
      if (!q) return e;
      movidas++;
      return { ...e, quantity: q, type_movement: "ENTRADA", concept: concepto };
    }),
  );
  if (movidas !== esperadas) return { error: "Una bodega de esas unidades no está en la variación del público." };
  return { cuerpo: { ...r.cuerpo, warehouselected: bodegas } };
}

/**
 * El guardado que apaga un producto: saca el stock de cada bodega de ECOMFIVE (concepto «stock») y, con `quitarPrivados`, deja sin
 * reservas a privados (como borrar los correos en «Productos privados»). `cuerpo` es null si no hay nada que guardar (ya está en
 * cero y sin privatizaciones). Error si tiene variaciones o stock en una bodega que no es del proveedor (la B280 de Dropi).
 */
export function armarApagado(producto: Obj, bodegasProveedor: Obj[], quitarPrivados: boolean): { cuerpo: Obj | null; unidades: number; privadas: number } | { error: string } {
  // Un producto con variaciones se apaga con `armarApagadoVariable` (el stock está por variación, no en `warehouse_product`).
  if (esVariable(producto)) return { error: "Tiene variaciones: se apaga con el stock de cada variación." };
  const propias = new Set(bodegasProveedor.map((b) => Number(b.id)));
  const bodegas = Array.isArray(producto.warehouse_product) ? (producto.warehouse_product as Obj[]) : [];
  if (bodegas.some((w) => Number(w.stock) > 0 && !propias.has(Number(w.warehouse_id)))) return { error: "Tiene stock en una bodega que no es de ECOMFIVE (la B280 de Dropi): no se puede apagar desde aquí." };
  const stock = stockPorBodega(producto);
  const movimientos: Record<string, number> = {};
  let unidades = 0;
  for (const [bodega, n] of Object.entries(stock)) {
    movimientos[bodega] = -n;
    unidades += n;
  }
  const privadas = (Array.isArray(producto.private_product_inventories) ? (producto.private_product_inventories as Obj[]) : []).filter((p) => !p.deleted_at).length;
  const quitar = quitarPrivados && privadas > 0;
  if (!unidades && !quitar) return { cuerpo: null, unidades: 0, privadas };
  const r = unidades ? armarMovimientoStock(producto, bodegasProveedor, movimientos, CONCEPTO_APAGAR) : armarGuardadoProducto(producto, bodegasProveedor, { nombre: null, nombreGuia: null });
  if ("error" in r) return r;
  const cuerpo: Obj = { ...r.cuerpo };
  // Como lo hace la pantalla de Dropi al borrar un correo de «Productos privados»: la reserva va marcada como quitada (`deleted_at` y `change`).
  if (quitar) cuerpo.private_product_inventories = reservasQuitadas(producto.private_product_inventories);
  return { cuerpo, unidades, privadas };
}

/**
 * «Quitar privatización» (pedido de Hernán, 30 oct 2026): el candado de un ID privado. Es un apagado del privado (sacarle el stock, quitarle el
 * correo y archivarlo) que además le devuelve esas unidades al público del que salió. Va en `datos` del apagado: el ID de Dropi del público, las
 * unidades que tenía el privado por bodega (las anota el favorito al sacarlas, así un reintento no las cuenta de nuevo; null = todavía no se
 * sacaron) y si ya se devolvieron (no se devuelven dos veces).
 */
export interface DatosDevolver {
  /** El ID de Dropi del público que recibe las unidades. */
  publico: number;
  /** Su publicación en el sistema. */
  publicacionId: string | null;
  unidades: Record<string, number> | null;
  devuelto: boolean;
}

/** Unidades por bodega (`{ "81": 50 }`) o, de un producto con variaciones, por bodega y variación (`{ "81|color=rojo,talla=m": 5 }`): solo con unidades enteras mayores que cero; null si no hay ninguna. */
export function normalizarUnidades(crudo: unknown): Record<string, number> | null {
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(crudo as Obj).slice(0, 20)) if (/^\d{1,9}(\|[a-z0-9 =,]{0,150})?$/.test(k) && Number.isInteger(Number(v)) && Number(v) > 0) out[k] = Number(v);
  return Object.keys(out).length ? out : null;
}

/** Los datos de devolver de un apagado (de la base o del favorito); null si el apagado no devuelve nada (un apagado de siempre). */
export function normalizarDatosDevolver(crudo: unknown): DatosDevolver | null {
  if (!crudo || typeof crudo !== "object") return null;
  const d = crudo as Obj;
  const publico = Number(d.publico);
  if (!Number.isInteger(publico) || publico <= 0 || publico >= 100_000_000) return null;
  const pub = typeof d.publicacionId === "string" && /^[0-9a-f-]{36}$/i.test(d.publicacionId) ? d.publicacionId : null;
  return { publico, publicacionId: pub, unidades: normalizarUnidades(d.unidades), devuelto: d.devuelto === true };
}

/** Lo mismo en JavaScript simple para el favorito (va después de `REPUBLICAR_JS`, que define `mover` y `stockDe`, y de `PRIVATIZAR_JS`, que define `reservasQuitadas`). La prueba compara los dos. */
export const APAGAR_JS = [
  "function apagado(o,bp,q){",
  "if(o.type==='VARIABLE')return{error:'Tiene variaciones: se apaga con el stock de cada variación.'};",
  "var pr={};bp.forEach(function(p){pr[Number(p.id)]=1});",
  "var wp=Array.isArray(o.warehouse_product)?o.warehouse_product:[];",
  "if(wp.some(function(w){return Number(w.stock)>0&&!pr[Number(w.warehouse_id)]}))return{error:'Tiene stock en una bodega que no es de ECOMFIVE (la B280 de Dropi): no se puede apagar desde aquí.'};",
  "var st=stockDe(o),mv={},un=0,k;for(k in st){mv[k]=-st[k];un+=st[k]}",
  "var pi=(Array.isArray(o.private_product_inventories)?o.private_product_inventories:[]).filter(function(p){return!p.deleted_at}).length;",
  "var qt=q&&pi>0;if(!un&&!qt)return{cuerpo:null,unidades:0,privadas:pi};",
  "var r=un?mover(o,bp,mv," + JSON.stringify(CONCEPTO_APAGAR) + "):armar(o,bp,{nombre:null,nombreGuia:null});if(r.error)return r;",
  "var c=Object.assign({},r.cuerpo);if(qt)c.private_product_inventories=reservasQuitadas(o.private_product_inventories);",
  "return{cuerpo:c,unidades:un,privadas:pi}}",
  // ---- Productos con variaciones (lo mismo que `armarApagadoVariable`, `emparejarDevolucion` y `armarEntradaVariable`) ----
  "function limpV(t){return String(t==null?'':t).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}",
  "function esV(o){return o.type==='VARIABLE'}",
  "function vivasV(o){return(Array.isArray(o.variations)?o.variations:[]).filter(function(v){return!v.deleted_at})}",
  "function firmaV(v){var a=(Array.isArray(v.attribute_values)?v.attribute_values:[]).filter(function(x){return!x.deleted_at}).map(function(x){return limpV(x.attribute_name)+'='+limpV(x.value)}).sort().join(',');return a||limpV(v.sku)}",
  "function unidadesV(o){var u={};vivasV(o).forEach(function(v){var f=firmaV(v);(Array.isArray(v.warehouse_product_variation)?v.warehouse_product_variation:[]).forEach(function(w){var n=Number(w.stock),b=Number(w.warehouse_id!=null?w.warehouse_id:(w.warehouse&&w.warehouse.id));if(n>0&&b>0){var k=b+'|'+f;u[k]=(u[k]||0)+n}})});return u}",
  "function totalU(o){var m=esV(o)?unidadesV(o):stockDe(o),s=0,k;for(k in m)s+=m[k];return s}",
  "function apagadoV(o,bp,q,en,cp){var pr={};bp.forEach(function(p){pr[Number(p.id)]=1});",
  "var r=armar(o,bp,{nombre:null,nombreGuia:null,variable:true});if(r.error)return r;",
  "var un=0,fu=false;var wh=en.map(function(a){return a.map(function(e){var n=Number(e.stock);if(!(n>0))return e;if(!pr[Number(e.warehouse_id)])fu=true;un+=n;return Object.assign({},e,{quantity:n,type_movement:'SALIDA',concept:cp||" + JSON.stringify(CONCEPTO_APAGAR) + "})})});",
  "if(fu)return{error:'Tiene stock en una bodega que no es de ECOMFIVE (la B280 de Dropi): no se puede apagar desde aquí.'};",
  "var pi=(Array.isArray(o.private_product_inventories)?o.private_product_inventories:[]).filter(function(p){return!p.deleted_at}).length;",
  "var qt=q&&pi>0;if(!un&&!qt)return{cuerpo:null,unidades:0,privadas:pi};",
  "var c=Object.assign({},r.cuerpo,{warehouselected:un?wh:[]});if(qt)c.private_product_inventories=reservasQuitadas(o.private_product_inventories);",
  "return{cuerpo:c,unidades:un,privadas:pi}}",
  "function nuevoV(o,bp){var r=armar(o,bp,{nombre:null,nombreGuia:null,variable:true});if(r.error)return r;var pr={};bp.forEach(function(p){pr[Number(p.id)]=1});",
  "var u=unidadesV(o),k;for(k in u)if(!pr[Number(k.slice(0,k.indexOf('|')))])return{error:'Tiene stock en una bodega que no es de ECOMFIVE (la B280 de Dropi): no se republica.'};",
  "var pi=Array.isArray(o.private_product_inventories)?o.private_product_inventories:[];",
  "if(pi.some(function(p){return!p.deleted_at&&Number(p.stock)>0}))return{error:'Tiene unidades privatizadas: quítalas en Dropi antes de republicar.'};",
  "if(Array.isArray(o.user_profit_percentage_product)&&o.user_profit_percentage_product.length)return{error:'Tiene porcentajes por dropshipper: republícala a mano en Dropi.'};",
  "var vv=vivasV(o),bd=function(v){return Array.isArray(v.warehouse_product_variation)?v.warehouse_product_variation:[]};",
  "var at=r.cuerpo.attribute.filter(function(a){return!a.deleted_at}).map(function(a){return Object.assign({},a,{id:null,product_id:null,values:a.values.filter(function(x){return!x.deleted_at}).map(function(x){return Object.assign({},x,{id:null,attribute_id:null})})})});",
  "var va=r.cuerpo.variations.filter(function(v){return!v.deleted_at}).map(function(v,i){var t=0;bd(vv[i]).forEach(function(w){t+=Number(w.stock)>0?Number(w.stock):0});return Object.assign({},v,{id:null,product_id:null,stock:t,attribute_values:v.attribute_values.filter(function(x){return!x.deleted_at}).map(function(x){return Object.assign({},x,{id:null,attribute_id:null})})})});",
  "var wh=vv.map(function(v){return bd(v).filter(function(w){return Number(w.stock)>0}).map(function(w){var x=w.warehouse||{};return{warehouse_id:Number(w.warehouse_id!=null?w.warehouse_id:x.id),fullName:(x.name!=null?x.name:'')+'('+(x.address!=null?x.address:'')+')',stock:Number(w.stock)}})});",
  "return{cuerpo:Object.assign({},r.cuerpo,{id:null,private_product_inventories:[],attribute:at,variations:va,warehouselected:wh})}}",
  "function emparejarV(po,u){var pv=vivasV(po),por={},sp=[],k;",
  "for(k in u){var i0=k.indexOf('|');if(i0<0)return{error:'El público tiene variaciones y este privado no: devuelve esas unidades a mano.'};",
  "var b=k.slice(0,i0),f=k.slice(i0+1),i=-1;pv.forEach(function(v,j){if(i<0&&firmaV(v)===f)i=j});",
  "if(i<0){if(sp.indexOf(f)<0)sp.push(f);continue}",
  "if(!por[i])por[i]={};por[i][b]=(por[i][b]||0)+u[k]}",
  "if(sp.length)return{error:'El público no tiene la variación '+sp.map(function(x){return x||'(sin atributos)'}).join(', ')+': devuelve esas unidades a mano.'};",
  "return{porVariacion:por}}",
  "function entradaV(po,bp,pv,en,k){var r=armar(po,bp,{nombre:null,nombreGuia:null,variable:true});if(r.error)return r;",
  "var mv=0,es=0,i,b;for(i in pv)for(b in pv[i])es++;",
  "var wh=en.map(function(a,i2){return a.map(function(e){var q=Number(pv[String(i2)]&&pv[String(i2)][String(e.warehouse_id)]||0);if(!q)return e;mv++;return Object.assign({},e,{quantity:q,type_movement:'ENTRADA',concept:k})})});",
  "if(mv!==es)return{error:'Una bodega de esas unidades no está en la variación del público.'};",
  "return{cuerpo:Object.assign({},r.cuerpo,{warehouselected:wh})}}",
].join("");
