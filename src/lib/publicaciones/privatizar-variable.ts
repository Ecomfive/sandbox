// «Privatizar en Dropi» de un producto con variaciones (pedido de Hernán, 5 nov 2026: los Lentes TR90, ID 6577). Sigue lo que hace la pantalla de Dropi
// (leído de su código, `createPrivateProductInventory` y `privateVariationStockFix`): un producto privado VARIABLE aparte, con solo las variaciones pedidas, y
// en `private_product_inventories` **una reserva por dropshipper y variación** (`variation_id`). Las bodegas y salidas por variación son las de apagar y
// republicar (`apagar-dropi.ts`). Va un solo correo por producto privado: repartir cada variación entre varios correos no se pidió.
// Aquí van las piezas puras (sin base ni red), con prueba que también compara la versión en JavaScript del favorito.

import { compararOpciones, esTallaConocida } from "@/lib/wms/talla";
import { firmaVariacion, variacionesVivas } from "./apagar-dropi";
import { armarGuardadoProducto } from "./dropi-guardado";
import { reservaDeDropi, type DatosPrivatizar } from "./privatizar-dropi";

type Obj = Record<string, unknown>;

/** Una variación como la guarda la lectura de «Mis productos» (`dropi_productos_proveedor.variaciones`, migración 0226). */
export interface VariacionLeida {
  /** Qué variación es: `firmaVariacion` (no cambia aunque Dropi cambie su ID). */
  firma: string;
  /** Cómo se muestra: sus valores («Negro / M») o, sin atributos, su SKU. */
  etiqueta: string;
  sku: string | null;
  bodegas: { id: number; stock: number }[];
}

const bodegasDe = (v: Obj) => (Array.isArray(v.warehouse_product_variation) ? (v.warehouse_product_variation as Obj[]) : []);
const idBodega = (w: Obj) => Number(w.warehouse_id ?? (w.warehouse as Obj | undefined)?.id);
const valoresVivos = (v: Obj) => (Array.isArray(v.attribute_values) ? (v.attribute_values as Obj[]) : []).filter((a) => !a.deleted_at);

/** Las variaciones vivas que trae la lectura de un producto (null si no las trae, como un producto simple o una lectura anterior). */
export function variacionesDeLectura(o: Obj): VariacionLeida[] | null {
  if (!Array.isArray(o.variations) || !o.variations.length) return null;
  return variacionesVivas(o).map((v) => {
    const porBodega = new Map<number, number>();
    for (const w of bodegasDe(v)) {
      const b = idBodega(w);
      if (b > 0) porBodega.set(b, (porBodega.get(b) ?? 0) + Math.max(0, Number(w.stock) || 0));
    }
    const sku = typeof v.sku === "string" && v.sku.trim() ? v.sku.trim() : null;
    const valores = valoresVivos(v).map((a) => String(a.value ?? "").trim()).filter(Boolean);
    return { firma: firmaVariacion(v), etiqueta: valores.join(" / ") || sku || "Sin nombre", sku, bodegas: [...porBodega].map(([id, stock]) => ({ id, stock })) };
  });
}

/** El número de una graduación («+1:50», «-0.75»); null si la etiqueta no es un número (una talla, un color). */
function numeroDeEtiqueta(etiqueta: string): number | null {
  const m = etiqueta.trim().match(/^([+-]?\d+)(?:[.,:](\d+))?$/);
  return m ? Number(`${m[1]}.${m[2] ?? 0}`) : null;
}

/** Las variaciones en el orden en que se muestran: de menor a mayor si todas son números (graduaciones), de la talla más chica a la más grande si todas traen una talla (S, M, L, XL, 2XL); las demás, en el orden de Dropi. */
export function ordenarVariaciones<T extends { etiqueta: string }>(lista: T[]): T[] {
  if (lista.every((v) => numeroDeEtiqueta(v.etiqueta) !== null)) return [...lista].sort((a, b) => numeroDeEtiqueta(a.etiqueta)! - numeroDeEtiqueta(b.etiqueta)!);
  if (lista.length > 1 && lista.every((v) => v.etiqueta.split(" / ").some(esTallaConocida))) return [...lista].sort((a, b) => compararOpciones(a.etiqueta, b.etiqueta));
  return lista;
}

/** Lo que la lectura dice que hay de una variación en una bodega. */
export const stockEnBodega = (v: VariacionLeida, bodega: number) => v.bodegas.find((b) => b.id === bodega)?.stock ?? 0;

/** Lo que no cuadra con la última lectura: una variación que ya no está o que no tiene tantas unidades en esa bodega (la comprobación de verdad la hace el favorito en Dropi). */
export function faltantesVariaciones(d: Pick<DatosPrivatizar, "variaciones" | "bodega">, leidas: VariacionLeida[]): string[] {
  const f: string[] = [];
  for (const x of d.variaciones ?? []) {
    const v = leidas.find((y) => y.firma === x.firma);
    if (!v) f.push(`Dropi ya no muestra la variación ${x.etiqueta}.`);
    else if (stockEnBodega(v, d.bodega) < x.unidades) f.push(`De ${v.etiqueta} solo hay ${stockEnBodega(v, d.bodega).toLocaleString("es-PA")} unidades en esa bodega y se piden ${x.unidades.toLocaleString("es-PA")}.`);
  }
  return f;
}

/** Las unidades de cada variación, como se muestran: «+1.00: 10 · +1.50: 5». */
export const textoVariaciones = (d: Pick<DatosPrivatizar, "variaciones">) => (d.variaciones ?? []).map((x) => `${x.etiqueta}: ${x.unidades.toLocaleString("es-PA")}`).join(" · ");

/** Las unidades pedidas con la llave de `unidadesDeVariable` (`{ "81|talla=m": 5 }`). */
export function unidadesPedidas(d: Pick<DatosPrivatizar, "variaciones" | "bodega">): Record<string, number> {
  const u: Record<string, number> = {};
  for (const x of d.variaciones ?? []) u[`${d.bodega}|${x.firma}`] = x.unidades;
  return u;
}

/** Por qué este público no se puede privatizar por variación (o null si sí). */
export function errorDeVariable(producto: Obj, bodegasProveedor: Obj[], d: DatosPrivatizar): string | null {
  if (producto.privated_product === true) return "Ese producto ya es privado: se privatiza el público.";
  if (!bodegasProveedor.some((b) => Number(b.id) === d.bodega)) return "Esa bodega no es de ECOMFIVE: solo se privatiza stock de las bodegas propias.";
  const vivas = variacionesVivas(producto);
  for (const x of d.variaciones ?? []) {
    const v = vivas.find((y) => firmaVariacion(y) === x.firma);
    if (!v) return `El público ya no tiene la variación ${x.etiqueta}.`;
    if (d.salida) continue;
    const hay = bodegasDe(v).filter((w) => idBodega(w) === d.bodega).reduce((t, w) => t + Number(w.stock ?? 0), 0);
    if (hay < x.unidades) return `De ${x.etiqueta} el público solo tiene ${hay.toLocaleString("es-PA")} unidades en esa bodega de Dropi y se piden ${x.unidades.toLocaleString("es-PA")}.`;
  }
  return null;
}

/**
 * El `POST api/products` que crea el privado con variaciones: el guardado del público con el nombre y el precio del privado, sin IDs (como una creación de la pantalla), solo con las
 * variaciones pedidas y sus valores, cada una con sus unidades (`warehouselected`, una lista por variación en el mismo orden), sin reservas ni porcentajes por dropshipper.
 */
export function armarPrivadoVariable(producto: Obj, bodegasProveedor: Obj[], d: DatosPrivatizar): { cuerpo: Obj } | { error: string } {
  const e = errorDeVariable(producto, bodegasProveedor, d);
  if (e) return { error: e };
  const r = armarGuardadoProducto(producto, bodegasProveedor, { nombre: d.nombre, nombreGuia: null, precio: d.precio, precioSugerido: d.precio }, { variable: true });
  if ("error" in r) return r;
  const vivas = variacionesVivas(producto);
  const elegidas = (d.variaciones ?? []).map((x) => ({ x, v: vivas.find((y) => firmaVariacion(y) === x.firma)! }));
  const usados = new Set(elegidas.flatMap(({ v }) => valoresVivos(v).map((a) => String(a.value))));
  const atributos = (r.cuerpo.attribute as Obj[])
    .filter((a) => !a.deleted_at)
    .map((a) => ({ ...a, id: null, product_id: null, values: (a.values as Obj[]).filter((x) => !x.deleted_at && usados.has(String(x.value))).map((x) => ({ ...x, id: null, attribute_id: null })) }));
  const variaciones = elegidas.map(({ x, v }) => ({
    ...(r.cuerpo.variations as Obj[]).find((y) => y.id === v.id),
    id: null,
    product_id: null,
    sale_price: d.precio,
    suggested_price: d.precio,
    stock: x.unidades,
    attribute_values: valoresVivos(v).map((a) => ({ id: null, value: a.value ?? "", attribute_id: null, attribute_name: a.attribute_name ?? "", deleted_at: null })),
  }));
  const bodegas = elegidas.map(({ x, v }) => {
    const w = (bodegasDe(v).find((y) => idBodega(y) === d.bodega)?.warehouse ?? bodegasProveedor.find((b) => Number(b.id) === d.bodega) ?? {}) as Obj;
    return [{ warehouse_id: d.bodega, fullName: `${w.name ?? ""}(${w.address ?? ""})`, stock: x.unidades }];
  });
  return { cuerpo: { ...r.cuerpo, id: null, privated_product: true, private_product_inventories: [], user_profit_percentage_product: [], attribute: atributos, variations: variaciones, warehouselected: bodegas } };
}

/** Las reservas de ese usuario que todavía no están en el privado (un reintento no las repite). */
function porReservar(privado: Obj, usuarioId: number, d: DatosPrivatizar) {
  const vivas = variacionesVivas(privado);
  const hechas = (Array.isArray(privado.private_product_inventories) ? (privado.private_product_inventories as Obj[]) : []).filter((x) => !x.deleted_at && Number(x.user_id) === usuarioId);
  return (d.variaciones ?? []).map((x) => ({ x, v: vivas.find((y) => firmaVariacion(y) === x.firma) })).filter(({ v }) => !v || !hechas.some((h) => Number(h.variation_id) === Number(v.id)));
}

/** ¿El privado ya tiene la reserva de cada variación para ese usuario? */
export const yaReservado = (privado: Obj, usuarioId: number, d: DatosPrivatizar) => porReservar(privado, usuarioId, d).length === 0;

/** El `PUT api/products/<id>` que le reserva al dropshipper sus unidades en el privado: una reserva por variación, como la pantalla. `usuario` = `objects` de `existemail`. */
export function armarAsignacionVariable(privado: Obj, bodegasProveedor: Obj[], usuario: Obj, d: DatosPrivatizar): { cuerpo: Obj } | { error: string } {
  const r = armarGuardadoProducto(privado, bodegasProveedor, { nombre: null, nombreGuia: null }, { variable: true });
  if ("error" in r) return r;
  const previas = (Array.isArray(privado.private_product_inventories) ? (privado.private_product_inventories as Obj[]) : []).map((x) => reservaDeDropi(x));
  const faltan = porReservar(privado, Number(usuario.id), d);
  const sinPar = faltan.find(({ v }) => !v);
  if (sinPar) return { error: `El producto privado no tiene la variación ${sinPar.x.etiqueta}.` };
  const nuevas = faltan.map(({ x, v }) => reservaDeDropi({ id: null, product_id: privado.id, variation_id: v!.id, user_id: usuario.id, user: usuario, stock: x.unidades, last_quantity_separed: null, email: d.correo }, { change: true }));
  return { cuerpo: { ...r.cuerpo, private_product_inventories: [...previas, ...nuevas] } };
}

/**
 * El `PUT` que le saca al público las unidades de cada variación (concepto: a qué ID pasaron). `entradas` = por cada variación viva, en el orden de `variacionesVivas`, lo que Dropi devuelve de
 * `get_warehouses_stock`. Error si una bodega no aparece o no tiene tantas unidades: entonces no se mueve nada.
 */
export function armarSalidaVariable(publico: Obj, bodegasProveedor: Obj[], d: DatosPrivatizar, entradas: Obj[][], idPrivado: number): { cuerpo: Obj } | { error: string } {
  const r = armarGuardadoProducto(publico, bodegasProveedor, { nombre: null, nombreGuia: null }, { variable: true });
  if ("error" in r) return r;
  const vivas = variacionesVivas(publico);
  let movidas = 0;
  let corta = false;
  const bodegas = entradas.map((a, i) => {
    const q = (d.variaciones ?? []).find((x) => x.firma === firmaVariacion(vivas[i]))?.unidades ?? 0;
    return a.map((e) => {
      if (!q || Number(e.warehouse_id) !== d.bodega) return e;
      if (Number(e.stock) < q) corta = true;
      movidas++;
      return { ...e, quantity: q, type_movement: "SALIDA", concept: `Privatizado en el ID ${idPrivado}` };
    });
  });
  if (corta) return { error: "El público ya no tiene esas unidades en esa bodega." };
  if (movidas !== (d.variaciones ?? []).length) return { error: "Una variación del público no tiene esa bodega." };
  return { cuerpo: { ...r.cuerpo, warehouselected: bodegas } };
}

/** Lo mismo en JavaScript simple para el favorito (va después de `PRIVATIZAR_JS` y `APAGAR_JS`, que definen `reserva`, `armar`, `vivasV` y `firmaV`). La prueba compara los dos. */
export const PRIVATIZAR_VARIABLE_JS = [
  "function pvV(d){return Array.isArray(d.variaciones)?d.variaciones:[]}",
  "function bdV(v){return Array.isArray(v.warehouse_product_variation)?v.warehouse_product_variation:[]}",
  "function idBd(w){return Number(w.warehouse_id!=null?w.warehouse_id:(w.warehouse&&w.warehouse.id))}",
  "function vlV(v){return(Array.isArray(v.attribute_values)?v.attribute_values:[]).filter(function(a){return!a.deleted_at})}",
  "function deFirma(l,f){return l.filter(function(v){return firmaV(v)===f})[0]}",
  "function unidadesP(d){var u={};pvV(d).forEach(function(x){u[d.bodega+'|'+x.firma]=x.unidades});return u}",
  "function errorVar(o,bp,d){",
  "if(o.privated_product===true)return'Ese producto ya es privado: se privatiza el público.';",
  "if(!bp.some(function(b){return Number(b.id)===d.bodega}))return'Esa bodega no es de ECOMFIVE: solo se privatiza stock de las bodegas propias.';",
  "var vv=vivasV(o),l=pvV(d);for(var i=0;i<l.length;i++){var x=l[i],v=deFirma(vv,x.firma);if(!v)return'El público ya no tiene la variación '+x.etiqueta+'.';if(d.salida)continue;",
  "var hay=bdV(v).filter(function(w){return idBd(w)===d.bodega}).reduce(function(t,w){return t+Number(w.stock!=null?w.stock:0)},0);",
  "if(hay<x.unidades)return'De '+x.etiqueta+' el público solo tiene '+hay.toLocaleString('es-PA')+' unidades en esa bodega de Dropi y se piden '+x.unidades.toLocaleString('es-PA')+'.'}",
  "return null}",
  "function privadoV(o,bp,d){var e=errorVar(o,bp,d);if(e)return{error:e};",
  "var r=armar(o,bp,{nombre:d.nombre,nombreGuia:null,precio:d.precio,precioSugerido:d.precio,variable:true});if(r.error)return r;",
  "var vv=vivasV(o),el=pvV(d).map(function(x){return{x:x,v:deFirma(vv,x.firma)}}),us={};el.forEach(function(p){vlV(p.v).forEach(function(a){us[String(a.value)]=1})});",
  "var at=r.cuerpo.attribute.filter(function(a){return!a.deleted_at}).map(function(a){return Object.assign({},a,{id:null,product_id:null,values:a.values.filter(function(x){return!x.deleted_at&&us[String(x.value)]}).map(function(x){return Object.assign({},x,{id:null,attribute_id:null})})})});",
  "var va=el.map(function(p){return Object.assign({},r.cuerpo.variations.filter(function(y){return y.id===p.v.id})[0],{id:null,product_id:null,sale_price:d.precio,suggested_price:d.precio,stock:p.x.unidades,attribute_values:vlV(p.v).map(function(a){return{id:null,value:a.value!=null?a.value:'',attribute_id:null,attribute_name:a.attribute_name!=null?a.attribute_name:'',deleted_at:null}})})});",
  "var wh=el.map(function(p){var f=bdV(p.v).filter(function(y){return idBd(y)===d.bodega})[0],w=(f&&f.warehouse)||bp.filter(function(b){return Number(b.id)===d.bodega})[0]||{};return[{warehouse_id:d.bodega,fullName:(w.name!=null?w.name:'')+'('+(w.address!=null?w.address:'')+')',stock:p.x.unidades}]});",
  "return{cuerpo:Object.assign({},r.cuerpo,{id:null,privated_product:true,private_product_inventories:[],user_profit_percentage_product:[],attribute:at,variations:va,warehouselected:wh})}}",
  "function porReservar(n,uid,d){var vv=vivasV(n),hc=(Array.isArray(n.private_product_inventories)?n.private_product_inventories:[]).filter(function(x){return!x.deleted_at&&Number(x.user_id)===uid});",
  "return pvV(d).map(function(x){return{x:x,v:deFirma(vv,x.firma)}}).filter(function(p){return!p.v||!hc.some(function(h){return Number(h.variation_id)===Number(p.v.id)})})}",
  "function yaReservado(n,uid,d){return porReservar(n,uid,d).length===0}",
  "function asignacionV(n,bp,u,d){var r=armar(n,bp,{nombre:null,nombreGuia:null,variable:true});if(r.error)return r;",
  "var pv=(Array.isArray(n.private_product_inventories)?n.private_product_inventories:[]).map(function(x){return reserva(x)}),fl=porReservar(n,Number(u.id),d);",
  "var sp=fl.filter(function(p){return!p.v})[0];if(sp)return{error:'El producto privado no tiene la variación '+sp.x.etiqueta+'.'};",
  "var nv=fl.map(function(p){return reserva({id:null,product_id:n.id,variation_id:p.v.id,user_id:u.id,user:u,stock:p.x.unidades,last_quantity_separed:null,email:d.correo},{change:true})});",
  "return{cuerpo:Object.assign({},r.cuerpo,{private_product_inventories:pv.concat(nv)})}}",
  "function salidaV(o,bp,d,en,id){var r=armar(o,bp,{nombre:null,nombreGuia:null,variable:true});if(r.error)return r;",
  "var vv=vivasV(o),mv=0,co=false;var wh=en.map(function(a,i){var f=pvV(d).filter(function(x){return x.firma===firmaV(vv[i])})[0],q=f?f.unidades:0;",
  "return a.map(function(e){if(!q||Number(e.warehouse_id)!==d.bodega)return e;if(Number(e.stock)<q)co=true;mv++;return Object.assign({},e,{quantity:q,type_movement:'SALIDA',concept:'Privatizado en el ID '+id})})});",
  "if(co)return{error:'El público ya no tiene esas unidades en esa bodega.'};",
  "if(mv!==pvV(d).length)return{error:'Una variación del público no tiene esa bodega.'};",
  "return{cuerpo:Object.assign({},r.cuerpo,{warehouselected:wh})}}",
].join("");
