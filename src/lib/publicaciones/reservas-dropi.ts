/**
 * Stock reservado por correo en Dropi (8 nov 2026, pedido de Alcides: PUB-0010 salía «Privado» y es una publicación pública a la que se le reservaron
 * unidades para el correo de un dropshipper). En Dropi hay dos cosas distintas:
 *  - un **producto privado** (`privated_product: true`): solo lo ven los correos asignados; los «P-XX …» que crea «Privatizar en Dropi»;
 *  - una **publicación pública con stock reservado**: la ve todo el catálogo, pero unas unidades quedan apartadas para un correo
 *    (`private_product_inventories`, la pestaña «Productos privados» de Dropi).
 * La lista de «Mis productos» no los distingue (`private_product` sale en los dos casos, y hasta en públicos que están en el catálogo), así que la lectura
 * abre la ficha de cada producto que tenga algo reservado (`GET api/products/<id>`) y guarda `privated_product` y las reservas vivas. Lógica pura, con prueba.
 */

type Obj = Record<string, unknown>;

/** Una reserva viva de un producto: a qué correo (y a qué usuario de Dropi), cuántas unidades y, si tiene variaciones, de cuál. */
export interface ReservaDropi {
  /** El id de la reserva en Dropi. */
  id: number | null;
  /** El id del usuario de Dropi al que se le reservó. */
  usuario: number | null;
  correo: string | null;
  nombre: string | null;
  unidades: number;
  /** La variación (null en un producto simple). */
  variacion: number | null;
}

const entero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Las reservas vivas (sin `deleted_at`) de un producto tal como lo devuelve Dropi (`private_product_inventories`). */
export function reservasDeDropi(producto: Obj): ReservaDropi[] {
  const lista = Array.isArray(producto.private_product_inventories) ? (producto.private_product_inventories as Obj[]) : [];
  return lista
    .filter((x) => x && !x.deleted_at)
    .map((x) => {
      const u = (x.user && typeof x.user === "object" ? x.user : {}) as Obj;
      const nombre = [texto(u.name), texto(u.surname)].filter(Boolean).join(" ") || texto(u.full_name) || null;
      return {
        id: x.id == null ? null : Number(x.id) || null,
        usuario: x.user_id == null ? (u.id == null ? null : Number(u.id) || null) : Number(x.user_id) || null,
        correo: (texto(x.email) ?? texto(u.email))?.toLowerCase() ?? null,
        nombre,
        unidades: entero(x.stock),
        variacion: x.variation_id == null ? null : Number(x.variation_id) || null,
      };
    });
}

/** Lo que guarda la lectura de un producto: si es un producto privado y sus reservas. `null` si la lectura no abrió su ficha (no tenía nada reservado). */
export interface DetallePrivado {
  privadoProducto: boolean;
  reservas: ReservaDropi[];
}

/** Lee lo que dejó el lector en un producto de la lista (`o.detalle_privado`, armado con la ficha de Dropi). */
export function detallePrivadoDeLectura(o: Obj): DetallePrivado | null {
  const d = o.detalle_privado as Obj | undefined;
  if (!d || typeof d !== "object") return null;
  return { privadoProducto: d.privated_product === true, reservas: reservasDeDropi(d) };
}

/** Las reservas como se guardan en la base (`dropi_productos_proveedor.reservas`) y vuelven: se vuelven a revisar al leerlas. */
export function reservasGuardadas(v: unknown): ReservaDropi[] {
  if (!Array.isArray(v)) return [];
  return (v as Obj[]).flatMap((x) =>
    x && typeof x === "object"
      ? [{ id: x.id == null ? null : Number(x.id) || null, usuario: x.usuario == null ? null : Number(x.usuario) || null, correo: texto(x.correo), nombre: texto(x.nombre), unidades: entero(x.unidades), variacion: x.variacion == null ? null : Number(x.variacion) || null }]
      : [],
  );
}

/**
 * El tipo de una publicación según Dropi: con la ficha leída, `privated_product` manda (pública aunque tenga reservas); sin ella, lo que dice la lista
 * de «Mis productos» como antes.
 */
export function tipoSegunDropi(p: { privado: boolean; privadoProducto: boolean | null }): "publico" | "privado" {
  if (p.privadoProducto !== null) return p.privadoProducto ? "privado" : "publico";
  return p.privado ? "privado" : "publico";
}

/** «Reservado a Juan Pérez · 66 u.» o, con varios correos, «Reservado a 2 correos · 80 u.». */
export function textoReservas(reservas: readonly ReservaDropi[]): string {
  const total = reservas.reduce((t, r) => t + r.unidades, 0);
  const quienes = new Set(reservas.map((r) => r.correo ?? r.nombre ?? String(r.usuario)));
  const a = quienes.size === 1 ? (reservas[0].nombre ?? reservas[0].correo ?? "un correo") : `${quienes.size} correos`;
  return `Reservado a ${a} · ${total.toLocaleString("es-PA")} u.`;
}

// ── Cambiar una reserva desde el sistema (la cola de «Aplicar en Dropi», tipo «reserva», migración 0254) ──

/** Lo que pide un cambio de reserva: que `correo` quede con `unidades` reservadas (0 = quitarle la reserva). */
export interface DatosReserva {
  correo: string;
  unidades: number;
  /** Para mostrar: el nombre del dropshipper (del CRM o de Dropi). */
  nombre: string | null;
  /** Las unidades que tenía reservadas según la última lectura (null = no tenía). */
  antes: number | null;
  /** El ID de Dropi al que va (con dos IDs, el que se eligió). */
  producto?: number;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_UNIDADES_RESERVA = 100_000;

export function normalizarDatosReserva(v: unknown): DatosReserva {
  const o = (v && typeof v === "object" ? v : {}) as Obj;
  const n = Number(o.unidades);
  return {
    correo: String(o.correo ?? "").trim().toLowerCase().slice(0, 120),
    unidades: Number.isInteger(n) && n >= 0 ? n : -1,
    nombre: texto(o.nombre)?.slice(0, 120) ?? null,
    antes: o.antes == null ? null : entero(o.antes),
    ...(Number.isInteger(Number(o.producto)) && Number(o.producto) > 0 ? { producto: Number(o.producto) } : {}),
  };
}

/**
 * Lo que falta o está mal en un pedido de reserva. **No mira el stock** (10 nov 2026, pedido de Alcides: la lectura de «Mis productos» es de hace horas y él
 * acaba de ingresar unidades en Dropi, así que el sistema le decía «solo hay 85» cuando ya había más): quien manda es el stock que Dropi tenga cuando el
 * favorito aplica el cambio.
 */
export function faltantesReserva(d: DatosReserva, contexto: { tieneReserva: boolean }): string[] {
  const f: string[] = [];
  if (!CORREO.test(d.correo)) f.push("El correo con que el dropshipper entra a Dropi.");
  if (!(d.unidades >= 0) || d.unidades > MAX_UNIDADES_RESERVA) f.push("Las unidades: un número entero, 0 o más.");
  if (d.unidades === 0 && !contexto.tieneReserva) f.push("Ese correo no tiene unidades reservadas: no hay nada que quitar.");
  return f;
}

/** Una reserva como la manda la pantalla de Dropi (`cargarPrivateProductInventory`); igual a `reservaDeDropi` de privatizar-dropi.ts. */
function reservaParaDropi(x: Obj, extra: Obj = {}): Obj {
  return {
    id: x.id ?? null,
    product_id: x.product_id ?? null,
    variation_id: x.variation_id ?? null,
    user_id: x.user_id ?? null,
    variations: [],
    user: x.user ?? null,
    stock: x.stock ?? null,
    last_quantity_separed: x.last_quantity_separed ?? null,
    created_at: null,
    deleted_at: x.deleted_at != null ? true : null,
    updated_at: null,
    email: x.email ?? null,
    change: null,
    ...extra,
  };
}

/**
 * Las reservas que se mandan en el `PUT api/products/<id>` para que `correo` quede con `unidades`: la suya cambia (`change: true`), se quita
 * (`deleted_at: true`) o se agrega (con el usuario de `existemail`); las demás van como están. `sinCambio` si ya está así. Error si tiene
 * variaciones (la reserva es por variación: en Dropi) o si lo reservado pasaría del stock. `armar` = el guardado del producto (`armarGuardadoProducto`).
 */
export function reservasPara(
  producto: Obj,
  usuario: Obj | null,
  d: DatosReserva,
): { reservas: Obj[] } | { sinCambio: true } | { error: string } {
  if (producto.type !== "SIMPLE") return { error: "Tiene variaciones: la reserva es por variación y se hace en Dropi." };
  const originales = Array.isArray(producto.private_product_inventories) ? (producto.private_product_inventories as Obj[]) : [];
  const pv = originales.map((x) => reservaParaDropi(x));
  const correo = d.correo.toLowerCase();
  // Dropi a veces deja el correo de la reserva solo en su usuario (`email: null`, `user.email`): también cuenta (9 nov 2026, PUB-0302: «Falta la cuenta de Dropi
  // de ese correo» al cambiar la reserva de naturex.co0@gmail.com, que ya existía).
  const correoDe = (x: Obj) => (typeof x.email === "string" ? x.email : typeof (x.user as Obj | null)?.email === "string" ? ((x.user as Obj).email as string) : "").toLowerCase();
  const i = originales.findIndex((x) => !x.deleted_at && ((correoDe(x) !== "" && correoDe(x) === correo) || (usuario?.id != null && Number(x.user_id) === Number(usuario.id))));
  if (d.unidades === 0) {
    if (i < 0) return { sinCambio: true };
    pv[i] = reservaParaDropi(originales[i], { deleted_at: true, change: true });
  } else if (i >= 0) {
    if (Number(originales[i].stock) === d.unidades) return { sinCambio: true };
    pv[i] = reservaParaDropi(originales[i], { stock: d.unidades, change: true });
  } else {
    if (!usuario || usuario.id == null) return { error: "Falta la cuenta de Dropi de ese correo." };
    pv.push(reservaParaDropi({ id: null, product_id: producto.id ?? null, variation_id: null, user_id: usuario.id, user: usuario, stock: d.unidades, last_quantity_separed: null, email: d.correo }, { change: true }));
  }
  // Lo que Dropi muestra en la bodega es lo **libre** (10 nov 2026: «solo me contó las 85 que ingresé y no las 14 que ya tenía privatizadas»): lo que se le
  // suma a un correo no puede pasar de eso, pero lo que ese correo ya tiene reservado sí cuenta para su total. Es una cota para no mandar algo imposible;
  // la última palabra es de Dropi.
  const stock = (Array.isArray(producto.warehouse_product) ? (producto.warehouse_product as Obj[]) : []).reduce((t, w) => t + Number(w.stock ?? 0), 0);
  const ya = i >= 0 ? Number(originales[i].stock ?? 0) : 0;
  if (d.unidades - ya > stock)
    return { error: `En Dropi hay ${stock.toLocaleString("es-PA")} unidades disponibles${ya > 0 ? ` más las ${ya.toLocaleString("es-PA")} que ya tiene reservadas ese correo` : ""}: se quieren reservar ${d.unidades.toLocaleString("es-PA")}.` };
  return { reservas: pv };
}

/** Lo mismo en JavaScript simple para el favorito (la prueba compara las dos). */
export const RESERVA_JS = [
  "function rvP(x,e){var r={id:x.id!=null?x.id:null,product_id:x.product_id!=null?x.product_id:null,variation_id:x.variation_id!=null?x.variation_id:null,user_id:x.user_id!=null?x.user_id:null,variations:[],user:x.user!=null?x.user:null,stock:x.stock!=null?x.stock:null,last_quantity_separed:x.last_quantity_separed!=null?x.last_quantity_separed:null,created_at:null,deleted_at:x.deleted_at!=null?true:null,updated_at:null,email:x.email!=null?x.email:null,change:null};if(e)for(var k in e)r[k]=e[k];return r}",
  "function reservasPara(o,u,d){if(o.type!=='SIMPLE')return{error:'Tiene variaciones: la reserva es por variación y se hace en Dropi.'};",
  "var og=Array.isArray(o.private_product_inventories)?o.private_product_inventories:[],pv=og.map(function(x){return rvP(x)}),c=String(d.correo).toLowerCase(),i=-1;",
  "for(var k=0;k<og.length;k++){var x=og[k],xe=typeof x.email==='string'?x.email:(x.user&&typeof x.user.email==='string'?x.user.email:'');if(!x.deleted_at&&((xe!==''&&xe.toLowerCase()===c)||(u&&u.id!=null&&Number(x.user_id)===Number(u.id)))){i=k;break}}",
  "if(d.unidades===0){if(i<0)return{sinCambio:true};pv[i]=rvP(og[i],{deleted_at:true,change:true})}",
  "else if(i>=0){if(Number(og[i].stock)===d.unidades)return{sinCambio:true};pv[i]=rvP(og[i],{stock:d.unidades,change:true})}",
  "else{if(!u||u.id==null)return{error:'Falta la cuenta de Dropi de ese correo.'};pv.push(rvP({id:null,product_id:o.id!=null?o.id:null,variation_id:null,user_id:u.id,user:u,stock:d.unidades,last_quantity_separed:null,email:d.correo},{change:true}))}",
  "var st=(Array.isArray(o.warehouse_product)?o.warehouse_product:[]).reduce(function(t,w){return t+Number(w.stock!=null?w.stock:0)},0),ya=i>=0?Number(og[i].stock!=null?og[i].stock:0):0;",
  "if(d.unidades-ya>st)return{error:'En Dropi hay '+st.toLocaleString('es-PA')+' unidades disponibles'+(ya>0?' más las '+ya.toLocaleString('es-PA')+' que ya tiene reservadas ese correo':'')+': se quieren reservar '+d.unidades.toLocaleString('es-PA')+'.'};",
  "return{reservas:pv}}",
  "function stockT(o){return(Array.isArray(o.warehouse_product)?o.warehouse_product:[]).reduce(function(t,w){return t+(Number(w.stock)||0)},0)}",
  // Las reservas vivas que se devuelven al sistema (como las guarda la lectura).
  "function rvVivas(o){return(Array.isArray(o.private_product_inventories)?o.private_product_inventories:[]).filter(function(x){return!x.deleted_at}).map(function(x){return{id:x.id,user_id:x.user_id,email:x.email!=null?x.email:(x.user&&x.user.email?x.user.email:null),stock:x.stock,variation_id:x.variation_id!=null?x.variation_id:null,user:x.user?{id:x.user.id,name:x.user.name,surname:x.user.surname,email:x.user.email}:null}})}",
].join("");
