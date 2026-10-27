// «Publicar en Dropi» (pedido de Jhokser, 24 oct 2026; migración 0151): una publicación nueva del sistema se crea en Dropi como un
// cambio pendiente de la cola de «Aplicar en Dropi». Lo aplica el favorito desde la pestaña de Dropi con lo mismo que hace la pantalla
// «Crear producto» de Dropi (leído de su código el 24 oct 2026, app.dropi.pa › formulario de producto):
//
// Lo que Dropi exige para guardar (formulario `declareForm` + `saveProduct`):
//  - Nombre (máximo 40 caracteres; la pantalla lo corta), peso (de 0,001 a 25 000 g; en kg solo en Rumania), largo, ancho y alto (cm, mínimo
//    0,001 cada uno), tipo, categoría (al menos una), descripción (mínimo 200 caracteres), precio de venta y precio sugerido (mínimo 0,1).
//  - Al **crear** un producto simple y **público**: una bodega con 100 unidades o más (`hasAtLeastOneWarehouseWithMinimumStock`).
//  - Un producto que **no** es privado: mínimo 3 imágenes.
//  - Si la cuenta tiene el permiso «Warranties»: las 4 garantías por defecto activas, de 10 días o más, con comentario en las tres primeras.
//  - Opcionales en Dropi: SKU, descripción para la app, método de envío y código de barras. **Aquí el SKU es obligatorio** (pedido de Hernán,
//    27 oct 2026): es el código del producto vinculado, el mismo que va en el nombre de la guía de envío y con el que se descuentan las ventas.
// Guardar es `POST api/products` (sin ID; responde `objects.id`); después la pantalla sube las fotos (`POST api/products/photos/upload`) y las
// garantías (`POST api/productwarranty/create { id, warranties }`). Las categorías se mandan como objetos de `GET api/categories`.
//
// Solo productos simples y públicos (un privado nace de uno público; un variable se arma a mano en Dropi). Sin base ni red, con prueba que
// también compara la versión en JavaScript del favorito.

type Obj = Record<string, unknown>;

export const MIN_DESCRIPCION_CREAR = 200;
export const MIN_FOTOS_CREAR = 3;
export const MIN_STOCK_CREAR = 100;
export const PESO_MAXIMO_G = 25000;
export const PRECIO_MINIMO = 0.1;
export const MAX_NOMBRE_CREAR = 40;
export const MAX_FOTOS_CREAR = 12;

/** Las cuatro garantías por defecto que Dropi pide activas (10 días; las tres primeras con comentario obligatorio). */
export const GARANTIAS_DROPI = [
  { name: "Incomplete order", time: "DIAS", quantity: 10, description: "Reclamar dentro de los 10 días siguientes a la entrega." },
  { name: "Malfunction", time: "DIAS", quantity: 10, description: "Reclamar dentro de los 10 días siguientes a la entrega." },
  { name: "Broken product", time: "DIAS", quantity: 10, description: "Reclamar dentro de los 10 días siguientes a la entrega." },
  { name: "Different order", time: "DIAS", quantity: 10, description: "" },
];

export interface BodegaCrear {
  /** El ID de la bodega en Dropi (una de las del proveedor, no la B280). */
  id: number;
  unidades: number;
}
export interface FotoCrear {
  /** Dirección pública de la imagen (el favorito la baja y la sube a Dropi). */
  url: string;
  nombre: string;
}

/** Todo lo que Dropi pide para publicar un producto simple y público. Se guarda en `dropi_publicaciones.datos_dropi` y, al pedir la publicación, en el cambio pendiente. */
export interface DatosCrearDropi {
  nombre: string;
  /** «Nombre del producto en la guía de envío» (el código del SKU, que despacho ve siempre igual). null = el mismo nombre. */
  nombreGuia: string | null;
  precio: number | null;
  /** Va igual al precio (decisión de Alcides, 23 oct 2026). */
  precioSugerido: number | null;
  /** Gramos. */
  peso: number | null;
  /** Centímetros. */
  largo: number | null;
  ancho: number | null;
  alto: number | null;
  /** Nombres de categorías de Dropi (el favorito los busca en `GET api/categories`). */
  categorias: string[];
  /** HTML ya limpio. */
  descripcion: string;
  descripcionApp: string;
  sku: string | null;
  codigoBarras: string | null;
  bodegas: BodegaCrear[];
  fotos: FotoCrear[];
}

/** Lo que el formulario de «Publicar en Dropi» ofrece para elegir: las categorías y las bodegas del proveedor que ya se conocen de Dropi. */
export interface OpcionesCrear {
  categorias: string[];
  bodegas: { id: number; nombre: string }[];
}

export function datosCrearVacios(): DatosCrearDropi {
  return { nombre: "", nombreGuia: null, precio: null, precioSugerido: null, peso: null, largo: null, ancho: null, alto: null, categorias: [], descripcion: "", descripcionApp: "", sku: null, codigoBarras: null, bodegas: [], fotos: [] };
}

/** El texto de un HTML sin etiquetas (para contar los 200 caracteres mínimos de la descripción). */
export function textoPlanoDropi(html: string): string {
  return String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Un nombre de categoría sin mayúsculas, acentos ni signos, para compararlo con el de Dropi. */
export const claveCategoria = (t: string) => sinAcentos(String(t ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
};
const cadena = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Lo que falta o está mal para que Dropi acepte el producto, en el orden de su formulario (vacío = en orden). Son las reglas de Dropi
 * para un producto simple y público; el servidor y la pantalla las usan tal cual.
 */
export function faltantesCrearDropi(d: DatosCrearDropi): string[] {
  const f: string[] = [];
  if (!d.nombre.trim()) f.push("Falta el nombre.");
  else if (d.nombre.length > MAX_NOMBRE_CREAR) f.push(`El nombre admite ${MAX_NOMBRE_CREAR} caracteres.`);
  if (!d.sku?.trim()) f.push("Falta el SKU (el código del producto vinculado).");
  if (d.nombreGuia !== null && d.nombreGuia.length > MAX_NOMBRE_CREAR) f.push(`El nombre de la guía admite ${MAX_NOMBRE_CREAR} caracteres.`);
  if (!(Number(d.peso) > 0)) f.push("Falta el peso (en gramos).");
  else if (Number(d.peso) > PESO_MAXIMO_G) f.push(`El peso máximo que admite Dropi es ${PESO_MAXIMO_G} g.`);
  for (const [valor, etiqueta] of [[d.largo, "el largo"], [d.ancho, "el ancho"], [d.alto, "el alto"]] as const) {
    if (!(Number(valor) > 0)) f.push(`Falta ${etiqueta} (en cm).`);
  }
  if (d.categorias.length === 0) f.push("Falta la categoría.");
  const largo = textoPlanoDropi(d.descripcion).length;
  if (largo === 0) f.push("Falta la descripción.");
  else if (largo < MIN_DESCRIPCION_CREAR) f.push(`La descripción necesita al menos ${MIN_DESCRIPCION_CREAR} caracteres (tiene ${largo}).`);
  if (!(Number(d.precio) >= PRECIO_MINIMO)) f.push(`Falta el precio de venta (mínimo ${PRECIO_MINIMO}).`);
  if (!(Number(d.precioSugerido) >= PRECIO_MINIMO)) f.push(`Falta el precio sugerido (mínimo ${PRECIO_MINIMO}).`);
  else if (Number(d.precio) > Number(d.precioSugerido)) f.push("El precio sugerido no puede ser menor que el precio de venta.");
  if (!d.bodegas.some((b) => b.unidades >= MIN_STOCK_CREAR)) f.push(`Un producto público necesita una bodega con al menos ${MIN_STOCK_CREAR} unidades.`);
  if (d.fotos.length < MIN_FOTOS_CREAR) f.push(`Un producto público necesita al menos ${MIN_FOTOS_CREAR} imágenes (tiene ${d.fotos.length}).`);
  return f;
}

/** Limpia lo que llega del navegador o de la base (nunca lanza): números como números, textos recortados, listas con forma válida. */
export function normalizarDatosCrear(crudo: unknown): DatosCrearDropi {
  const r = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Obj;
  const bodegas: BodegaCrear[] = [];
  for (const b of (Array.isArray(r.bodegas) ? r.bodegas : []).slice(0, 10)) {
    const id = Math.trunc(Number((b as Obj)?.id));
    const unidades = Math.trunc(Number((b as Obj)?.unidades));
    if (Number.isInteger(id) && id > 0 && Number.isInteger(unidades) && unidades >= 0 && unidades < 10_000_000 && !bodegas.some((x) => x.id === id)) bodegas.push({ id, unidades });
  }
  const fotos: FotoCrear[] = [];
  for (const f of (Array.isArray(r.fotos) ? r.fotos : []).slice(0, MAX_FOTOS_CREAR)) {
    const url = cadena((f as Obj)?.url, 600);
    if (!/^https:\/\/[^\s]+$/i.test(url) || fotos.some((x) => x.url === url)) continue;
    fotos.push({ url, nombre: cadena((f as Obj)?.nombre, 160) || url.split("/").pop() || "foto.jpg" });
  }
  const categorias = [...new Set((Array.isArray(r.categorias) ? r.categorias : []).map((c) => cadena(c, 80)).filter(Boolean))].slice(0, 10);
  const dinero = (v: unknown) => {
    const n = num(v);
    return n === null ? null : Math.round(n * 100) / 100;
  };
  const medida = (v: unknown) => {
    const n = num(v);
    return n === null ? null : Math.round(n * 1000) / 1000;
  };
  return {
    nombre: cadena(r.nombre, 300),
    nombreGuia: cadena(r.nombreGuia, 300) || null,
    precio: dinero(r.precio),
    precioSugerido: dinero(r.precioSugerido),
    peso: medida(r.peso),
    largo: medida(r.largo),
    ancho: medida(r.ancho),
    alto: medida(r.alto),
    categorias,
    descripcion: typeof r.descripcion === "string" ? r.descripcion.slice(0, 100_000) : "",
    descripcionApp: typeof r.descripcionApp === "string" ? r.descripcionApp.slice(0, 100_000) : "",
    sku: cadena(r.sku, 120) || null,
    codigoBarras: cadena(r.codigoBarras, 60) || null,
    bodegas,
    fotos,
  };
}

/**
 * Busca cada categoría pedida (por su nombre) entre las de Dropi (`GET api/categories`: `{ id, name, parent_category }`) y devuelve
 * los objetos tal cual los manda la pantalla. Error si alguna no existe en Dropi.
 */
export function resolverCategorias(nombres: string[], lista: Obj[]): { categorias: Obj[] } | { error: string } {
  const porClave = new Map<string, Obj>();
  for (const c of lista) porClave.set(claveCategoria(String(c.name ?? "")), c);
  const categorias: Obj[] = [];
  for (const n of nombres) {
    const c = porClave.get(claveCategoria(n));
    if (!c) return { error: `Dropi no tiene la categoría «${n}».` };
    categorias.push({ id: c.id, name: c.name, parent_category: c.parent_category ?? 0 });
  }
  return { categorias };
}

/**
 * El cuerpo del `POST api/products` que crea el producto: los mismos campos y en el mismo orden que el guardado de la pantalla de Dropi
 * para un producto simple y público. `bodegasProveedor` = las bodegas del usuario (`GET api/users/<id>` › `objects.warehouses`);
 * `categoriasDropi` = `GET api/categories`. Error si falta algo de lo que Dropi exige o si una bodega no es del proveedor.
 */
export function armarProductoCrear(d: DatosCrearDropi, usuarioId: number, bodegasProveedor: Obj[], categoriasDropi: Obj[]): { cuerpo: Obj } | { error: string } {
  const falta = faltantesCrearDropi(d);
  if (falta.length) return { error: falta[0] };
  const cats = resolverCategorias(d.categorias, categoriasDropi);
  if ("error" in cats) return cats;
  const bodegas: Obj[] = [];
  for (const b of d.bodegas) {
    const w = bodegasProveedor.find((x) => Number(x.id) === b.id);
    if (!w) return { error: `La bodega ${b.id} no es de ECOMFIVE en Dropi: no se le puede poner stock desde aquí.` };
    bodegas.push({ warehouse_id: w.id, fullName: `${w.name}(${w.address})`, stock: b.unidades, city: w.city, warehouse_white_brand: !!w.warehouse_white_brand });
  }
  return {
    cuerpo: {
      user_id: usuarioId,
      id: null,
      name: d.nombre,
      description: d.descripcion,
      type: "SIMPLE",
      sale_price: Number(d.precio),
      suggested_price: Number(d.precioSugerido),
      privated_product: false,
      active: true,
      sku: d.sku ?? "",
      weight: Number(d.peso),
      length: Number(d.largo),
      width: Number(d.ancho),
      height: Number(d.alto),
      attribute: [],
      variations: [],
      categories: cats.categorias,
      dropi_app_description: d.descripcionApp,
      add_stock_in_return: false,
      private_product_inventories: [],
      user_profit_percentage_product: [],
      is_warehouse_white_brand: false,
      warehouselected: bodegas,
      name_in_guide: d.nombreGuia ?? "",
      shipping_method: "",
      bar_code: d.codigoBarras ?? "",
    },
  };
}

/** Lo mismo en JavaScript simple para el favorito. La prueba compara los dos. */
export const CREAR_JS = [
  "var GARANTIAS=" + JSON.stringify(GARANTIAS_DROPI) + ";",
  "function claveCat(t){return String(t==null?'':t).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}",
  "function resolverCats(ns,ls){var m={};ls.forEach(function(c){m[claveCat(c.name)]=c});var out=[];",
  "for(var i=0;i<ns.length;i++){var c=m[claveCat(ns[i])];if(!c)return{error:'Dropi no tiene la categoría «'+ns[i]+'».'};out.push({id:c.id,name:c.name,parent_category:c.parent_category!=null?c.parent_category:0})}",
  "return{categorias:out}}",
  "function nuevoProducto(d,uid,bp,cs){",
  "var rc=resolverCats(d.categorias,cs);if(rc.error)return rc;",
  "var bs=[];for(var i=0;i<d.bodegas.length;i++){var b=d.bodegas[i],w=null;bp.forEach(function(x){if(Number(x.id)===b.id)w=x});",
  "if(!w)return{error:'La bodega '+b.id+' no es de ECOMFIVE en Dropi: no se le puede poner stock desde aquí.'};",
  "bs.push({warehouse_id:w.id,fullName:w.name+'('+w.address+')',stock:b.unidades,city:w.city,warehouse_white_brand:!!w.warehouse_white_brand})}",
  "return{cuerpo:{user_id:uid,id:null,name:d.nombre,description:d.descripcion,type:'SIMPLE',sale_price:Number(d.precio),suggested_price:Number(d.precioSugerido),privated_product:false,active:true,sku:d.sku!=null?d.sku:'',weight:Number(d.peso),length:Number(d.largo),width:Number(d.ancho),height:Number(d.alto),attribute:[],variations:[],categories:rc.categorias,dropi_app_description:d.descripcionApp,add_stock_in_return:false,private_product_inventories:[],user_profit_percentage_product:[],is_warehouse_white_brand:false,warehouselected:bs,name_in_guide:d.nombreGuia!=null?d.nombreGuia:'',shipping_method:'',bar_code:d.codigoBarras!=null?d.codigoBarras:''}}}",
].join("");
