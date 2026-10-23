/**
 * El favorito «Aplicar en Dropi» (22 oct 2026, reemplaza a «Conectar Dropi»): Dropi responde 403 a las llamadas que salen de un
 * servidor (Vercel), así que los cambios se hacen desde la pestaña de Dropi, con su propia sesión, que nunca sale de ella.
 *
 * Se pulsa con Dropi abierto en la cuenta de proveedor de ECOMFIVE: abre `/publicaciones-dropi/aplicar-dropi` en una ventana, que le
 * manda (por `postMessage`) los cambios pendientes; el favorito los aplica uno por uno con el mismo guardado de la pantalla de Dropi
 * (`ARMAR_JS`, igual a `armarGuardadoProducto`: lo comprueba la prueba), vuelve a leer cada producto para confirmar y le devuelve los
 * resultados a la ventana, que los guarda. Solo acepta mensajes de la plataforma (su origen y su ventana). El código va completo en
 * el favorito.
 */

/** El armado del guardado de Dropi, en JavaScript simple para el favorito (el mismo de `armarGuardadoProducto`). */
export const ARMAR_JS = [
  "function armar(o,bp,c){",
  "if(o.type!=='SIMPLE')return{error:'Tiene variaciones: cámbialo a mano en Dropi.'};",
  "if(c.nombre!==null&&(!c.nombre.trim()||c.nombre.length>40))return{error:'El nombre debe tener de 1 a 40 caracteres.'};",
  "var pr=c.precio==null?null:c.precio,su=c.precioSugerido==null?null:c.precioSugerido;",
  "if((pr!==null&&!(pr>0))||(su!==null&&!(su>0)))return{error:'El precio debe ser mayor que cero.'};",
  "var pf=pr!==null?pr:Number(o.sale_price),sf=su!==null?su:Number(o.suggested_price);",
  "if((pr!==null||su!==null)&&sf>0&&sf<pf)return{error:'El precio sugerido ($'+sf.toFixed(2)+') quedaría menor que el precio ($'+pf.toFixed(2)+').'};",
  "if(c.nombreGuia!==null&&c.nombreGuia.length>40)return{error:'El nombre de la guía admite 40 caracteres.'};",
  "function num(v){return v===null||v===undefined||v===''?v:Number(v)}",
  "var b=(Array.isArray(o.warehouse_product)?o.warehouse_product:[]).map(function(w){var x=w.warehouse||{};return{warehouse_id:w.warehouse_id,fullName:(x.name!=null?x.name:'')+'('+(x.address!=null?x.address:'')+')',stock:w.stock,city:x.city,warehouse_white_brand:!!x.warehouse_white_brand}});",
  "bp.forEach(function(p){if(!b.some(function(x){return x.warehouse_id===p.id}))b.push({fullName:p.name+'('+p.address+')',warehouse_id:p.id,warehouse_white_brand:!!p.warehouse_white_brand})});",
  "return{cuerpo:{id:o.id,name:c.nombre!==null?c.nombre:o.name,description:o.description,dropi_app_description:o.dropi_app_description,type:o.type,sale_price:pr!==null?pr:num(o.sale_price),suggested_price:su!==null?su:num(o.suggested_price),user_id:o.user_id,privated_product:o.privated_product,active:o.active,sku:o.sku,weight:num(o.weight),length:num(o.length),width:num(o.width),height:num(o.height),attribute:[],variations:o.variations,categories:o.categories,add_stock_in_return:o.add_stock_in_return,private_product_inventories:o.private_product_inventories,user_profit_percentage_product:o.user_profit_percentage_product,is_warehouse_white_brand:o.is_warehouse_white_brand,warehouselected:b,warehouse_previus:null,controlChangesPhotos:[],name_in_guide:c.nombreGuia!==null?c.nombreGuia:(o.name_in_guide!=null?o.name_in_guide:''),shipping_method:o.shipping_method,bar_code:o.bar_code,dropi_product_supplier_increment_fixed:o.dropi_product_supplier_increment_fixed}}",
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
  "function motivo(r){return r.s===401?'La sesión de Dropi venció: inicia sesión de nuevo en Dropi.':'Dropi respondió '+r.s+(r.j&&r.j.message?': '+r.j.message:'')+'.'}",
  "async function aplicar(c,bp){",
  "var a=await pedir('/products/'+c.producto);if(!a.ok)return{ok:false,error:motivo(a)};",
  "var o=a.j&&a.j.objects;if(!o||Number(o.id)!==Number(c.producto))return{ok:false,error:'Dropi no devolvió el producto.'};",
  "if(Number(o.user_id)!==Number(L.id))return{ok:false,error:'Ese producto no es de este proveedor en Dropi.'};",
  "var r=armar(o,bp,{nombre:c.nombre,nombreGuia:c.guia,precio:c.precio,precioSugerido:c.sugerido});if(r.error)return{ok:false,error:r.error};",
  "var g=await pedir('/products/'+c.producto,'PUT',r.cuerpo);if(!g.ok)return{ok:false,error:motivo(g)};",
  "var d=await pedir('/products/'+c.producto),n=d.j&&d.j.objects;",
  "if(!d.ok||!n)return{ok:false,error:'Se guardó, pero no se pudo comprobar en Dropi.'};",
  "if(c.nombre!==null&&n.name!==c.nombre)return{ok:false,error:'Dropi sigue mostrando el nombre «'+n.name+'».'};",
  "if(c.precio!=null&&Math.abs(Number(n.sale_price)-c.precio)>0.005)return{ok:false,error:'Dropi sigue mostrando el precio $'+n.sale_price+'.'};",
  "if(c.sugerido!=null&&Math.abs(Number(n.suggested_price)-c.sugerido)>0.005)return{ok:false,error:'Dropi sigue mostrando el precio sugerido $'+n.suggested_price+'.'};",
  "if(c.guia!==null&&n.name_in_guide!==c.guia)return{ok:false,error:'Dropi sigue mostrando en la guía «'+n.name_in_guide+'».'};",
  "return{ok:true}}",
  "var W=window.open(O+'/publicaciones-dropi/aplicar-dropi?p='+P,'aplicar-dropi','width=560,height=760');",
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

/** El favorito para la plataforma en ese origen (`https://…`, o `http://localhost` para probar), con el prefijo `javascript:`. */
export function marcadorAplicarDropi(origen: string): string {
  const o = new URL(origen);
  if (o.protocol !== "https:" && !(o.protocol === "http:" && (o.hostname === "localhost" || o.hostname === "127.0.0.1"))) throw new Error("El origen del favorito debe ser https.");
  return `javascript:${encodeURIComponent(CODIGO.replace("__ORIGEN__", JSON.stringify(o.origin)))}`;
}

/** El origen de la pestaña de Dropi de un país («pa» → https://app.dropi.pa), el único al que la ventana le habla. */
export const origenDropi = (pais: string) => (/^[a-z]{2}$/.test(pais) ? `https://app.dropi.${pais}` : null);
