/**
 * El favorito «Aplicar en Dropi» (22 oct 2026, reemplaza a «Conectar Dropi»): Dropi responde 403 a las llamadas que salen de un
 * servidor (Vercel), así que los cambios se hacen desde la pestaña de Dropi, con su propia sesión, que nunca sale de ella.
 *
 * Se pulsa con Dropi abierto en la cuenta de proveedor de ECOMFIVE: abre `/publicaciones-dropi/aplicar-dropi` en una ventana, que le
 * manda (por `postMessage`) los cambios pendientes; el favorito los aplica uno por uno con el mismo guardado de la pantalla de Dropi
 * (`ARMAR_JS`, igual a `armarGuardadoProducto`: lo comprueba la prueba), vuelve a leer cada producto para confirmar y le devuelve los
 * resultados a la ventana, que los guarda. Solo acepta mensajes de la plataforma (su origen y su ventana). El código va completo en
 * el favorito.
 *
 * Un cambio de tipo «republicar» (23 oct 2026, migración 0145) crea el producto de nuevo (`republicar`, con `REPUBLICAR_JS`): lo
 * crea (salvo que un intento anterior ya lo haya creado: `c.nuevo`), le sube las fotos que le falten, le pone el stock del viejo si
 * Dropi no lo tomó al crearlo, le saca el stock al viejo, lo archiva y comprueba. Devuelve el ID nuevo aunque falle un paso después.
 *
 * Un cambio de tipo «apagar» (23 oct 2026, migración 0148; `apagar`, con `APAGAR_JS`) hace lo que Nicole a mano: saca todo el stock
 * (concepto «stock»), con `quitarPrivados` quita la privatización, comprueba que quedó en cero e intenta archivar. Si Dropi no deja
 * archivar (órdenes pendientes) devuelve `ok: true, archivado: false`: queda pendiente y el próximo «Aplicar en Dropi» solo repite el archivado.
 */

import { APAGAR_JS } from "./apagar-dropi";
import { CREAR_JS } from "./crear-dropi";
import { REPUBLICAR_JS } from "./republicar-dropi";

/** El armado del guardado de Dropi, en JavaScript simple para el favorito (el mismo de `armarGuardadoProducto`). */
export const ARMAR_JS = [
  "function armar(o,bp,c){",
  "if(o.type!=='SIMPLE')return{error:'Tiene variaciones: cámbialo a mano en Dropi.'};",
  "if(c.nombre!==null&&(!c.nombre.trim()||c.nombre.length>40))return{error:'El nombre debe tener de 1 a 40 caracteres.'};",
  "var pr=c.precio==null?null:c.precio,su=c.precioSugerido==null?null:c.precioSugerido;",
  "if((pr!==null&&!(pr>0))||(su!==null&&!(su>0)))return{error:'El precio debe ser mayor que cero.'};",
  "var pf=pr!==null?pr:Number(o.sale_price),sf=su!==null?su:Number(o.suggested_price),sa=null;",
  "if(pr!==null&&su===null&&sf>0&&sf<pf){var an=Number(o.sale_price),pp=an>0?Math.max(1,sf/an):1;sa=Math.round(pf*pp*100)/100;sf=sa}",
  "if((pr!==null||su!==null)&&sf>0&&sf<pf)return{error:'El precio sugerido ($'+sf.toFixed(2)+') quedaría menor que el precio ($'+pf.toFixed(2)+').'};",
  "if(c.nombreGuia!==null&&c.nombreGuia.length>40)return{error:'El nombre de la guía admite 40 caracteres.'};",
  "var ds=c.descripcion==null?null:c.descripcion;",
  "if(ds!==null&&ds.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\\s+/g,' ').trim().length<200)return{error:'La descripción necesita al menos 200 caracteres.'};",
  "function num(v){return v===null||v===undefined||v===''?v:Number(v)}",
  "var b=(Array.isArray(o.warehouse_product)?o.warehouse_product:[]).map(function(w){var x=w.warehouse||{};return{warehouse_id:w.warehouse_id,fullName:(x.name!=null?x.name:'')+'('+(x.address!=null?x.address:'')+')',stock:w.stock,city:x.city,warehouse_white_brand:!!x.warehouse_white_brand}});",
  "bp.forEach(function(p){if(!b.some(function(x){return x.warehouse_id===p.id}))b.push({fullName:p.name+'('+p.address+')',warehouse_id:p.id,warehouse_white_brand:!!p.warehouse_white_brand})});",
  "return{cuerpo:{id:o.id,name:c.nombre!==null?c.nombre:o.name,description:ds!==null?ds:o.description,dropi_app_description:o.dropi_app_description,type:o.type,sale_price:pr!==null?pr:num(o.sale_price),suggested_price:su!==null?su:(sa!==null?sa:num(o.suggested_price)),user_id:o.user_id,privated_product:o.privated_product,active:o.active,sku:o.sku,weight:num(o.weight),length:num(o.length),width:num(o.width),height:num(o.height),attribute:[],variations:o.variations,categories:o.categories,add_stock_in_return:o.add_stock_in_return,private_product_inventories:o.private_product_inventories,user_profit_percentage_product:o.user_profit_percentage_product,is_warehouse_white_brand:o.is_warehouse_white_brand,warehouselected:b,warehouse_previus:null,controlChangesPhotos:[],name_in_guide:c.nombreGuia!==null?c.nombreGuia:(o.name_in_guide!=null?o.name_in_guide:''),shipping_method:o.shipping_method,bar_code:o.bar_code,dropi_product_supplier_increment_fixed:o.dropi_product_supplier_increment_fixed}}",
  "}",
].join("");

const CODIGO = [
  "(function(){",
  "var O=__ORIGEN__;",
  "if(!/^app\\.dropi\\.[a-z]{2}$/.test(location.hostname)){alert('Abre Dropi (app.dropi.pa) con la cuenta de ECOMFIVE y vuelve a pulsar Aplicar en Dropi.');return}",
  "var T=JSON.parse(localStorage.getItem('DROPI_token')||'null'),L=(JSON.parse(localStorage.getItem('DROPI_LoginResult')||'{}')||{}).objects||{};",
  "if(!T||!L.id){alert('No hay una sesión de Dropi en esta pestaña: inicia sesión y vuelve a pulsar.');return}",
  "if(L.type_user!=='SUPPLIER'){alert('Esta sesión no es de proveedor: entra con la cuenta de ECOMFIVE.');return}",
  "var P=location.hostname.split('.').pop(),A='https://'+location.hostname.replace(/^app\\./,'api.')+'/api',H={'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+T,'x-authorization':'Bearer '+T};",
  ARMAR_JS,
  "function pedir(r,m,b){return fetch(A+r,{method:m||'GET',headers:H,body:b?JSON.stringify(b):undefined}).then(function(x){return x.json().catch(function(){return null}).then(function(j){return{ok:x.ok&&!(j&&j.isSuccess===false),s:x.status,j:j}})},function(e){return{ok:false,s:0,j:{message:String(e&&e.message||e)}}})}",
  "function llano(h){return String(h==null?'':h).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\\s+/g,' ').trim()}",
  "function motivo(r){return r.s===401?'La sesión de Dropi venció: inicia sesión de nuevo en Dropi.':'Dropi respondió '+r.s+(r.j&&r.j.message?': '+r.j.message:'')+'.'}",
  // El ID del producto que acaba de crear Dropi: lo busca en las formas en que puede venir la respuesta. Si no está, el error lleva
  // lo que respondió Dropi (código, mensaje y las llaves de la respuesta, sin datos del producto), para saber qué pasó (25 oct 2026:
  // la republicación del 8751 se detuvo sin ID y Dropi no había creado nada).
  "function idCreado(j){var o=j&&j.objects,c=[o&&o.id,o&&o.product&&o.product.id,o&&o.product_id,Array.isArray(o)&&o[0]&&o[0].id,typeof o==='number'?o:null,j&&j.id,j&&j.product&&j.product.id,j&&j.data&&j.data.id];for(var i=0;i<c.length;i++){var n=Number(c[i]);if(n>0&&n<1e8&&Math.floor(n)===n)return n}return 0}",
  "function sinId(g){var j=g.j,m=j&&(j.message||j.msg||j.error);return'Dropi no devolvió el ID del producto nuevo (respondió '+g.s+(m?': '+String(m).slice(0,150):'')+(j&&typeof j==='object'?'; llaves: '+Object.keys(j).slice(0,8).join(', ')+(j.objects&&typeof j.objects==='object'?' / objects: '+Object.keys(j.objects).slice(0,8).join(', '):''):'; sin cuerpo')+'). No se creó nada en el sistema.'}",
  REPUBLICAR_JS,
  APAGAR_JS,
  CREAR_JS,
  // Una foto: se baja del CDN de Dropi y se sube al producto nuevo como lo hace la pantalla de Dropi. Si la subida falla se reintenta
  // una vez con solo «X-Authorization» (la cabecera que manda la pantalla de Dropi) y, si igual falla, `FE` guarda por qué (25 oct
  // 2026: las republicaciones del 8751 y el 10474 crearon el producto nuevo y no pudieron copiar las fotos, sin saber el motivo).
  "var FE='';",
  // Se baja de su dirección y, si falla, de sus `alternas` (la misma foto en el CDN de Dropi).
  // Cada dirección se pide primero directo (sin la caché del navegador). El CDN de Dropi (CloudFront) guarda copias de las fotos sin la
  // cabecera CORS y, según la compresión que pida el navegador, le toca una de esas y no la deja leer (25 oct 2026, el 10474 y luego
  // todas): entonces la foto se le pide a la ventana de la plataforma, que la baja por el servidor con la sesión de la persona.
  "function porVentana(u){return new Promise(function(ok){var k=String(Math.random()).slice(2),t=setTimeout(function(){fin(null,'la plataforma no respondió')},45000);",
  "function fin(b,e){clearTimeout(t);window.removeEventListener('message',oye);if(!b&&e)FE='no se pudo bajar la foto por la plataforma ('+e+')';ok(b)}",
  "function oye(e){if(e.origin!==O||e.source!==W||!e.data||e.data.tipo!=='foto'||e.data.id!==k)return;fin(e.data.blob instanceof Blob?e.data.blob:null,e.data.error||'sin foto')}",
  "window.addEventListener('message',oye);W.postMessage({tipo:'foto',id:k,url:u},O)})}",
  "function bajar(f){var us=[f.url].concat(Array.isArray(f.alternas)?f.alternas:[]),i=0;var otra=function(){if(i>=us.length)return Promise.resolve(null);var u=us[i++];",
  "var cdn=u.indexOf(CDN+'/')===0,porV=function(){return cdn?porVentana(u).then(function(b){return b||otra()}):otra()};",
  "return fetch(u,{cache:'no-store',credentials:'omit'}).then(function(x){if(!x.ok){FE='no se pudo bajar la foto '+f.nombre+' de '+u.split('/')[2]+' (respondió '+x.status+')';return porV()}return x.blob()},function(e){FE='no se pudo bajar la foto '+f.nombre+' de '+u.split('/')[2]+' ('+String(e&&e.message||e)+')';return porV()})};return otra()}",
  "function subir(id,f){return bajar(f).then(function(b){if(!b)return false;",
  "var mandar=function(h){var d=new FormData();d.append('files',new File([b],f.nombre,{type:b.type||'image/jpeg'}));d.append('id',String(id));d.append('main',f.main?'true':'false');",
  "return fetch(A+'/products/photos/upload',{method:'POST',headers:h,body:d}).then(function(x){return x.text().then(function(t){var j=null;try{j=JSON.parse(t)}catch(z){}var ok=x.ok&&!(j&&j.isSuccess===false);",
  "if(!ok)FE='Dropi no aceptó la foto '+f.nombre+' (respondió '+x.status+(j&&(j.message||j.error)?': '+String(j.message||j.error).slice(0,120):t?': '+t.replace(/\\s+/g,' ').slice(0,120):'')+')';return ok})},function(e){FE='no se pudo subir la foto '+f.nombre+' ('+String(e&&e.message||e)+')';return false})};",
  "return mandar({Accept:'application/json',Authorization:'Bearer '+T,'x-authorization':'Bearer '+T}).then(function(ok){return ok||mandar({Accept:'application/json','X-Authorization':'Bearer '+T})})})}",
  "function porque(){return FE?': '+FE:''}",
  "async function republicar(c,bp){",
  "var a=await pedir('/products/'+c.producto);if(!a.ok)return{ok:false,error:motivo(a)};",
  "var o=a.j&&a.j.objects;if(!o||Number(o.id)!==Number(c.producto))return{ok:false,error:'Dropi no devolvió el producto.'};",
  "if(Number(o.user_id)!==Number(L.id))return{ok:false,error:'Ese producto no es de este proveedor en Dropi.'};",
  "var id=Number(c.nuevo)||0,st=stockDe(o),k;",
  "if(!id){var r=nuevo(o,bp);if(r.error)return{ok:false,error:r.error};",
  "var g=await pedir('/products','POST',r.cuerpo);if(!g.ok)return{ok:false,error:motivo(g)};",
  "id=idCreado(g.j);if(!id)return{ok:false,error:sinId(g)}}",
  "var f=function(e){return{ok:false,nuevo:id,error:e}};",
  "var b=await pedir('/products/'+id),n=b.j&&b.j.objects;if(!b.ok||!n)return f('Se creó el '+id+', pero no se pudo leer: '+motivo(b));",
  // Sube las fotos que el nuevo no tiene, comparando por nombre (Dropi le antepone un número): contar cuántas tenía y seguir desde ahí
  // repetía una y dejaba fuera la principal si en un intento anterior subió una del medio (25 oct 2026, el 11309).
  "var fs=fotosDe(o),mal=0;for(var i=0;i<fs.length;i++)if(!tiene(n,fs[i].nombre)&&!(await subir(id,fs[i])))mal++;",
  "if(mal)return f('Se creó el '+id+', pero no se pudieron copiar '+mal+' foto(s)'+porque()+'.');",
  // Las garantías del viejo pasan al nuevo (25 oct 2026: el 11309 quedó sin ellas; en Dropi la casilla de cada garantía se marca solo
  // si el producto la tiene guardada). Solo si el nuevo todavía no tiene ninguna, así un reintento no las repite.
  // Dropi ya no acepta una garantía sin observaciones salvo «Orden diferente»: si la del viejo no tenía, va «Ninguna» (pedido de Alcides).
  "var gv=await pedir('/productwarranty/show','POST',{product_id:Number(c.producto)}),gn=await pedir('/productwarranty/show','POST',{product_id:id});",
  "var lv=gv.ok&&Array.isArray(gv.j&&gv.j.objects)?gv.j.objects:[],ln=gn.ok&&Array.isArray(gn.j&&gn.j.objects)?gn.j.objects:[];",
  "if(lv.length&&!ln.length){var gw=lv.filter(function(w){return w&&w.name}).map(function(w){return{name:w.name,time:w.time||w.type_time||'DIAS',quantity:Number(w.quantity_time!=null?w.quantity_time:w.quantity)||10,description:w.description&&w.description!=='NULL'&&String(w.description).trim()?w.description:(w.name==='Different order'?'':'Ninguna')}});",
  "var gc=await pedir('/productwarranty/create','POST',{id:id,warranties:gw});if(!gc.ok)return f('Se creó el '+id+', pero no se le pudieron poner las garantías: '+motivo(gc))}",
  "var sn=stockDe(n),en={},hay=false;for(k in st)if((sn[k]||0)<st[k]){en[k]=st[k]-(sn[k]||0);hay=true}",
  "if(hay){var me=mover(n,bp,en,'Republicado desde el ID '+c.producto);if(me.error)return f(me.error);",
  "var pe=await pedir('/products/'+id,'PUT',me.cuerpo);if(!pe.ok)return f('Se creó el '+id+', pero no se le pudo poner el stock: '+motivo(pe))}",
  "var sa={},hs=false;for(k in st){sa[k]=-st[k];hs=true}",
  "if(hs){var ms=mover(o,bp,sa,'Republicado como ID '+id);if(ms.error)return f(ms.error);",
  "var ps=await pedir('/products/'+c.producto,'PUT',ms.cuerpo);if(!ps.ok)return f('Se creó el '+id+', pero no se le pudo sacar el stock al '+c.producto+': '+motivo(ps))}",
  "if(!o.archived){var ar=await pedir('/products/'+c.producto+'/archiveProduct','POST',{});if(!ar.ok)return f('Se creó el '+id+' y el '+c.producto+' quedó sin stock, pero no se pudo archivar: '+motivo(ar))}",
  "var v=await pedir('/products/'+id),w=v.j&&v.j.objects,x=await pedir('/products/'+c.producto),q=x.j&&x.j.objects,tn=0,tv=0,sw=w?stockDe(w):{},sq=q?stockDe(q):{};",
  "for(k in sw)tn+=sw[k];for(k in sq)tv+=sq[k];",
  "if(tv>0)return f('El '+c.producto+' sigue con '+tv+' unidades en Dropi.');",
  "return{ok:true,nuevo:id,stock:tn,fotos:w&&Array.isArray(w.gallery)?w.gallery.length:null}}",
  "async function apagar(c,bp){",
  "var a=await pedir('/products/'+c.producto);if(!a.ok)return{ok:false,error:motivo(a)};",
  "var o=a.j&&a.j.objects;if(!o||Number(o.id)!==Number(c.producto))return{ok:false,error:'Dropi no devolvió el producto.'};",
  "if(Number(o.user_id)!==Number(L.id))return{ok:false,error:'Ese producto no es de este proveedor en Dropi.'};",
  "var p=apagado(o,bp,c.quitarPrivados===true);if(p.error)return{ok:false,error:p.error};",
  "if(p.cuerpo){var g=await pedir('/products/'+c.producto,'PUT',p.cuerpo);if(!g.ok)return{ok:false,error:motivo(g)};",
  "var d=await pedir('/products/'+c.producto),n=d.j&&d.j.objects;if(!d.ok||!n)return{ok:false,error:'Se guardó, pero no se pudo comprobar en Dropi.'};",
  "var sn=stockDe(n),tv=0,k;for(k in sn)tv+=sn[k];if(tv>0)return{ok:false,error:'Dropi sigue mostrando '+tv+' unidades de stock.'};",
  "if(c.quitarPrivados===true&&(Array.isArray(n.private_product_inventories)?n.private_product_inventories:[]).some(function(x){return!x.deleted_at}))return{ok:false,error:'Dropi no quitó la privatización: quítala a mano en «Productos privados».'};",
  "o=n}",
  "if(o.archived)return{ok:true,archivado:true};",
  "var ar=await pedir('/products/'+c.producto+'/archiveProduct','POST',{});",
  "if(!ar.ok)return{ok:true,archivado:false,error:'Sin stock en Dropi, pero no dejó archivarlo: '+motivo(ar)+' Si tiene órdenes pendientes, se reintenta en el próximo Aplicar en Dropi.'};",
  "var v=await pedir('/products/'+c.producto),w=v.j&&v.j.objects;",
  "if(v.ok&&w&&!w.archived)return{ok:true,archivado:false,error:'Se pidió archivarlo, pero Dropi todavía no lo muestra archivado.'};",
  "return{ok:true,archivado:true}}",
  // ¿La galería del producto ya tiene una foto con ese nombre? (Dropi antepone un número al nombre del archivo: se compara el final.)
  "function tiene(n,nom){return fotosDe(n).some(function(g){return g.nombre.slice(-nom.length)===nom})}",
  // Sube a un producto las fotos que le falten; devuelve cuántas no se pudieron subir.
  "async function subirFotos(id,n,fs,principal){var mal=0;for(var i=0;i<fs.length;i++){if(tiene(n,fs[i].nombre))continue;if(!(await subir(id,{url:fs[i].url,nombre:fs[i].nombre,main:principal&&i===0})))mal++}return mal}",
  // Archivar (o sacar de Archivados) un producto en Dropi: `archiveProduct` / `unarchive`, y se vuelve a leer para comprobar.
  "async function archivar(c){",
  "var a=await pedir('/products/'+c.producto);if(!a.ok)return{ok:false,error:motivo(a)};",
  "var o=a.j&&a.j.objects;if(!o||Number(o.id)!==Number(c.producto))return{ok:false,error:'Dropi no devolvió el producto.'};",
  "if(Number(o.user_id)!==Number(L.id))return{ok:false,error:'Ese producto no es de este proveedor en Dropi.'};",
  "var quiere=c.restaurar!==true;if(!!o.archived===quiere)return{ok:true};",
  "var r=await pedir('/products/'+c.producto+(quiere?'/archiveProduct':'/unarchive'),'POST',{});",
  "if(!r.ok)return{ok:false,error:motivo(r)+(quiere?' Si tiene órdenes pendientes, se reintenta en el próximo Aplicar en Dropi.':'')};",
  "var v=await pedir('/products/'+c.producto),w=v.j&&v.j.objects;",
  "if(!v.ok||!w)return{ok:false,error:'Se pidió, pero no se pudo comprobar en Dropi.'};",
  "if(!!w.archived!==quiere)return{ok:false,error:quiere?'Se pidió archivarlo, pero Dropi todavía no lo muestra archivado.':'Se pidió sacarlo de Archivados, pero Dropi todavía lo muestra archivado.'};",
  "return{ok:true}}",
  // Publicar un producto nuevo: crearlo, subirle las fotos, ponerle las garantías y el stock inicial, y comprobar.
  "async function crear(c,bp){",
  "var d=c.datos;if(!d||!Array.isArray(d.fotos)||!Array.isArray(d.bodegas))return{ok:false,error:'El cambio no trae los datos del producto.'};",
  "var id=Number(c.nuevo)||0,recien=false,k;",
  "if(!id){var cs=await pedir('/categories');if(!cs.ok)return{ok:false,error:motivo(cs)};",
  "var ls=cs.j&&(cs.j.objects!==undefined?cs.j.objects:cs.j);if(!Array.isArray(ls))return{ok:false,error:'Dropi no devolvió las categorías.'};",
  "var r=nuevoProducto(d,L.id,bp,ls);if(r.error)return{ok:false,error:r.error};",
  "var g=await pedir('/products','POST',r.cuerpo);if(!g.ok)return{ok:false,error:motivo(g)};",
  "id=idCreado(g.j);if(!id)return{ok:false,error:sinId(g)};recien=true}",
  "var f=function(e){return{ok:false,nuevo:id,error:e}};",
  "var b=await pedir('/products/'+id),n=b.j&&b.j.objects;if(!b.ok||!n)return f('Se creó el '+id+', pero no se pudo leer: '+motivo(b));",
  "var mal=await subirFotos(id,n,d.fotos,true);if(mal)return f('Se creó el '+id+', pero no se pudieron subir '+mal+' foto(s)'+porque()+'.');",
  "var aviso=null;if(recien){var gw=await pedir('/productwarranty/create','POST',{id:id,warranties:GARANTIAS});if(!gw.ok)aviso='Las garantías no se pudieron poner: '+motivo(gw)+' Revísalas en Dropi.'}",
  "var sn=stockDe(n),en={},hay=false;d.bodegas.forEach(function(x){var t=sn[String(x.id)]||0;if(t<x.unidades){en[String(x.id)]=x.unidades-t;hay=true}});",
  "if(hay){var me=mover(n,bp,en,'Stock inicial');if(me.error)return f(me.error);",
  "var pe=await pedir('/products/'+id,'PUT',me.cuerpo);if(!pe.ok)return f('Se creó el '+id+', pero no se le pudo poner el stock: '+motivo(pe))}",
  "var v=await pedir('/products/'+id),w=v.j&&v.j.objects;if(!v.ok||!w)return f('Se creó el '+id+', pero no se pudo comprobar en Dropi.');",
  "var tn=0,sw=stockDe(w);for(k in sw)tn+=sw[k];var nf=fotosDe(w).length;",
  "if(w.name!==d.nombre)return f('Dropi muestra el nombre «'+w.name+'» en el '+id+'.');",
  "if(nf<d.fotos.length)return f('El '+id+' tiene '+nf+' foto(s) en Dropi y se esperaban '+d.fotos.length+'.');",
  "return{ok:true,nuevo:id,stock:tn,fotos:nf,aviso:aviso}}",
  "async function aplicar(c,bp){",
  "if(c.tipo==='apagar')return apagar(c,bp);",
  "if(c.tipo==='republicar')return republicar(c,bp);",
  "if(c.tipo==='archivar')return archivar(c);",
  "if(c.tipo==='crear')return crear(c,bp);",
  "var a=await pedir('/products/'+c.producto);if(!a.ok)return{ok:false,error:motivo(a)};",
  "var o=a.j&&a.j.objects;if(!o||Number(o.id)!==Number(c.producto))return{ok:false,error:'Dropi no devolvió el producto.'};",
  "if(Number(o.user_id)!==Number(L.id))return{ok:false,error:'Ese producto no es de este proveedor en Dropi.'};",
  "var hay=c.nombre!=null||c.guia!=null||c.precio!=null||c.sugerido!=null||c.descripcion!=null;",
  "if(hay){var r=armar(o,bp,{nombre:c.nombre,nombreGuia:c.guia,precio:c.precio,precioSugerido:c.sugerido,descripcion:c.descripcion});if(r.error)return{ok:false,error:r.error};",
  "var g=await pedir('/products/'+c.producto,'PUT',r.cuerpo);if(!g.ok)return{ok:false,error:motivo(g)}}",
  "var d=await pedir('/products/'+c.producto),n=d.j&&d.j.objects;",
  "if(!d.ok||!n)return{ok:false,error:'Se guardó, pero no se pudo comprobar en Dropi.'};",
  "if(c.descripcion!=null&&llano(n.description)!==llano(c.descripcion))return{ok:false,error:'Dropi sigue mostrando otra descripción.'};",
  "if(c.nombre!==null&&n.name!==c.nombre)return{ok:false,error:'Dropi sigue mostrando el nombre «'+n.name+'».'};",
  "if(c.precio!=null&&Math.abs(Number(n.sale_price)-c.precio)>0.005)return{ok:false,error:'Dropi sigue mostrando el precio $'+n.sale_price+'.'};",
  "if(c.sugerido!=null&&Math.abs(Number(n.suggested_price)-c.sugerido)>0.005)return{ok:false,error:'Dropi sigue mostrando el precio sugerido $'+n.suggested_price+'.'};",
  "if(c.guia!==null&&n.name_in_guide!==c.guia)return{ok:false,error:'Dropi sigue mostrando en la guía «'+n.name_in_guide+'».'};",
  "if(Array.isArray(c.fotos)&&c.fotos.length){var mal=await subirFotos(c.producto,n,c.fotos,false);if(mal)return{ok:false,error:'No se pudieron subir '+mal+' foto(s) a Dropi'+porque()+'.'}}",
  "return{ok:true}}",
  "var W=window.open(O+'/publicaciones-dropi/aplicar-dropi?p='+P+'&v='+__VERSION__,'aplicar-dropi','width=560,height=760');",
  "if(!W){alert('El navegador bloqueó la ventana: permite las ventanas emergentes de Dropi y vuelve a pulsar.');return}",
  "window.addEventListener('message',async function f(e){",
  "if(e.origin!==O||e.source!==W||!e.data||e.data.tipo!=='pendientes')return;window.removeEventListener('message',f);",
  "var C=(Array.isArray(e.data.cambios)?e.data.cambios:[]).slice(0,100),R=[];",
  "var u=await pedir('/users/'+L.id),bp=u.ok&&u.j&&u.j.objects&&Array.isArray(u.j.objects.warehouses)?u.j.objects.warehouses:null;",
  "for(var i=0;i<C.length;i++){var c=C[i],x;",
  "try{x=bp?await aplicar(c,bp):{ok:false,error:motivo(u)}}catch(z){x={ok:false,error:String(z&&z.message||z)}}",
  "x.id=c.id;R.push(x);W.postMessage({tipo:'progreso',hechos:i+1,total:C.length},O)}",
  "W.postMessage({tipo:'resultados',resultados:R},O)});",
  "})();",
].join("");

/**
 * La versión del favorito (pedido de Alcides, 25 oct 2026): sale del propio código (FNV-1a de 32 bits, en hexadecimal), así cambia
 * sola cada vez que cambia el favorito. El favorito la manda al abrir la ventana (`&v=`) y la ventana la compara con esta: si no es
 * la misma, el favorito guardado es viejo y hay que volver a arrastrarlo. Un favorito anterior a esto no manda ninguna.
 */
export const VERSION_FAVORITO = (() => {
  let h = 0x811c9dc5;
  for (let i = 0; i < CODIGO.length; i++) h = Math.imul(h ^ CODIGO.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 6);
})();

/** El favorito para la plataforma en ese origen (`https://…`, o `http://localhost` para probar), con el prefijo `javascript:`. */
export function marcadorAplicarDropi(origen: string): string {
  const o = new URL(origen);
  if (o.protocol !== "https:" && !(o.protocol === "http:" && (o.hostname === "localhost" || o.hostname === "127.0.0.1"))) throw new Error("El origen del favorito debe ser https.");
  return `javascript:${encodeURIComponent(CODIGO.replace("__ORIGEN__", JSON.stringify(o.origin)).replace("__VERSION__", JSON.stringify(VERSION_FAVORITO)))}`;
}

/** El origen de la pestaña de Dropi de un país («pa» → https://app.dropi.pa), el único al que la ventana le habla. */
export const origenDropi = (pais: string) => (/^[a-z]{2}$/.test(pais) ? `https://app.dropi.${pais}` : null);
