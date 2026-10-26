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

/**
 * El guardado que apaga un producto: saca el stock de cada bodega de ECOMFIVE (concepto «stock») y, con `quitarPrivados`, deja sin
 * reservas a privados (como borrar los correos en «Productos privados»). `cuerpo` es null si no hay nada que guardar (ya está en
 * cero y sin privatizaciones). Error si tiene variaciones o stock en una bodega que no es del proveedor (la B280 de Dropi).
 */
export function armarApagado(producto: Obj, bodegasProveedor: Obj[], quitarPrivados: boolean): { cuerpo: Obj | null; unidades: number; privadas: number } | { error: string } {
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

/** Lo mismo en JavaScript simple para el favorito (va después de `REPUBLICAR_JS`, que define `mover` y `stockDe`, y de `PRIVATIZAR_JS`, que define `reservasQuitadas`). La prueba compara los dos. */
export const APAGAR_JS = [
  "function apagado(o,bp,q){",
  "var pr={};bp.forEach(function(p){pr[Number(p.id)]=1});",
  "var wp=Array.isArray(o.warehouse_product)?o.warehouse_product:[];",
  "if(wp.some(function(w){return Number(w.stock)>0&&!pr[Number(w.warehouse_id)]}))return{error:'Tiene stock en una bodega que no es de ECOMFIVE (la B280 de Dropi): no se puede apagar desde aquí.'};",
  "var st=stockDe(o),mv={},un=0,k;for(k in st){mv[k]=-st[k];un+=st[k]}",
  "var pi=(Array.isArray(o.private_product_inventories)?o.private_product_inventories:[]).filter(function(p){return!p.deleted_at}).length;",
  "var qt=q&&pi>0;if(!un&&!qt)return{cuerpo:null,unidades:0,privadas:pi};",
  "var r=un?mover(o,bp,mv," + JSON.stringify(CONCEPTO_APAGAR) + "):armar(o,bp,{nombre:null,nombreGuia:null});if(r.error)return r;",
  "var c=Object.assign({},r.cuerpo);if(qt)c.private_product_inventories=reservasQuitadas(o.private_product_inventories);",
  "return{cuerpo:c,unidades:un,privadas:pi}}",
].join("");
