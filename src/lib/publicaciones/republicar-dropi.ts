// «Republicar» una publicación en Dropi (pedido de Hernán, 23 oct 2026; migración 0145): crear en Dropi un producto nuevo igual al
// viejo (datos, fotos y stock), sacarle el stock al viejo y archivarlo. Lo hace el favorito «Aplicar en Dropi» desde la pestaña de
// Dropi (marcador-aplicar-dropi.ts), con lo mismo que hace la pantalla de Dropi (leído de su código el 23 oct 2026):
// - Crear: `POST api/products` con el mismo cuerpo del guardado (`armarGuardadoProducto`) y `id: null`; responde `objects.id`.
//   Cada bodega de `warehouselected` lleva su `stock` inicial.
// - Fotos: una por una, `POST api/products/photos/upload` (FormData: `files`, `id`, `main`); se bajan del CDN de Dropi con la ruta
//   `urlS3` de la galería del producto viejo.
// - Stock: un `PUT api/products/<id>` donde la bodega lleva `quantity`, `type_movement` («ENTRADA» o «SALIDA») y `concept`.
// - Archivar: `POST api/products/<id>/archiveProduct`.
// Sin base ni red, con prueba (que también compara la versión en JavaScript del favorito).

import { armarGuardadoProducto } from "./dropi-guardado";

type Obj = Record<string, unknown>;

/** El CDN de las fotos de Dropi (`AWS3.cloudfront_server` de su código): la foto está en `<CDN>/<urlS3>`. */
export const CDN_FOTOS_DROPI = "https://d39ru7awumhhs2.cloudfront.net";

/**
 * Cada país de Dropi tiene su propio CDN de fotos (28 oct 2026: las de Costa Rica, «costarica/products/…», dan 403 en el de Panamá y
 * están en `d3sk39qh2f4j46`). Se elige por la carpeta del país con que empieza la ruta; sin carpeta conocida, el de Panamá.
 */
export const CDN_FOTOS_PAIS: Record<string, string> = { "costarica/": "https://d3sk39qh2f4j46.cloudfront.net" };
export const cdnDeRuta = (ruta: string) => Object.entries(CDN_FOTOS_PAIS).find(([carpeta]) => ruta.startsWith(carpeta))?.[1] ?? CDN_FOTOS_DROPI;

/**
 * El cuerpo del `POST api/products` que crea el producto nuevo: el del guardado del viejo tal cual, sin ID, sin reservas a privados
 * y con el stock que tiene hoy en cada bodega. Error si no se puede republicar: con variaciones, con stock en una bodega que no es
 * del proveedor (la B280 de Dropi), con unidades privatizadas o con porcentajes por dropshipper (no se copian bien: a mano).
 */
export function armarProductoNuevo(
  producto: Obj,
  bodegasProveedor: Obj[],
  /** El precio (y el sugerido) del producto nuevo, si se eligió al republicar (27 oct 2026: el 11446 salió con el precio viejo). Sin él, el del viejo. */
  precios?: { precio?: number | null; precioSugerido?: number | null },
): { cuerpo: Obj } | { error: string } {
  const r = armarGuardadoProducto(producto, bodegasProveedor, { nombre: null, nombreGuia: null, precio: precios?.precio ?? null, precioSugerido: precios?.precioSugerido ?? null });
  if ("error" in r) return r;
  const propias = new Set(bodegasProveedor.map((b) => Number(b.id)));
  const bodegas = Array.isArray(producto.warehouse_product) ? (producto.warehouse_product as Obj[]) : [];
  if (bodegas.some((w) => Number(w.stock) > 0 && !propias.has(Number(w.warehouse_id)))) return { error: "Tiene stock en una bodega que no es de ECOMFIVE (la B280 de Dropi): no se republica." };
  const privados = Array.isArray(producto.private_product_inventories) ? (producto.private_product_inventories as Obj[]) : [];
  if (privados.some((p) => !p.deleted_at && Number(p.stock) > 0)) return { error: "Tiene unidades privatizadas: quítalas en Dropi antes de republicar." };
  if (Array.isArray(producto.user_profit_percentage_product) && producto.user_profit_percentage_product.length) return { error: "Tiene porcentajes por dropshipper: republícala a mano en Dropi." };
  const cuerpo: Obj = { ...r.cuerpo, id: null, private_product_inventories: [] };
  cuerpo.warehouselected = (r.cuerpo.warehouselected as Obj[]).map((b) => ({ ...b, stock: Number(b.stock ?? 0) }));
  return { cuerpo };
}

/**
 * El `PUT api/products/<id>` que mueve stock, como el «Stock» de la pantalla de Dropi: `movimientos` = unidades por bodega
 * (positivas = entrada, negativas = salida) y `concepto` = el motivo que pide Dropi. Lo demás va igual que el guardado.
 */
export function armarMovimientoStock(producto: Obj, bodegasProveedor: Obj[], movimientos: Record<string, number>, concepto: string): { cuerpo: Obj } | { error: string } {
  const r = armarGuardadoProducto(producto, bodegasProveedor, { nombre: null, nombreGuia: null });
  if ("error" in r) return r;
  let movidas = 0;
  const cuerpo: Obj = { ...r.cuerpo };
  cuerpo.warehouselected = (r.cuerpo.warehouselected as Obj[]).map((b) => {
    const q = Number(movimientos[String(b.warehouse_id)] ?? 0);
    if (!q) return b;
    movidas++;
    return { ...b, quantity: Math.abs(q), type_movement: q > 0 ? "ENTRADA" : "SALIDA", concept: concepto };
  });
  if (!movidas) return { error: "Esa bodega no está en el producto." };
  return { cuerpo };
}

/** El stock de cada bodega con unidades (`{ "81": 224 }`). */
export function stockPorBodega(producto: Obj): Record<string, number> {
  const s: Record<string, number> = {};
  for (const w of Array.isArray(producto.warehouse_product) ? (producto.warehouse_product as Obj[]) : []) if (Number(w.stock) > 0) s[String(w.warehouse_id)] = Number(w.stock);
  return s;
}

/** Las fotos del producto que se copian, la principal primero, con su dirección en el CDN (o la `url` completa si no tiene `urlS3`). */
/** La carpeta de las fotos de cada país en el CDN de Dropi, por si ninguna foto del producto la dice (25 oct 2026, el 10474). */
export const CARPETA_FOTOS_PAIS: Record<string, string> = { pa: "panama/products/", cr: "costarica/products/" };

/**
 * Qué foto es, sin importar cuántas veces Dropi le antepuso su número de subida («1779932274» + nombre: una republicación o un reintento
 * sube la misma foto y Dropi le pone otro número delante), el formato ni los espacios: así la misma foto subida varias veces se reconoce
 * como una sola (28 oct 2026, PUB-0446: 17 «Principal» iguales). `CLAVE_FOTO_JS` es lo mismo para el favorito; la prueba compara los dos.
 */
export function claveFoto(nombre: string): string {
  const s = String(nombre);
  const a = s.replace(/\.[a-z0-9]{2,5}$/i, "").toLowerCase();
  const b = a.replace(/^(?:1\d{9})+/, "");
  return (b || a).replace(/[^a-z0-9]+/g, "") || s.toLowerCase();
}

/** El nombre con el que se sube una foto: sin los números de subida de Dropi, para que no se acumulen en cada republicación. */
export function nombreSinPrefijo(nombre: string): string {
  const s = String(nombre);
  return s.replace(/^(?:1\d{9})+/, "") || s;
}

export const CLAVE_FOTO_JS = [
  "function ck(s){s=String(s);var a=s.replace(/\\.[a-z0-9]{2,5}$/i,'').toLowerCase(),b=a.replace(/^(?:1\\d{9})+/,'');return (b||a).replace(/[^a-z0-9]+/g,'')||s.toLowerCase()}",
  "function nl(s){s=String(s);return s.replace(/^(?:1\\d{9})+/,'')||s}",
].join("");

export function fotosParaCopiar(producto: Obj, pais?: string): { url: string; nombre: string; main: boolean; alternas: string[] }[] {
  const galeria = Array.isArray(producto.gallery) ? (producto.gallery as Obj[]) : [];
  // La carpeta de las fotos del país en el CDN («panama/products/»), sacada de una foto que sí tiene `urlS3`.
  const carpeta = galeria.map((f) => /^(.*?products\/)\d+\//.exec(String(f.urlS3 ?? "").trim())?.[1]).find(Boolean) ?? (pais ? (CARPETA_FOTOS_PAIS[pais] ?? null) : null);
  return galeria
    .filter((f) => !f.variation_id)
    .map((f) => {
      const s3 = String(f.urlS3 ?? "").trim();
      const u = String(f.url ?? "").trim();
      const url = s3 ? `${cdnDeRuta(s3)}/${encodeURI(s3)}` : /^https?:\/\//i.test(u) ? u : "";
      const nombre = (s3 || u).split("/").pop() || "foto.jpg";
      // Sin `urlS3`, la dirección de Dropi puede no dejarse bajar desde su pantalla (25 oct 2026: una foto del 10474 dio «Failed
      // to fetch»): se prueba también la misma ruta en el CDN y la carpeta del producto en el CDN.
      const alternas: string[] = [];
      if (!s3 && url) {
        const ruta = /^https?:\/\/[^/]+\/(.+)$/i.exec(u)?.[1] ?? "";
        if (/products\//.test(ruta)) alternas.push(`${cdnDeRuta(ruta)}/${ruta}`);
        if (carpeta) alternas.push(`${cdnDeRuta(carpeta)}/${carpeta}${producto.id}/${encodeURI(nombre)}`);
      }
      return { url, nombre, main: f.main === true, alternas: alternas.filter((a, i) => a !== url && alternas.indexOf(a) === i) };
    })
    .filter((f) => f.url)
    .sort((a, b) => Number(b.main) - Number(a.main));
}

/** Lo mismo en JavaScript simple para el favorito (va después de `ARMAR_JS`, que define `armar`). La prueba compara los dos. */
export const REPUBLICAR_JS = [
  "var CDN=" + JSON.stringify(CDN_FOTOS_DROPI) + ";",
  // El CDN de cada país (`cdnDeRuta`): Costa Rica tiene el suyo.
  "var CDNP=" + JSON.stringify(CDN_FOTOS_PAIS) + ";function cdnR(r){for(var k in CDNP)if(String(r).indexOf(k)===0)return CDNP[k];return CDN}",
  "function nuevo(o,bp,p){var r=armar(o,bp,{nombre:null,nombreGuia:null,precio:p&&p.precio!=null?p.precio:null,precioSugerido:p&&p.precioSugerido!=null?p.precioSugerido:null});if(r.error)return r;",
  "var pr={};bp.forEach(function(p){pr[Number(p.id)]=1});",
  "var wp=Array.isArray(o.warehouse_product)?o.warehouse_product:[];",
  "if(wp.some(function(w){return Number(w.stock)>0&&!pr[Number(w.warehouse_id)]}))return{error:'Tiene stock en una bodega que no es de ECOMFIVE (la B280 de Dropi): no se republica.'};",
  "var pi=Array.isArray(o.private_product_inventories)?o.private_product_inventories:[];",
  "if(pi.some(function(p){return!p.deleted_at&&Number(p.stock)>0}))return{error:'Tiene unidades privatizadas: quítalas en Dropi antes de republicar.'};",
  "if(Array.isArray(o.user_profit_percentage_product)&&o.user_profit_percentage_product.length)return{error:'Tiene porcentajes por dropshipper: republícala a mano en Dropi.'};",
  "var c=Object.assign({},r.cuerpo,{id:null,private_product_inventories:[]});",
  "c.warehouselected=r.cuerpo.warehouselected.map(function(b){return Object.assign({},b,{stock:Number(b.stock!=null?b.stock:0)})});",
  "return{cuerpo:c}}",
  "function mover(o,bp,m,k){var r=armar(o,bp,{nombre:null,nombreGuia:null});if(r.error)return r;var n=0,c=Object.assign({},r.cuerpo);",
  "c.warehouselected=r.cuerpo.warehouselected.map(function(b){var q=Number(m[String(b.warehouse_id)]||0);if(!q)return b;n++;",
  "return Object.assign({},b,{quantity:Math.abs(q),type_movement:q>0?'ENTRADA':'SALIDA',concept:k})});",
  "if(!n)return{error:'Esa bodega no está en el producto.'};return{cuerpo:c}}",
  "function stockDe(o){var s={};(Array.isArray(o.warehouse_product)?o.warehouse_product:[]).forEach(function(w){if(Number(w.stock)>0)s[String(w.warehouse_id)]=Number(w.stock)});return s}",
  "var CARPETAS=" + JSON.stringify(CARPETA_FOTOS_PAIS) + ";",
  "function fotosDe(o){var g=Array.isArray(o.gallery)?o.gallery:[],ca=null;g.forEach(function(f){var m=/^(.*?products\\/)\\d+\\//.exec(String(f.urlS3!=null?f.urlS3:'').trim());if(!ca&&m&&m[1])ca=m[1]});",
  "if(!ca&&typeof P==='string'&&CARPETAS[P])ca=CARPETAS[P];",
  "return g.filter(function(f){return!f.variation_id}).map(function(f){",
  "var s=String(f.urlS3!=null?f.urlS3:'').trim(),u=String(f.url!=null?f.url:'').trim(),url=s?cdnR(s)+'/'+encodeURI(s):(/^https?:\\/\\//i.test(u)?u:''),nombre=(s||u).split('/').pop()||'foto.jpg',al=[];",
  "if(!s&&url){var m=/^https?:\\/\\/[^/]+\\/(.+)$/i.exec(u),ru=m?m[1]:'';if(/products\\//.test(ru))al.push(cdnR(ru)+'/'+ru);if(ca)al.push(cdnR(ca)+'/'+ca+o.id+'/'+encodeURI(nombre))}",
  "return{url:url,nombre:nombre,main:f.main===true,alternas:al.filter(function(a,i){return a!==url&&al.indexOf(a)===i})}",
  "}).filter(function(f){return f.url}).sort(function(a,b){return Number(b.main)-Number(a.main)})}",
].join("");
