/**
 * El favorito «Aplicar precios» (10 nov 2026, pedido de Hernán: que las personas de Gestión de IDs cambien los precios de Drop y de Dunamixfy desde el
 * sistema, como en Dropi). Ninguna de las dos tiene una API para el servidor: los cambios se hacen desde su pestaña, con la sesión del proveedor, que nunca
 * sale de ella (igual que «Aplicar en Dropi», `marcador-aplicar-dropi.ts`). Es un solo favorito para las dos: se pulsa en la pestaña de Drop
 * (app.soydrop.com) o en la de Dunamixfy (dunamixfy.cr) y aplica los cambios de esa plataforma.
 *
 * Abre `/publicaciones-<plataforma>/aplicar-precios` en una ventana. Cuando la ventana avisa que está lista (`listo`), en Drop el favorito lee los precios de
 * todos nuestros productos (`precios`: sin comisión, con comisión y sugerido) y se los pasa; la ventana los guarda y le manda los cambios pendientes
 * (`pendientes`). El favorito aplica cada uno, lo vuelve a leer para confirmar y le devuelve los resultados a la ventana, que los guarda. Solo acepta mensajes
 * de la plataforma (su origen y su ventana).
 *
 * - Drop: `PATCH api.soydrop.com/products/:id` con el producto entero, como «Guardar cambios» de su pantalla (`ARMAR_DROP_JS`). Por ahora solo productos sin
 *   variantes, en la bodega de Boxful y sin dropshippers exclusivos: con algo de eso, Drop guarda más datos y se cambia allá a mano.
 * - Dunamixfy: `PUT /api/inventory/:id` del inventario de nuestra bodega (el mismo que lee el sistema, `INVENTARIO_DUNAMIXFY_JS`) con solo el precio y el
 *   sugerido, como su pantalla.
 */

/** Drop: el guardado y la comprobación, en JavaScript simple para el favorito (lo prueba `marcador-aplicar-precios.test.ts`). */
export const ARMAR_DROP_JS = [
  "function num(v){var n=Number(v);return v==null||v===''||!isFinite(n)?null:n}",
  "function armarDrop(p,c){",
  "if((Array.isArray(p.variants)&&p.variants.length)||Number(p.variantsCount)>0)return{error:'Tiene variantes en Drop: cambia su precio allá.'};",
  "if(p.warehouse&&p.warehouse!=='BOXFUL')return{error:'No está en la bodega de Boxful: cambia su precio en Drop.'};",
  "if(Array.isArray(p.exclusiveSellerIds)&&p.exclusiveSellerIds.length)return{error:'Es exclusivo de un dropshipper en Drop: cambia su precio allá.'};",
  "var precio=c.precio!=null?c.precio:num(p.dropPrice!=null?p.dropPrice:p.price);",
  "if(!(precio>0))return{error:'Drop no tiene el precio actual del producto.'};",
  "var sug=c.sugerido!=null?c.sugerido:(p.suggestedPriceByVendor?num(p.suggestedPrice):null);",
  "var b={name:String(p.name||'').trim(),categoryId:p.categoryId,description:String(p.description||'').trim(),quantity:0,vendorId:p.vendorId,active:!!p.active,serviceFee:p.serviceFee!=null?p.serviceFee:0,variants:[],price:precio,exclusiveSellerIds:[]};",
  "if(sug!=null&&sug>0)b.suggestedPrice=sug;",
  "if(p.warehouse)b.warehouse=p.warehouse;",
  "return{cuerpo:b}}",
  "function comprobarDrop(p,n,c){",
  "var dp=num(n.dropPrice!=null?n.dropPrice:n.price);",
  "if(c.precio!=null&&(dp==null||Math.abs(dp-c.precio)>0.005))return{ok:false,error:'Drop sigue mostrando el precio '+dp+'.'};",
  "if(c.sugerido!=null&&Math.abs((num(n.suggestedPrice)||0)-c.sugerido)>0.005)return{ok:false,error:'Drop sigue mostrando el sugerido '+n.suggestedPrice+'.'};",
  "var av=[];",
  "if(num(n.quantity)!==num(p.quantity))av.push('el inventario pasó de '+p.quantity+' a '+n.quantity);",
  "if(!!n.active!==!!p.active)av.push('cambió si está activo');",
  "if(String(n.name)!==String(p.name))av.push('cambió el nombre');",
  "return{ok:true,precio:num(n.price),precioProveedor:dp,sugerido:num(n.suggestedPrice),aviso:av.length?'Revisa en Drop: '+av.join(', ')+'.':undefined}}",
].join("");

/** Dunamixfy: el inventario de nuestra bodega (el mismo que toma la lectura, `src/lib/dunamixfy/lectura.ts`) y la comprobación. */
export const INVENTARIO_DUNAMIXFY_JS = [
  "function inventarioDmx(p){var a=(Array.isArray(p.inventories)?p.inventories:[]).filter(function(i){return i.isActive!==false&&!i.deletedAt&&!i.privateUserId});",
  "return a.find(function(i){return i.warehouse&&i.warehouse.isPrincipal})||a[0]||null}",
  "function cuerpoDmx(c){var b={};if(c.precio!=null)b.price=c.precio;if(c.sugerido!=null)b.suggestedPrice=c.sugerido;return b}",
  "function comprobarDmx(i,n,c){",
  "if(!n)return{ok:false,error:'Dunamixfy guardó, pero no se encontró el inventario al volver a leerlo.'};",
  "if(c.precio!=null&&Math.abs(Number(n.price)-c.precio)>0.005)return{ok:false,error:'Dunamixfy sigue mostrando el precio '+n.price+'.'};",
  "if(c.sugerido!=null&&Math.abs(Number(n.suggestedPrice)-c.sugerido)>0.005)return{ok:false,error:'Dunamixfy sigue mostrando el sugerido '+n.suggestedPrice+'.'};",
  "var av=[];if(Number(n.stock)!==Number(i.stock))av.push('el stock pasó de '+i.stock+' a '+n.stock);if(Number(n.cost)!==Number(i.cost))av.push('cambió el costo');if(n.isActive!==i.isActive)av.push('cambió si está activo');",
  "return{ok:true,precio:Number(n.price),sugerido:Number(n.suggestedPrice)||null,aviso:av.length?'Revisa en Dunamixfy: '+av.join(', ')+'.':undefined}}",
].join("");

const CODIGO = [
  "(async function(){",
  "var O=__ORIGEN__,H=location.hostname,PL=H==='app.soydrop.com'?'drop':H==='dunamixfy.cr'?'dunamixfy':null;",
  "if(!PL){alert('Pulsa «Aplicar precios» con Drop (app.soydrop.com) o Dunamixfy (dunamixfy.cr) abierto.');return}",
  ARMAR_DROP_JS,
  INVENTARIO_DUNAMIXFY_JS,
  "function motivo(x){var m=x&&x.j&&(x.j.message||x.j.error);if(Array.isArray(m))m=m.join('; ');return 'Respondió '+(x?x.s:'sin respuesta')+(m?': '+String(m).slice(0,200):'')+'.'}",
  "async function resp(r){var j=null;try{j=await r.json()}catch(z){}return{ok:r.ok,s:r.status,j:j}}",
  "var pedir,VID=null;",
  // Drop: el token de la sesión de su página (no sale de esta pestaña) para su API.
  "if(PL==='drop'){var s=null;try{s=await(await fetch('/api/auth/session',{credentials:'include'})).json()}catch(z){}",
  "var T=s&&s.user&&s.user.token;VID=s&&s.user&&s.user.profile&&s.user.profile.vendorId;",
  "if(!T||!VID){alert('Entra a Drop con la cuenta de proveedor de Costa Rica y vuelve a pulsar «Aplicar precios».');return}",
  "pedir=async function(ruta,metodo,cuerpo){var h={Authorization:'Bearer '+T};if(cuerpo)h['Content-Type']='application/json';return resp(await fetch('https://api.soydrop.com'+ruta,{method:metodo||'GET',headers:h,body:cuerpo?JSON.stringify(cuerpo):undefined}))}}",
  // Dunamixfy: su API interna, con la cookie de la página.
  "else{pedir=async function(ruta,metodo,cuerpo){var h={accept:'application/json'};if(cuerpo)h['Content-Type']='application/json';return resp(await fetch(ruta,{method:metodo||'GET',credentials:'include',headers:h,body:cuerpo?JSON.stringify(cuerpo):undefined}))};",
  "var yo=await pedir('/api/me');if(!yo.ok||!yo.j||!yo.j.user||yo.j.user.role!=='SUPPLIER'){alert('Entra a Dunamixfy con la cuenta de proveedor de Costa Rica y vuelve a pulsar «Aplicar precios».');return}}",
  "async function leerPreciosDrop(){var L=[],pg=1,total=1e9;while(L.length<total&&pg<=40){var x=await pedir('/products?vendorId='+encodeURIComponent(VID)+'&page='+pg+'&limit=50');var P=x.ok&&x.j&&x.j.products;var l=P&&Array.isArray(P.products)?P.products:[];if(!l.length)break;total=Number(P.total)||0;l.forEach(function(p){L.push({id:p.id,precio:num(p.price),precioProveedor:num(p.dropPrice!=null?p.dropPrice:p.price),sugerido:num(p.suggestedPrice),variantes:(Array.isArray(p.variants)&&p.variants.length>0)||Number(p.variantsCount)>0})});pg++}return L}",
  "async function aplicarDrop(c){",
  "var a=await pedir('/products/'+c.externo);var p=a.j&&(a.j.product||a.j);if(!a.ok||!p)return{ok:false,error:'No se pudo leer el producto en Drop. '+motivo(a)};",
  "if(p.vendorId!==VID)return{ok:false,error:'Ese producto no es de esta cuenta de Drop.'};",
  "var b=armarDrop(p,c);if(b.error)return{ok:false,error:b.error};",
  "var g=await pedir('/products/'+c.externo,'PATCH',b.cuerpo);if(!g.ok)return{ok:false,error:'Drop no guardó el cambio. '+motivo(g)};",
  "var a2=await pedir('/products/'+c.externo);var n=a2.j&&(a2.j.product||a2.j);if(!a2.ok||!n)return{ok:false,error:'Drop guardó, pero no se pudo volver a leer el producto para confirmarlo.'};",
  "return comprobarDrop(p,n,c)}",
  "async function aplicarDmx(c){",
  "var a=await pedir('/api/products/'+encodeURIComponent(c.externo));var p=a.j&&(a.j.product||a.j);if(!a.ok||!p)return{ok:false,error:'No se pudo leer el producto en Dunamixfy. '+motivo(a)};",
  "var i=inventarioDmx(p);if(!i)return{ok:false,error:'El producto no tiene un inventario activo de nuestra bodega en Dunamixfy.'};",
  "var g=await pedir('/api/inventory/'+encodeURIComponent(i.id),'PUT',cuerpoDmx(c));if(!g.ok)return{ok:false,error:'Dunamixfy no guardó el cambio. '+motivo(g)};",
  "var a2=await pedir('/api/products/'+encodeURIComponent(c.externo));var p2=a2.j&&(a2.j.product||a2.j);var n=p2&&Array.isArray(p2.inventories)?p2.inventories.find(function(x){return x.id===i.id}):null;",
  "return comprobarDmx(i,n,c)}",
  "var W=window.open(O+'/publicaciones-'+PL+'/aplicar-precios?v='+__VERSION__,'aplicar-precios','width=560,height=760');",
  "if(!W){alert('El navegador bloqueó la ventana: permite las ventanas emergentes de esta página y vuelve a pulsar.');return}",
  "window.addEventListener('message',async function f(e){",
  "if(e.origin!==O||e.source!==W||!e.data)return;",
  "if(e.data.tipo==='listo'){var L=[];if(PL==='drop'){try{L=await leerPreciosDrop()}catch(z){}}W.postMessage({tipo:'precios',productos:L},O);return}",
  "if(e.data.tipo!=='pendientes')return;window.removeEventListener('message',f);",
  "var C=(Array.isArray(e.data.cambios)?e.data.cambios:[]).slice(0,100),R=[];",
  "for(var k=0;k<C.length;k++){var c=C[k],x;try{x=PL==='drop'?await aplicarDrop(c):await aplicarDmx(c)}catch(z){x={ok:false,error:String(z&&z.message||z)}}x.id=c.id;R.push(x);W.postMessage({tipo:'progreso',hechos:k+1,total:C.length},O)}",
  "W.postMessage({tipo:'resultados',resultados:R},O)});",
  "})();",
].join("");

/** La versión del favorito: sale del propio código (FNV-1a de 32 bits), así cambia sola cuando cambia el favorito; la ventana avisa si es vieja. */
export const VERSION_FAVORITO_PRECIOS = (() => {
  let h = 0x811c9dc5;
  for (let i = 0; i < CODIGO.length; i++) h = Math.imul(h ^ CODIGO.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 6);
})();

/** El favorito para la plataforma en ese origen (`https://…`, o `http://localhost` para probar), con el prefijo `javascript:`. */
export function marcadorAplicarPrecios(origen: string): string {
  const o = new URL(origen);
  if (o.protocol !== "https:" && !(o.protocol === "http:" && (o.hostname === "localhost" || o.hostname === "127.0.0.1"))) throw new Error("El origen del favorito debe ser https.");
  return `javascript:${encodeURIComponent(CODIGO.replace("__ORIGEN__", JSON.stringify(o.origin)).replace("__VERSION__", JSON.stringify(VERSION_FAVORITO_PRECIOS)))}`;
}

export type PlataformaPrecios = "drop" | "dunamixfy";

/** El único origen al que le habla la ventana de cada plataforma: su pestaña. */
export const ORIGEN_PLATAFORMA: Record<PlataformaPrecios, string> = { drop: "https://app.soydrop.com", dunamixfy: "https://dunamixfy.cr" };

/** El código completo, para la prueba (que sea JavaScript válido). */
export const CODIGO_APLICAR_PRECIOS = CODIGO;
