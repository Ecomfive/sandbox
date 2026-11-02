// «Privatizar en Dropi» (pedido de Jhokser, 26 oct 2026; migración 0155): dejarle un producto a un solo dropshipper. Es lo que se hace a mano
// con los productos «P-MA …»: un producto privado aparte (con su propio ID), con el correo del dropshipper asignado y las unidades que se le
// reservan, que salen del stock del público. El favorito «Aplicar en Dropi» lo hace desde la pestaña de Dropi, con lo mismo que hace la pantalla
// de Dropi (leído de su código el 26 oct 2026, componente «Editar mis productos»):
//  1. El correo tiene que ser de una cuenta de Dropi que no sea de proveedor: `GET api/users/existemail/<correo>/false` (Dropi dice que un
//     proveedor no puede recibir un producto privado). Esa respuesta trae el `id` y los datos del usuario.
//  2. Crear el producto privado: `POST api/products` con el cuerpo del público, `privated_product: true`, sin ID y el stock en la bodega.
//     (Dropi no deja asignar el correo al crear: «crea el producto, luego podrás modificarlo para crear stock privado».)
//  3. Fotos y garantías, como al republicar.
//  4. Asignar al dropshipper: `PUT api/products/<id>` con `private_product_inventories: [{ user_id, user, email, stock, change: true, … }]`
//     (la pantalla manda cada reserva con esos campos; quitar una es mandarla con `deleted_at` y `change`). La suma reservada no puede pasar el stock.
//  5. Sacarle esas unidades al público (salida de stock) y comprobar.
//  Varios correos en un mismo ID (pedido de Jhokser, 3 nov 2026: dos correos de Sinisterra en un solo producto privado): además del correo principal, `extras`
//  trae otros dropshippers con sus unidades. Dropi ya lo permite (`private_product_inventories` es una lista): se crea UN producto privado con el stock total
//  (principal + extras), se asigna cada correo con sus unidades (releyendo el producto entre una reserva y la otra, para no pisar la anterior) y al público
//  se le saca el total.
// Aquí van las piezas puras (sin base ni red), con prueba que también compara la versión en JavaScript del favorito.

import { armarGuardadoProducto, MAX_NOMBRE_DROPI } from "./dropi-guardado";
import { armarMovimientoStock } from "./republicar-dropi";

type Obj = Record<string, unknown>;

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Un producto privado se llama «P-MA Aceite…»: «P-» y las iniciales de a quién se privatizó. */
const PREFIJO_PRIVADO = /^\s*p-[a-z0-9]{1,6}\s+/i;

/** El nombre del producto público: el de una publicación, sin el «P-XX» de un privado. */
export const sinPrefijoPrivado = (nombre: string): string => nombre.replace(PREFIJO_PRIVADO, "").trim();

/** Las iniciales de un nombre («María Álvarez Soto» → «MAS»): hasta 3 letras o números, en mayúsculas; vacío si no hay con qué. */
export function inicialesDe(nombre: string): string {
  const palabras = sinAcentos(nombre).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  if (!palabras.length) return "";
  if (palabras.length === 1) return palabras[0].slice(0, 2);
  return palabras.slice(0, 3).map((p) => p[0]).join("");
}

/** Las iniciales del prefijo «P-XX»: 1 a 6 letras o números, sin acentos y en mayúsculas. */
export function limpiarIniciales(t: string): string {
  return sinAcentos(String(t ?? "")).toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 6);
}

/** El nombre del producto privado en Dropi: «P-XX » y el nombre del público, cortado en una palabra para caber en los 40 caracteres que admite Dropi. */
export function nombrePrivado(iniciales: string, nombrePublico: string): string {
  const prefijo = `P-${limpiarIniciales(iniciales)} `;
  const base = sinPrefijoPrivado(nombrePublico).replace(/\s+/g, " ");
  const cabe = MAX_NOMBRE_DROPI - prefijo.length;
  if (base.length <= cabe) return `${prefijo}${base}`;
  const corte = base.slice(0, cabe);
  const enPalabra = corte.lastIndexOf(" ") > cabe * 0.5 && base[cabe] !== " " ? corte.slice(0, corte.lastIndexOf(" ")) : corte;
  return `${prefijo}${enPalabra.replace(/[\s.,;:\-]+$/, "")}`;
}

/** Otro dropshipper que comparte el mismo producto privado (mismo ID), con las unidades que se le reservan a él. */
export interface DestinoExtra {
  correo: string;
  /** Su nombre (opcional: sin él se muestra el correo). */
  dropshipper: string;
  unidades: number;
}

/** Cuántos correos más (aparte del principal) caben en un mismo ID. */
export const MAX_EXTRAS = 4;

/** Lo que pide privatizar un producto (guardado en el cambio pendiente de la cola, `datos`). */
export interface DatosPrivatizar {
  /** El correo con que el dropshipper tiene su cuenta de Dropi (en minúsculas). */
  correo: string;
  /** Su nombre, como se ve en «Privatizado a». */
  dropshipper: string;
  /** El dropshipper del CRM, si se eligió de ahí. */
  dropshipperId: string | null;
  /** Las letras del «P-XX». */
  iniciales: string;
  /** Las unidades que se le reservan (salen del stock del público). */
  unidades: number;
  /** La bodega de ECOMFIVE (ID de Dropi) de donde salen y donde queda el stock del privado. */
  bodega: number;
  /** El precio de venta del privado (el del público, o el que se acordó con el dropshipper). */
  precio: number;
  /** El nombre del producto privado en Dropi («P-MA Aceite…»). */
  nombre: string;
  /** La publicación pública de la que sale, en el sistema. */
  origen: string;
  /** Ya se le sacó el stock al público en Dropi (para no sacarlo dos veces si un paso posterior falló y se reintenta). */
  salida: boolean;
  /** Otros correos en el mismo ID (con sus unidades); `unidades` es solo la del correo principal. Vacío o ausente = un solo correo. */
  extras?: DestinoExtra[];
}

/** Todas las unidades que pasan al producto privado: las del correo principal y las de los demás correos del mismo ID. */
export const unidadesTotales = (d: Pick<DatosPrivatizar, "unidades" | "extras">): number => d.unidades + (d.extras ?? []).reduce((t, x) => t + x.unidades, 0);

/** Lo que se ve de a quién se privatiza: «Nombre (correo)», y los demás correos del mismo ID con « y ». */
export const quienesDe = (d: Pick<DatosPrivatizar, "correo" | "dropshipper" | "unidades" | "extras">): string =>
  destinosDe(d)
    .filter((x) => x.correo)
    .map((x) => (x.dropshipper ? `${x.dropshipper} (${x.correo})` : x.correo))
    .join(" y ");

/** Todos los correos del producto privado, el principal primero. */
export const destinosDe = (d: Pick<DatosPrivatizar, "correo" | "dropshipper" | "unidades" | "extras">): DestinoExtra[] => [{ correo: d.correo, dropshipper: d.dropshipper, unidades: d.unidades }, ...(d.extras ?? [])];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PRECIO_MINIMO_PRIVADO = 0.1;

/** Limpia los datos de una privatización que llegan del navegador o de la base. Lo que no es válido queda vacío; `faltantesPrivatizar` dice qué falta. */
export function normalizarDatosPrivatizar(crudo: unknown): DatosPrivatizar {
  const r = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Obj;
  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const n = (v: unknown) => {
    const x = Number(typeof v === "string" ? v.replace(",", ".") : v);
    return Number.isFinite(x) ? x : 0;
  };
  const correo = texto(r.correo, 200).toLowerCase();
  const iniciales = limpiarIniciales(texto(r.iniciales, 20));
  const unidades = Math.trunc(n(r.unidades));
  const bodega = Math.trunc(n(r.bodega));
  const precio = Math.round(n(r.precio) * 100) / 100;
  const origen = typeof r.origen === "string" && UUID.test(r.origen) ? r.origen : "";
  const extras: DestinoExtra[] = (Array.isArray(r.extras) ? (r.extras as unknown[]) : []).slice(0, MAX_EXTRAS).map((x) => {
    const e = (typeof x === "object" && x !== null ? x : {}) as Obj;
    const c = texto(e.correo, 200).toLowerCase();
    const u = Math.trunc(n(e.unidades));
    return { correo: CORREO_VALIDO.test(c) ? c : "", dropshipper: texto(e.dropshipper, 120), unidades: u > 0 && u < 10_000_000 ? u : 0 };
  });
  return {
    correo: CORREO_VALIDO.test(correo) ? correo : "",
    dropshipper: texto(r.dropshipper, 120),
    dropshipperId: typeof r.dropshipperId === "string" && UUID.test(r.dropshipperId) ? r.dropshipperId : null,
    iniciales,
    unidades: unidades > 0 && unidades < 10_000_000 ? unidades : 0,
    bodega: bodega > 0 && bodega < 100_000_000 ? bodega : 0,
    precio: precio >= PRECIO_MINIMO_PRIVADO && precio < 1e7 ? precio : 0,
    nombre: texto(r.nombre, MAX_NOMBRE_DROPI),
    origen,
    salida: r.salida === true,
    ...(extras.length ? { extras } : {}),
  };
}

/** Lo que falta para poder privatizar (en el orden en que se pide); vacío = todo en orden. */
export function faltantesPrivatizar(d: DatosPrivatizar, disponible: number | null): string[] {
  const f: string[] = [];
  if (!d.correo) f.push("El correo de Dropi del dropshipper (con el que tiene su cuenta).");
  if (!d.dropshipper) f.push("El nombre del dropshipper.");
  if (!d.iniciales) f.push("Las iniciales para el «P-XX» del nombre.");
  if (!(d.unidades > 0)) f.push("Cuántas unidades se le reservan (mínimo 1).");
  (d.extras ?? []).forEach((x, i) => {
    const quien = `del correo ${i + 2}`;
    if (!x.correo) f.push(`El correo de Dropi ${quien}.`);
    if (!(x.unidades > 0)) f.push(`Cuántas unidades se le reservan ${quien} (mínimo 1).`);
  });
  const correos = destinosDe(d).map((x) => x.correo).filter(Boolean);
  if (new Set(correos).size < correos.length) f.push("Un correo está repetido: cada correo va una sola vez.");
  const total = unidadesTotales(d);
  if (disponible !== null && total > disponible) f.push(`Solo hay ${disponible.toLocaleString("es-PA")} unidades en esa bodega de Dropi y se piden ${total.toLocaleString("es-PA")}.`);
  if (!(d.bodega > 0)) f.push("La bodega de donde salen las unidades.");
  if (!(d.precio >= PRECIO_MINIMO_PRIVADO)) f.push(`El precio de venta (mínimo $${PRECIO_MINIMO_PRIVADO}).`);
  if (!d.nombre) f.push("El nombre del producto privado.");
  return f;
}

/** Una reserva de `private_product_inventories` como la manda la pantalla de Dropi (`cargarPrivateProductInventory`). */
export function reservaDeDropi(x: Obj, extra: Obj = {}): Obj {
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

/** Las reservas del producto con todas las activas marcadas como quitadas (lo que hace la pantalla al borrar un correo de «Productos privados»). */
export function reservasQuitadas(lista: unknown): Obj[] {
  return (Array.isArray(lista) ? (lista as Obj[]) : []).map((x) => (x.deleted_at ? reservaDeDropi(x) : reservaDeDropi(x, { deleted_at: true, change: true })));
}

/**
 * El `POST api/products` que crea el producto privado: el cuerpo del guardado del público con el nombre y el precio del privado, sin ID, marcado
 * privado, sin reservas ni porcentajes por dropshipper (se copian mal: a mano) y con el stock solo en la bodega elegida. Error si el público no
 * se puede privatizar: con variaciones, ya es privado, la bodega no es de ECOMFIVE o no alcanza el stock (si todavía no se le sacó).
 */
export function armarPrivado(producto: Obj, bodegasProveedor: Obj[], d: DatosPrivatizar): { cuerpo: Obj } | { error: string } {
  const e = errorDeOrigen(producto, bodegasProveedor, d);
  if (e) return { error: e };
  const r = armarGuardadoProducto(producto, bodegasProveedor, { nombre: d.nombre, nombreGuia: null, precio: d.precio, precioSugerido: d.precio });
  if ("error" in r) return r;
  const cuerpo: Obj = { ...r.cuerpo, id: null, privated_product: true, private_product_inventories: [], user_profit_percentage_product: [] };
  cuerpo.warehouselected = (r.cuerpo.warehouselected as Obj[]).map((b) => ({ ...b, stock: Number(b.warehouse_id) === d.bodega ? unidadesTotales(d) : 0 }));
  return { cuerpo };
}

/** Por qué el producto público no se puede privatizar con estos datos (o null si sí). */
export function errorDeOrigen(producto: Obj, bodegasProveedor: Obj[], d: DatosPrivatizar): string | null {
  if (producto.type !== "SIMPLE") return "Tiene variaciones: privatízalo a mano en Dropi.";
  if (producto.privated_product === true) return "Ese producto ya es privado: se privatiza el público.";
  if (!bodegasProveedor.some((b) => Number(b.id) === d.bodega)) return "Esa bodega no es de ECOMFIVE: solo se privatiza stock de las bodegas propias.";
  if (!d.salida) {
    const hay = Number(((Array.isArray(producto.warehouse_product) ? (producto.warehouse_product as Obj[]) : []).find((w) => Number(w.warehouse_id) === d.bodega) ?? {}).stock ?? 0);
    if (hay < unidadesTotales(d)) return `El público solo tiene ${hay.toLocaleString("es-PA")} unidades en esa bodega de Dropi y se piden ${unidadesTotales(d).toLocaleString("es-PA")}.`;
  }
  return null;
}

/**
 * El `PUT api/products/<id>` que le asigna las unidades al dropshipper en «Productos privados» (la reserva nueva lleva `change: true`; las que ya
 * tenía el producto van como están). `usuario` = `objects` de `existemail`. Error si el producto no tiene stock para esa reserva. `destino` = a cuál de
 * los correos del producto se le asigna (el principal si no se dice).
 */
export function armarAsignacion(producto: Obj, bodegasProveedor: Obj[], usuario: Obj, d: DatosPrivatizar, destino?: { correo: string; unidades: number }): { cuerpo: Obj } | { error: string } {
  const dest = destino ?? { correo: d.correo, unidades: d.unidades };
  const r = armarGuardadoProducto(producto, bodegasProveedor, { nombre: null, nombreGuia: null });
  if ("error" in r) return r;
  const previas = (Array.isArray(producto.private_product_inventories) ? (producto.private_product_inventories as Obj[]) : []).map((x) => reservaDeDropi(x));
  const reservado = previas.filter((x) => !x.deleted_at).reduce((t, x) => t + Number(x.stock ?? 0), 0);
  const stock = (Array.isArray(producto.warehouse_product) ? (producto.warehouse_product as Obj[]) : []).reduce((t, w) => t + Number(w.stock ?? 0), 0);
  if (reservado + dest.unidades > stock) return { error: `El producto privado tiene ${stock.toLocaleString("es-PA")} unidades y se quieren reservar ${(reservado + dest.unidades).toLocaleString("es-PA")}.` };
  const nueva = reservaDeDropi(
    { id: null, product_id: producto.id, variation_id: null, user_id: usuario.id, user: usuario, stock: dest.unidades, last_quantity_separed: null, email: dest.correo },
    { change: true },
  );
  return { cuerpo: { ...r.cuerpo, private_product_inventories: [...previas, nueva] } };
}

/** ¿El producto ya tiene una reserva activa para ese usuario? (un reintento no la repite). */
export function yaAsignado(producto: Obj, usuarioId: number): boolean {
  return (Array.isArray(producto.private_product_inventories) ? (producto.private_product_inventories as Obj[]) : []).some((x) => !x.deleted_at && Number(x.user_id) === usuarioId);
}

/** El `PUT` que le saca al público las unidades que pasaron al privado (concepto: a qué ID pasaron). */
export function armarSalidaDelPublico(producto: Obj, bodegasProveedor: Obj[], d: DatosPrivatizar, idPrivado: number): { cuerpo: Obj } | { error: string } {
  return armarMovimientoStock(producto, bodegasProveedor, { [String(d.bodega)]: -unidadesTotales(d) }, `Privatizado en el ID ${idPrivado}`);
}

/** Lo mismo en JavaScript simple para el favorito (va después de `REPUBLICAR_JS`, que define `armar`, `mover` y `stockDe`). La prueba compara los dos. */
export const PRIVATIZAR_JS = [
  "function pvTotal(d){return Number(d.unidades)+(Array.isArray(d.extras)?d.extras:[]).reduce(function(t,x){return t+Number(x.unidades)},0)}",
  "function pvDestinos(d){return[{correo:d.correo,dropshipper:d.dropshipper,unidades:d.unidades}].concat(Array.isArray(d.extras)?d.extras:[])}",
  "function reserva(x,e){var r={id:x.id!=null?x.id:null,product_id:x.product_id!=null?x.product_id:null,variation_id:x.variation_id!=null?x.variation_id:null,user_id:x.user_id!=null?x.user_id:null,variations:[],user:x.user!=null?x.user:null,stock:x.stock!=null?x.stock:null,last_quantity_separed:x.last_quantity_separed!=null?x.last_quantity_separed:null,created_at:null,deleted_at:x.deleted_at!=null?true:null,updated_at:null,email:x.email!=null?x.email:null,change:null};",
  "if(e)for(var k in e)r[k]=e[k];return r}",
  "function reservasQuitadas(l){return(Array.isArray(l)?l:[]).map(function(x){return x.deleted_at?reserva(x):reserva(x,{deleted_at:true,change:true})})}",
  "function errorOrigen(o,bp,d){",
  "if(o.type!=='SIMPLE')return'Tiene variaciones: privatízalo a mano en Dropi.';",
  "if(o.privated_product===true)return'Ese producto ya es privado: se privatiza el público.';",
  "if(!bp.some(function(b){return Number(b.id)===d.bodega}))return'Esa bodega no es de ECOMFIVE: solo se privatiza stock de las bodegas propias.';",
  "if(!d.salida){var w=(Array.isArray(o.warehouse_product)?o.warehouse_product:[]).filter(function(x){return Number(x.warehouse_id)===d.bodega})[0]||{},hay=Number(w.stock!=null?w.stock:0);",
  "if(hay<pvTotal(d))return'El público solo tiene '+hay.toLocaleString('es-PA')+' unidades en esa bodega de Dropi y se piden '+pvTotal(d).toLocaleString('es-PA')+'.'}",
  "return null}",
  "function privado(o,bp,d){var e=errorOrigen(o,bp,d);if(e)return{error:e};",
  "var r=armar(o,bp,{nombre:d.nombre,nombreGuia:null,precio:d.precio,precioSugerido:d.precio});if(r.error)return r;",
  "var c=Object.assign({},r.cuerpo,{id:null,privated_product:true,private_product_inventories:[],user_profit_percentage_product:[]});",
  "c.warehouselected=r.cuerpo.warehouselected.map(function(b){return Object.assign({},b,{stock:Number(b.warehouse_id)===d.bodega?pvTotal(d):0})});",
  "return{cuerpo:c}}",
  "function asignacion(o,bp,u,d,dt){dt=dt||{correo:d.correo,unidades:d.unidades};var r=armar(o,bp,{nombre:null,nombreGuia:null});if(r.error)return r;",
  "var pv=(Array.isArray(o.private_product_inventories)?o.private_product_inventories:[]).map(function(x){return reserva(x)});",
  "var rs=pv.filter(function(x){return!x.deleted_at}).reduce(function(t,x){return t+Number(x.stock!=null?x.stock:0)},0);",
  "var st=(Array.isArray(o.warehouse_product)?o.warehouse_product:[]).reduce(function(t,w){return t+Number(w.stock!=null?w.stock:0)},0);",
  "if(rs+dt.unidades>st)return{error:'El producto privado tiene '+st.toLocaleString('es-PA')+' unidades y se quieren reservar '+(rs+dt.unidades).toLocaleString('es-PA')+'.'};",
  "var nv=reserva({id:null,product_id:o.id,variation_id:null,user_id:u.id,user:u,stock:dt.unidades,last_quantity_separed:null,email:dt.correo},{change:true});",
  "return{cuerpo:Object.assign({},r.cuerpo,{private_product_inventories:pv.concat([nv])})}}",
  "function yaAsignado(o,id){return(Array.isArray(o.private_product_inventories)?o.private_product_inventories:[]).some(function(x){return!x.deleted_at&&Number(x.user_id)===id})}",
  "function salidaPublico(o,bp,d,id){var m={};m[String(d.bodega)]=-pvTotal(d);return mover(o,bp,m,'Privatizado en el ID '+id)}",
].join("");
